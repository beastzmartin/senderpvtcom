import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import { GrizzlyCustomerApiClient } from './GrizzlyCustomerApiClient.js';
import { GrizzlyCustomerConfigService } from './GrizzlyCustomerConfigService.js';

export interface CryptoWalletInfo {
  walletAddress: string | null;
  coin: string;
  network: string;
  networkDisplayName: string;
  automaticCreditThresholdUsd: number;
  status: 'active' | 'pending_verification' | 'stale' | 'not_configured';
  lastFetchedAt: string | null;
  lastVerifiedAt: string | null;
  warnings: string[];
}

export class GrizzlyCryptoFundingService {
  public static readonly DEFAULT_COIN = 'usdt';
  public static readonly DEFAULT_NETWORK = 'tron';
  public static readonly DEFAULT_THRESHOLD_USD = 50.0;

  /**
   * Get current configured crypto funding address & status
   */
  public static getCryptoWalletInfo(): CryptoWalletInfo {
    const db = getDatabase();
    const config = GrizzlyCustomerConfigService.getConfig(true);

    const address = config.crypto_wallet_address || null;
    const coin = (config.crypto_coin || this.DEFAULT_COIN).toUpperCase();
    const network = (config.crypto_network || this.DEFAULT_NETWORK).toLowerCase();
    const threshold = typeof config.crypto_threshold_usd === 'number' && config.crypto_threshold_usd > 0
      ? config.crypto_threshold_usd
      : this.DEFAULT_THRESHOLD_USD;

    let status: 'active' | 'pending_verification' | 'stale' | 'not_configured' = 'not_configured';
    if (address) {
      status = 'active';
      if (config.crypto_wallet_fetched_at) {
        const fetchedTime = new Date(config.crypto_wallet_fetched_at).getTime();
        const ageHours = (Date.now() - fetchedTime) / (1000 * 60 * 60);
        if (ageHours > 72) {
          status = 'stale';
        }
      }
    }

    const warnings: string[] = [
      `Official GrizzlySMS Requirement: Funds are credited automatically for amounts starting from $${threshold} USD equivalent.`,
      `Deposits below the $${threshold} USD threshold are NOT automatically credited by GrizzlySMS and require manual provider support ticket escalation.`,
      `Send only ${coin} on the ${network.toUpperCase()} (TRC-20) network. Transfers on other chains (ERC-20, BSC) will result in permanent loss of provider funds.`,
      `Financial Isolation Notice: This address funds our platform's master GrizzlySMS balance. It never credits end-user customer wallets.`
    ];

    return {
      walletAddress: address,
      coin,
      network: network === 'tron' ? 'TRC-20 (Tron)' : network.toUpperCase(),
      networkDisplayName: 'TRC-20 (Tron Network)',
      automaticCreditThresholdUsd: threshold,
      status,
      lastFetchedAt: config.crypto_wallet_fetched_at || null,
      lastVerifiedAt: config.crypto_wallet_fetched_at || null,
      warnings
    };
  }

  /**
   * Fetch or refresh the static crypto deposit address directly from GrizzlySMS
   */
  public static async refreshCryptoWallet(params?: {
    coin?: string;
    network?: string;
    apiKey?: string;
  }): Promise<{ success: boolean; walletInfo?: CryptoWalletInfo; error?: string }> {
    const coin = (params?.coin || this.DEFAULT_COIN).toLowerCase();
    const network = (params?.network || this.DEFAULT_NETWORK).toLowerCase();

    const result = await GrizzlyCustomerApiClient.getStaticCryptoWallet({
      apiKey: params?.apiKey,
      coin,
      network
    });

    if (!result.success || !result.walletAddress) {
      return {
        success: false,
        error: result.error || 'Failed to retrieve static crypto deposit address from GrizzlySMS'
      };
    }

    const db = getDatabase();
    const nowIso = new Date().toISOString();

    // 1. Update active customer config
    db.prepare(`
      UPDATE grizzly_customer_config
      SET crypto_wallet_address = ?,
          crypto_coin = ?,
          crypto_network = ?,
          crypto_wallet_fetched_at = ?,
          crypto_wallet_status = 'active',
          updated_at = datetime('now')
      WHERE id = 'default'
    `).run(result.walletAddress, coin, network, nowIso);

    // 2. Persist to crypto wallet history table
    const walletId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO grizzly_crypto_wallets (
        id, wallet_address, coin, network, threshold_usd, status, raw_response, last_verified_at, created_at
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(
      walletId,
      result.walletAddress,
      coin,
      network,
      this.DEFAULT_THRESHOLD_USD,
      result.rawResponse,
      nowIso,
      nowIso
    );

    // 3. Update sync job status
    db.prepare(`
      UPDATE grizzly_sync_jobs
      SET status = 'completed',
          last_attempted_at = datetime('now'),
          last_successful_at = datetime('now'),
          records_updated = records_updated + 1,
          sanitized_response = ?,
          error_message = NULL,
          updated_at = datetime('now')
      WHERE job_type = 'crypto_wallet'
    `).run(result.rawResponse);

    return {
      success: true,
      walletInfo: this.getCryptoWalletInfo()
    };
  }

  /**
   * Update the automatic credit threshold (default $50 USD)
   */
  public static updateThreshold(thresholdUsd: number): { success: boolean; threshold: number } {
    if (typeof thresholdUsd !== 'number' || isNaN(thresholdUsd) || thresholdUsd <= 0) {
      throw new Error('Threshold must be a positive numerical amount in USD.');
    }

    const db = getDatabase();
    db.prepare(`
      UPDATE grizzly_customer_config
      SET crypto_threshold_usd = ?,
          updated_at = datetime('now')
      WHERE id = 'default'
    `).run(thresholdUsd);

    return { success: true, threshold: thresholdUsd };
  }

  /**
   * Get historical crypto deposit addresses
   */
  public static getWalletHistory(limit = 20): any[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM grizzly_crypto_wallets
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }
}

