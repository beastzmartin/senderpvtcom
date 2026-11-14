import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';
import { WalletService } from '../walletService.js';
import { getSocketIO } from '../../socket/socketManager.js';
import { ProviderRegistry } from './ProviderRegistry.js';
import { VirtualNumberPricingService } from './VirtualNumberPricingService.js';
import {
  NumberAllocationRequest,
  NumberAllocationResult,
  NumberRenewalResult,
  NumberReleaseResult,
  RentalDuration,
  NumberType
} from './types.js';

export class VirtualNumberService {
  private static instance: VirtualNumberService | null = null;
  private providerRegistry: ProviderRegistry;
  private pricingService: VirtualNumberPricingService;
  private walletService: WalletService;

  private constructor() {
    this.providerRegistry = ProviderRegistry.getInstance();
    this.pricingService = VirtualNumberPricingService.getInstance();
    this.walletService = WalletService.getInstance();
  }

  public static getInstance(): VirtualNumberService {
    if (!VirtualNumberService.instance) {
      VirtualNumberService.instance = new VirtualNumberService();
    }
    return VirtualNumberService.instance;
  }

  /**
   * 1. List supported countries for virtual number marketplace
   */
  public listCountries() {
    const db = getDatabase();
    return db
      .prepare(`
        SELECT iso_code, name, dial_code, flag_emoji, continent, is_active,
          (SELECT COUNT(*) FROM virtual_number_inventory WHERE virtual_number_inventory.country_code = virtual_number_countries.iso_code AND status = 'available') as available_count
        FROM virtual_number_countries
        WHERE is_active = 1
        ORDER BY available_count DESC, name ASC
      `)
      .all();
  }

  /**
   * 2. Search available numbers with dynamic markup pricing
   */
  public searchNumbers(filter: {
    countryCode?: string;
    numberType?: string;
    capabilities?: string[];
    whatsappCompatible?: boolean;
    searchQuery?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }) {
    const db = getDatabase();
    const {
      countryCode,
      numberType,
      capabilities,
      whatsappCompatible,
      searchQuery,
      userId,
      limit = 20,
      offset = 0
    } = filter;

    const conditions: string[] = ["status = 'available'"];
    const params: any[] = [];

    if (countryCode && countryCode !== 'all') {
      conditions.push('country_code = ?');
      params.push(countryCode.toUpperCase());
    }

    if (numberType && numberType !== 'all') {
      conditions.push('number_type = ?');
      params.push(numberType);
    }

    if (whatsappCompatible) {
      conditions.push('whatsapp_compatible = 1');
    }

    if (searchQuery) {
      conditions.push('(phone_number LIKE ? OR country_code LIKE ?)');
      params.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = (
      db.prepare(`SELECT COUNT(*) as count FROM virtual_number_inventory ${whereClause}`).get(...params) as { count: number }
    ).count;

    const rows = db
      .prepare(`
        SELECT vni.*, vnc.name as country_name, vnc.flag_emoji, vnc.dial_code
        FROM virtual_number_inventory vni
        LEFT JOIN virtual_number_countries vnc ON vni.country_code = vnc.iso_code
        ${whereClause}
        ORDER BY vni.created_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as any[];

    // Calculate customer-facing price with administrator markup for each number
    const numbersWithPricing = rows.map((row) => {
      let parsedCaps: string[] = [];
      try {
        parsedCaps = JSON.parse(row.capabilities || '[]');
      } catch {}

      const pricing = this.pricingService.calculatePrice({
        providerId: row.provider_id,
        countryCode: row.country_code,
        numberType: row.number_type,
        rentalDuration: 'monthly',
        durationDays: 30,
        rawProviderBaseCost: row.provider_base_cost,
        rawActivationFee: row.activation_fee,
        userId
      });

      return {
        id: row.id,
        phoneNumber: row.phone_number,
        countryCode: row.country_code,
        countryName: row.country_name,
        flagEmoji: row.flag_emoji || '🌐',
        dialCode: row.dial_code,
        numberType: row.number_type,
        capabilities: parsedCaps,
        whatsappCompatible: Boolean(row.whatsapp_compatible),
        otpCompatible: Boolean(row.otp_compatible),
        pricing: {
          activationFee: pricing.activationFee,
          monthlyPrice: pricing.rentalPrice,
          totalFirstCharge: pricing.totalFirstCharge,
          renewalPrice: pricing.renewalPrice,
          currency: 'INR'
        },
        status: row.status
      };
    });

    return {
      total,
      limit,
      offset,
      numbers: numbersWithPricing
    };
  }

  /**
   * 3. Purchase / Allocate a Virtual Number using the centralized wallet
   */
  public async purchaseNumber(params: {
    userId: string;
    workspaceId?: string;
    inventoryId: string;
    rentalDuration?: RentalDuration;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; rentalId?: string; orderId?: string; phoneNumber?: string; message?: string }> {
    const db = getDatabase();
    const { userId, workspaceId, inventoryId, rentalDuration = 'monthly', idempotencyKey } = params;

    const key = idempotencyKey || `ord_${crypto.randomUUID()}`;

    // Prevent duplicate submission via idempotency key
    const existingOrder = db.prepare('SELECT * FROM virtual_number_orders WHERE idempotency_key = ?').get(key) as any;
    if (existingOrder && existingOrder.status === 'allocated') {
      const existingRental = db.prepare('SELECT id FROM virtual_number_rentals WHERE order_id = ?').get(existingOrder.id) as any;
      return {
        success: true,
        rentalId: existingRental?.id,
        orderId: existingOrder.id,
        phoneNumber: existingOrder.phone_number,
        message: 'Order already processed.'
      };
    }

    // 1. Fetch Inventory Item
    const item = db.prepare('SELECT * FROM virtual_number_inventory WHERE id = ?').get(inventoryId) as any;
    if (!item) {
      throw new Error('Selected virtual number not found.');
    }

    if (item.status !== 'available') {
      throw new Error('This number is no longer available. Please select another number.');
    }

    // 2. Calculate Pricing
    let durationDays = 30;
    if (rentalDuration === 'daily') durationDays = 1;
    else if (rentalDuration === 'weekly') durationDays = 7;
    else if (rentalDuration === 'annual') durationDays = 365;

    const pricing = this.pricingService.calculatePrice({
      providerId: item.provider_id,
      countryCode: item.country_code,
      numberType: item.number_type,
      rentalDuration,
      durationDays,
      rawProviderBaseCost: item.provider_base_cost,
      rawActivationFee: item.activation_fee,
      userId,
      workspaceId
    });

    const totalCost = pricing.totalFirstCharge;

    // 3. Check Wallet Balance
    const wallet = this.walletService.getOrCreateWallet(userId);
    if (wallet.balance < totalCost) {
      throw new Error(
        `Insufficient wallet balance. Required: ₹${totalCost.toFixed(2)}, Available: ₹${wallet.balance.toFixed(2)}. Please top up your wallet to complete purchase.`
      );
    }

    const orderId = `ord_${crypto.randomUUID()}`;

    // 4. Create Pending Order Record
    db.prepare(`
      INSERT INTO virtual_number_orders (
        id, user_id, workspace_id, inventory_id, provider_id, phone_number,
        country_code, rental_duration, duration_days, activation_fee, rental_fee,
        tax_amount, total_amount, currency, idempotency_key, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, 'INR', ?, 'pending')
    `).run(
      orderId,
      userId,
      workspaceId || null,
      inventoryId,
      item.provider_id,
      item.phone_number,
      item.country_code,
      rentalDuration,
      durationDays,
      pricing.activationFee,
      pricing.rentalPrice,
      totalCost,
      key
    );

    // Temporarily mark inventory as reserved
    db.prepare("UPDATE virtual_number_inventory SET status = 'reserved', reserved_for_user_id = ? WHERE id = ?").run(userId, inventoryId);

    // 5. Request Number Allocation from Provider Adapter
    const providerAdapter = this.providerRegistry.getProvider(item.provider_id);
    let allocResult: NumberAllocationResult;

    try {
      allocResult = await providerAdapter.allocateNumber({
        orderId,
        userId,
        workspaceId,
        countryCode: item.country_code,
        numberType: item.number_type,
        specificNumber: item.phone_number,
        inventoryId,
        rentalDuration,
        durationDays
      });
    } catch (err: any) {
      // Revert inventory reservation
      db.prepare("UPDATE virtual_number_inventory SET status = 'available', reserved_for_user_id = NULL WHERE id = ?").run(inventoryId);
      db.prepare("UPDATE virtual_number_orders SET status = 'failed', failure_reason = ? WHERE id = ?").run(err.message, orderId);
      throw new Error(`Provider allocation failed: ${err.message}. Your wallet was NOT charged.`);
    }

    if (!allocResult || !allocResult.success) {
      db.prepare("UPDATE virtual_number_inventory SET status = 'available', reserved_for_user_id = NULL WHERE id = ?").run(inventoryId);
      db.prepare("UPDATE virtual_number_orders SET status = 'failed', failure_reason = ? WHERE id = ?").run(allocResult?.error || 'Allocation refused', orderId);
      throw new Error(`Number allocation failed: ${allocResult?.error || 'Unknown error'}. Your wallet was NOT charged.`);
    }

    // 6. Provider Allocation Confirmed -> Atomically Deduct Funds from Central Wallet
    const deductResult = this.walletService.deduct(
      userId,
      totalCost,
      'usage_deduction',
      `Virtual Number Purchase: ${item.phone_number} (${rentalDuration} rental)`,
      {
        referenceId: orderId,
        customData: {
          virtualNumber: item.phone_number,
          countryCode: item.country_code,
          orderId,
          rentalDuration,
          pricing
        }
      }
    );

    const rentalId = `vnr_${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();
    const expiresAt = allocResult.expirationDate || new Date(Date.now() + durationDays * 86400000).toISOString();
    const renewalDate = allocResult.renewalDate || new Date(new Date(expiresAt).getTime() - 2 * 86400000).toISOString();

    // 7. Store Active Rental & Update Order and Inventory
    const finalizeTx = db.transaction(() => {
      // Create Rental
      db.prepare(`
        INSERT INTO virtual_number_rentals (
          id, user_id, workspace_id, inventory_id, provider_id, order_id,
          phone_number, country_code, number_type, capabilities, whatsapp_compatible,
          rental_duration, duration_days, purchased_at, activated_at, expires_at,
          renewal_date, renewal_price, auto_renew, status, total_charges_accrued
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, 1, 'active', ?
        )
      `).run(
        rentalId,
        userId,
        workspaceId || null,
        inventoryId,
        item.provider_id,
        orderId,
        item.phone_number,
        item.country_code,
        item.number_type,
        item.capabilities,
        item.whatsapp_compatible,
        rentalDuration,
        durationDays,
        nowIso,
        nowIso,
        expiresAt,
        renewalDate,
        pricing.renewalPrice,
        totalCost
      );

      // Finalize Order
      db.prepare(`
        UPDATE virtual_number_orders
        SET status = 'allocated', wallet_transaction_id = ?, provider_order_ref = ?
        WHERE id = ?
      `).run(deductResult.transactionId, allocResult.providerNumberRef || null, orderId);

      // Update Inventory Status
      db.prepare("UPDATE virtual_number_inventory SET status = 'allocated', reserved_for_user_id = NULL WHERE id = ?").run(inventoryId);
    });

    finalizeTx();

    // 8. Broadcast Real-Time Socket Event
    try {
      getSocketIO()?.to(`user:${userId}`).emit('virtual_number:allocated', {
        rentalId,
        orderId,
        phoneNumber: item.phone_number,
        expiresAt,
        newBalance: deductResult.newBalance
      });
    } catch {}

    return {
      success: true,
      rentalId,
      orderId,
      phoneNumber: item.phone_number,
      message: 'Virtual number successfully purchased and activated!'
    };
  }

  /**
   * 4. List customer's active and historical virtual number rentals
   */
  public getCustomerRentals(userId: string, status?: string) {
    const db = getDatabase();
    let query = `
      SELECT r.*, c.name as country_name, c.flag_emoji, c.dial_code
      FROM virtual_number_rentals r
      LEFT JOIN virtual_number_countries c ON r.country_code = c.iso_code
      WHERE r.user_id = ?
    `;
    const params: any[] = [userId];

    if (status && status !== 'all') {
      query += ' AND r.status = ?';
      params.push(status);
    }

    query += ' ORDER BY r.created_at DESC';

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((r) => {
      let capabilities: string[] = [];
      try {
        capabilities = JSON.parse(r.capabilities || '[]');
      } catch {}

      const expiresDate = new Date(r.expires_at);
      const now = new Date();
      const diffDays = Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

      return {
        id: r.id,
        phoneNumber: r.phone_number,
        countryCode: r.country_code,
        countryName: r.country_name,
        flagEmoji: r.flag_emoji || '🌐',
        numberType: r.number_type,
        capabilities,
        whatsappCompatible: Boolean(r.whatsapp_compatible),
        rentalDuration: r.rental_duration,
        purchasedAt: r.purchased_at,
        activatedAt: r.activated_at,
        expiresAt: r.expires_at,
        renewalDate: r.renewal_date,
        renewalPrice: r.renewal_price,
        autoRenew: Boolean(r.auto_renew),
        status: r.status,
        daysRemaining: Math.max(0, diffDays),
        isExpiringSoon: diffDays <= 3 && diffDays > 0,
        totalCharges: r.total_charges_accrued
      };
    });
  }

  /**
   * 5. Manual or Automatic Number Renewal
   */
  public async renewRental(userId: string, rentalId: string, durationDays: number = 30) {
    const db = getDatabase();
    const rental = db.prepare('SELECT * FROM virtual_number_rentals WHERE id = ? AND user_id = ?').get(rentalId, userId) as any;

    if (!rental) {
      throw new Error('Virtual number rental not found.');
    }

    if (rental.status === 'released') {
      throw new Error('Cannot renew a released number.');
    }

    const renewalFee = Number(rental.renewal_price || 100.0);

    // Validate Wallet
    const wallet = this.walletService.getOrCreateWallet(userId);
    if (wallet.balance < renewalFee) {
      throw new Error(
        `Insufficient wallet balance for renewal. Required: ₹${renewalFee.toFixed(2)}, Available: ₹${wallet.balance.toFixed(2)}. Please top up your wallet.`
      );
    }

    // Call Provider Adapter
    const providerAdapter = this.providerRegistry.getProvider(rental.provider_id);
    let renewalResult: NumberRenewalResult;

    try {
      renewalResult = await providerAdapter.renewNumber({
        rentalId,
        userId,
        providerNumberRef: rental.inventory_id || rental.phone_number,
        phoneNumber: rental.phone_number,
        durationDays
      });
    } catch (err: any) {
      throw new Error(`Provider renewal failed: ${err.message}`);
    }

    if (!renewalResult.success) {
      throw new Error(`Renewal failed from telecom provider: ${renewalResult.error || 'Unknown error'}`);
    }

    // Deduct renewal charge from wallet
    const deductRes = this.walletService.deduct(
      userId,
      renewalFee,
      'renewal_charge',
      `Virtual Number Renewal: ${rental.phone_number} (+${durationDays} days)`,
      {
        referenceId: rentalId,
        customData: { phoneNumber: rental.phone_number, durationDays, renewalFee }
      }
    );

    const currentExpires = new Date(rental.expires_at);
    const newExpires = renewalResult.newExpirationDate
      ? new Date(renewalResult.newExpirationDate)
      : new Date(currentExpires.getTime() + durationDays * 86400000);

    const newRenewalDate = new Date(newExpires.getTime() - 2 * 86400000);

    db.transaction(() => {
      db.prepare(`
        UPDATE virtual_number_rentals
        SET expires_at = ?, renewal_date = ?, status = 'active', total_charges_accrued = total_charges_accrued + ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newExpires.toISOString(), newRenewalDate.toISOString(), renewalFee, rentalId);

      db.prepare(`
        INSERT INTO virtual_number_renewals (
          id, rental_id, user_id, phone_number, renewal_fee, currency,
          wallet_transaction_id, provider_renewal_ref, status, previous_expires_at, new_expires_at
        ) VALUES (?, ?, ?, ?, ?, 'INR', ?, ?, 'successful', ?, ?)
      `).run(
        `ren_${crypto.randomUUID()}`,
        rentalId,
        userId,
        rental.phone_number,
        renewalFee,
        deductRes.transactionId,
        renewalResult.providerRenewalRef || null,
        rental.expires_at,
        newExpires.toISOString()
      );
    })();

    return {
      success: true,
      newExpiresAt: newExpires.toISOString(),
      newRenewalDate: newRenewalDate.toISOString(),
      charged: renewalFee,
      newBalance: deductRes.newBalance
    };
  }

  /**
   * 6. Toggle Automatic Renewal for a number
   */
  public toggleAutoRenew(userId: string, rentalId: string, autoRenew: boolean) {
    const db = getDatabase();
    const res = db.prepare(`
      UPDATE virtual_number_rentals
      SET auto_renew = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(autoRenew ? 1 : 0, rentalId, userId);

    if (res.changes === 0) {
      throw new Error('Virtual number not found.');
    }

    return { success: true, autoRenew };
  }

  /**
   * 7. Release / Cancel a Virtual Number back to provider pool
   */
  public async releaseRental(userId: string, rentalId: string) {
    const db = getDatabase();
    const rental = db.prepare('SELECT * FROM virtual_number_rentals WHERE id = ? AND user_id = ?').get(rentalId, userId) as any;

    if (!rental) {
      throw new Error('Virtual number rental not found.');
    }

    if (rental.status === 'released') {
      return { success: true, message: 'Number is already released.' };
    }

    const providerAdapter = this.providerRegistry.getProvider(rental.provider_id);
    try {
      await providerAdapter.releaseNumber({
        rentalId,
        providerNumberRef: rental.inventory_id || rental.phone_number,
        phoneNumber: rental.phone_number
      });
    } catch (err) {
      console.warn(`[Virtual Number] Release warning on provider ${rental.provider_id}:`, err);
    }

    db.transaction(() => {
      db.prepare("UPDATE virtual_number_rentals SET status = 'released', auto_renew = 0, updated_at = datetime('now') WHERE id = ?").run(rentalId);
      if (rental.inventory_id) {
        db.prepare("UPDATE virtual_number_inventory SET status = 'available', reserved_for_user_id = NULL WHERE id = ?").run(rental.inventory_id);
      }
    })();

    return { success: true, message: 'Number successfully released.' };
  }

  /**
   * 8. Fetch customer's purchase order history
   */
  public getOrderHistory(userId: string, limit: number = 30) {
    const db = getDatabase();
    return db
      .prepare(`
        SELECT o.*, c.name as country_name, c.flag_emoji
        FROM virtual_number_orders o
        LEFT JOIN virtual_number_countries c ON o.country_code = c.iso_code
        WHERE o.user_id = ?
        ORDER BY o.created_at DESC
        LIMIT ?
      `)
      .all(userId, limit);
  }

  /**
   * 9. Customer Analytics & Number Management Dashboard
   */
  public getCustomerDashboardAnalytics(userId: string) {
    const db = getDatabase();

    const totals = db
      .prepare(`
        SELECT
          COUNT(*) as total_purchased,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_numbers,
          SUM(CASE WHEN status = 'renewal_due' OR (status = 'active' AND julianday(expires_at) - julianday('now') <= 3) THEN 1 ELSE 0 END) as expiring_soon,
          SUM(total_charges_accrued) as total_rental_expenditure
        FROM virtual_number_rentals
        WHERE user_id = ?
      `)
      .get(userId) as any;

    const messagesCount = (
      db.prepare('SELECT COUNT(*) as count FROM virtual_number_messages WHERE user_id = ?').get(userId) as { count: number }
    ).count;

    const callsCount = (
      db.prepare('SELECT COUNT(*) as count FROM virtual_number_calls WHERE user_id = ?').get(userId) as { count: number }
    ).count;

    const wallet = this.walletService.getOrCreateWallet(userId);

    return {
      totalPurchased: totals?.total_purchased || 0,
      activeNumbers: totals?.active_numbers || 0,
      expiringSoon: totals?.expiring_soon || 0,
      totalRentalExpenditure: totals?.total_rental_expenditure || 0.0,
      smsReceivedCount: messagesCount,
      voiceCallsCount: callsCount,
      walletBalance: wallet.balance,
      currency: wallet.currency
    };
  }
}
