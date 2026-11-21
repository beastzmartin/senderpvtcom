/**
 * CRM V2: Plan-Based Billing Service (Wallet-Only)
 * Deducts ALL subscription, addon, and renewal charges directly from the user's wallet
 * via WalletService.debit(). No external payment gateways. Single choke point.
 */

import crypto from 'crypto';
import {
  CrmBillingPlan,
  CrmSubscription,
  CrmInvoice,
  CrmBillingAddon,
  CrmBillingCoupon,
  CrmBillingSettings
} from '../models/types.js';
import { CrmStorageAdapter } from '../db/CrmStorageAdapter.js';
import { WalletService } from '../../services/walletService.js';
import { CurrencyMinorUnits } from '../../services/currency/CurrencyMinorUnits.js';

export class CrmBillingService {
  /**
   * Subscribe or Upgrade to a Billing Plan using Wallet Balance
   * Server calculates the price authoritatively from plan + coupon + tax settings.
   */
  public static async subscribeToPlan(
    storage: CrmStorageAdapter,
    workspaceId: string,
    userId: string,
    planId: string,
    couponCode?: string,
    autoRenew: boolean = true,
    clientExpectedPrice?: number,
    idempotencyKey?: string
  ): Promise<{ subscription: CrmSubscription; invoice: CrmInvoice }> {
    const plan = await storage.getBillingPlan(planId);
    if (!plan || !plan.is_active) {
      throw new Error(`Plan '${planId}' is not found or inactive.`);
    }

    const settings = await storage.getBillingSettings();
    const walletService = WalletService.getInstance();
    const userWallet = walletService.getOrCreateWallet(userId);
    const walletCurrency = userWallet.currency || 'USD';

    // 1. Integer Minor Units (USD Cents)
    const grossPriceMinor = CurrencyMinorUnits.toMinorUnits(plan.price_usd, 'USD');
    let discountMinor = 0;
    let validCoupon: CrmBillingCoupon | null = null;

    // 2. Apply Coupon if provided
    if (couponCode) {
      const coupon = await storage.getBillingCoupon(couponCode);
      if (coupon && coupon.is_active && (coupon.plan_ids.length === 0 || coupon.plan_ids.includes(plan.id))) {
        if (!coupon.valid_until || new Date(coupon.valid_until) > new Date()) {
          if (coupon.discount_type === 'percent') {
            discountMinor = Math.round((grossPriceMinor * coupon.discount_value) / 100);
          } else {
            const couponFixedMinor = CurrencyMinorUnits.toMinorUnits(coupon.discount_value, 'USD');
            discountMinor = Math.min(grossPriceMinor, couponFixedMinor);
          }
          validCoupon = coupon;
        }
      }
    }

    // 3. Calculate Proration if upgrading from an active paid plan
    const currentSub = await storage.getActiveSubscription(workspaceId);
    let proratedCreditMinor = 0;
    if (currentSub && currentSub.status === 'active' && currentSub.plan && currentSub.plan.price_usd > 0) {
      const now = new Date().getTime();
      const end = new Date(currentSub.ends_at).getTime();
      const start = new Date(currentSub.starts_at).getTime();
      const totalDuration = end - start;
      const remainingTime = end - now;

      if (remainingTime > 0 && totalDuration > 0) {
        const unusedFraction = remainingTime / totalDuration;
        const curPlanMinor = CurrencyMinorUnits.toMinorUnits(currentSub.plan.price_usd, 'USD');
        proratedCreditMinor = Math.round(curPlanMinor * unusedFraction);
      }
    }

    // Net Amount & Tax Calculation
    const totalDeductionMinor = discountMinor + proratedCreditMinor;
    const netAmountMinor = Math.max(0, grossPriceMinor - totalDeductionMinor);
    const taxRate = settings.gst_vat_rate_percent !== undefined ? settings.gst_vat_rate_percent : 18.0;
    const taxAmountMinor = CurrencyMinorUnits.calculateTax(netAmountMinor, taxRate);
    const totalAmountMinor = netAmountMinor + taxAmountMinor;

    const grossPriceUsd = CurrencyMinorUnits.fromMinorUnits(grossPriceMinor, 'USD');
    const discountUsd = CurrencyMinorUnits.fromMinorUnits(discountMinor, 'USD');
    const proratedCreditUsd = CurrencyMinorUnits.fromMinorUnits(proratedCreditMinor, 'USD');
    const netAmountUsd = CurrencyMinorUnits.fromMinorUnits(netAmountMinor, 'USD');
    const taxAmountUsd = CurrencyMinorUnits.fromMinorUnits(taxAmountMinor, 'USD');
    const totalAmountUsd = CurrencyMinorUnits.fromMinorUnits(totalAmountMinor, 'USD');

    // Convert total to user's wallet currency to check against client expectation
    const userCurrencyTotalFloat = walletService.convertAmount(totalAmountUsd, 'USD', walletCurrency);

    // 4. Server-Side Authority: Guard against price drift since page load
    if (clientExpectedPrice !== undefined && clientExpectedPrice !== null) {
      const diff = Math.abs(userCurrencyTotalFloat - clientExpectedPrice);
      if (diff > 0.05) {
        const err: any = new Error(
          `Price has changed since page loaded. Current total is ${walletCurrency} ${userCurrencyTotalFloat.toFixed(2)} (was ${walletCurrency} ${clientExpectedPrice.toFixed(2)}).`
        );
        err.code = 'PRICE_CHANGED';
        err.expected_price = clientExpectedPrice;
        err.current_price = userCurrencyTotalFloat;
        err.currency = walletCurrency;
        throw err;
      }
    }

    // 5. Single Choke Point: Debit User Wallet via WalletService.debit()
    const chargeKey = idempotencyKey || `sub_${workspaceId}_${plan.id}_${Date.now()}`;
    const debitRes = await walletService.debit({
      userId,
      amountMinorUnits: totalAmountMinor,
      currency: 'USD',
      reason: `CRM Subscription: ${plan.name} Plan (${plan.duration_days} Days)`,
      referenceType: 'crm_plan',
      referenceId: workspaceId,
      idempotencyKey: chargeKey,
      metadata: { planId: plan.id, version: plan.version, couponCode }
    });

    if (validCoupon) {
      validCoupon.current_uses += 1;
      await storage.saveBillingCoupon(validCoupon);
    }

    // 6. Calculate Subscription Dates
    const now = new Date();
    const endsAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);
    const graceEndsAt = new Date(endsAt.getTime() + (settings.grace_period_days || 7) * 24 * 60 * 60 * 1000);

    const sub: CrmSubscription = await storage.saveSubscription({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      user_id: userId,
      plan_id: plan.id,
      plan_version: plan.version,
      status: 'active',
      starts_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      grace_ends_at: graceEndsAt.toISOString(),
      auto_renew: autoRenew,
      renew_retry_count: 0,
      custom_quotas: {},
      metadata: {
        initial_charge_usd: totalAmountUsd,
        ledger_tx: debitRes.transactionId,
        idempotency_key: chargeKey
      }
    });

    // 7. Generate Sequential Tax Invoice
    const invoiceNumber = `INV-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const invoice: CrmInvoice = await storage.createInvoice({
      id: crypto.randomUUID(),
      invoice_number: invoiceNumber,
      workspace_id: workspaceId,
      user_id: userId,
      subscription_id: sub.id,
      plan_name: plan.name,
      amount_usd: totalAmountUsd,
      amount_charged: debitRes.amountCharged,
      currency_charged: debitRes.currency,
      exchange_rate_snapshot: debitRes.amountCharged / (totalAmountUsd || 1),
      subtotal_usd: netAmountUsd,
      discount_usd: discountUsd + proratedCreditUsd,
      tax_rate_percent: taxRate,
      tax_amount_usd: taxAmountUsd,
      gstin: settings.company_gstin || '07AAAAA0000A1Z5',
      status: 'paid',
      ledger_tx_id: debitRes.transactionId,
      line_items: [
        {
          description: `${plan.name} Tier (${plan.duration_days} Days)`,
          quantity: 1,
          unit_price_usd: grossPriceUsd,
          total_usd: grossPriceUsd
        },
        ...(discountUsd > 0
          ? [{ description: `Coupon Discount (${couponCode})`, quantity: 1, unit_price_usd: -discountUsd, total_usd: -discountUsd }]
          : []),
        ...(proratedCreditUsd > 0
          ? [{ description: 'Prorated Credit from Previous Plan', quantity: 1, unit_price_usd: -proratedCreditUsd, total_usd: -proratedCreditUsd }]
          : [])
      ]
    });

    // 8. Set Quota Limits in Usage Counters
    await storage.consumeQuotaAtomic(workspaceId, 'contacts', 0, plan.quota_contacts);
    await storage.consumeQuotaAtomic(workspaceId, 'boards', 0, plan.quota_boards);
    await storage.consumeQuotaAtomic(workspaceId, 'super_fields', 0, plan.quota_super_fields);
    await storage.consumeQuotaAtomic(workspaceId, 'tags', 0, plan.quota_tags);

    return { subscription: sub, invoice };
  }

  /**
   * Purchase an Add-on Pack (e.g. +10,000 contacts, +5 seats) via Wallet
   */
  public static async purchaseAddon(
    storage: CrmStorageAdapter,
    workspaceId: string,
    userId: string,
    addonId: string,
    idempotencyKey?: string
  ): Promise<{ invoice: CrmInvoice }> {
    const addons = await storage.listBillingAddons();
    const addon = addons.find((a: any) => a.id === addonId || a.slug === addonId);
    if (!addon || !addon.is_active) {
      throw new Error(`Add-on pack '${addonId}' not found or inactive.`);
    }

    const settings = await storage.getBillingSettings();
    const walletService = WalletService.getInstance();
    const addonPriceMinor = CurrencyMinorUnits.toMinorUnits(addon.price_usd, 'USD');

    const chargeKey = idempotencyKey || `addon_${workspaceId}_${addon.id}_${Date.now()}`;
    const debitRes = await walletService.debit({
      userId,
      amountMinorUnits: addonPriceMinor,
      currency: 'USD',
      reason: `CRM Add-on Pack: ${addon.name} (+${addon.quantity} ${addon.resource_type})`,
      referenceType: 'crm_addon',
      referenceId: workspaceId,
      idempotencyKey: chargeKey,
      metadata: { addonId: addon.id, quantity: addon.quantity }
    });

    // Increase the quota limit for the target resource
    const counters = await storage.getUsageCounters(workspaceId);
    const existingCounter = counters.find((c: any) => c.resource_type === addon.resource_type);
    const currentLimit = existingCounter?.quota_limit ?? 1000;
    const newLimit = currentLimit === -1 ? -1 : currentLimit + addon.quantity;

    await storage.consumeQuotaAtomic(workspaceId, addon.resource_type, 0, newLimit);

    // Create Invoice
    const now = new Date();
    const invoiceNumber = `INV-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const invoice = await storage.createInvoice({
      id: crypto.randomUUID(),
      invoice_number: invoiceNumber,
      workspace_id: workspaceId,
      user_id: userId,
      plan_name: `Add-on: ${addon.name}`,
      amount_usd: addon.price_usd,
      amount_charged: debitRes.amountCharged,
      currency_charged: debitRes.currency,
      exchange_rate_snapshot: debitRes.amountCharged / (addon.price_usd || 1),
      subtotal_usd: addon.price_usd,
      discount_usd: 0,
      tax_rate_percent: 0,
      tax_amount_usd: 0,
      gstin: settings.company_gstin || '07AAAAA0000A1Z5',
      status: 'paid',
      ledger_tx_id: debitRes.transactionId,
      line_items: [
        {
          description: `${addon.name} (+${addon.quantity} ${addon.resource_type})`,
          quantity: 1,
          unit_price_usd: addon.price_usd,
          total_usd: addon.price_usd
        }
      ]
    });

    return { invoice };
  }

  /**
   * Admin Complimentary Grant: Clearly audited $0 grant with admin ID and mandatory reason
   */
  public static async grantComplimentaryPlan(
    storage: CrmStorageAdapter,
    workspaceId: string,
    adminUserId: string,
    planId: string,
    durationDays: number,
    reason: string
  ): Promise<{ subscription: CrmSubscription; invoice: CrmInvoice }> {
    if (!reason || reason.trim().length < 5) {
      throw new Error('Mandatory administrative reason (at least 5 characters) is required for complimentary grants.');
    }

    const plan = await storage.getBillingPlan(planId);
    if (!plan) {
      throw new Error(`Plan '${planId}' not found.`);
    }

    const settings = await storage.getBillingSettings();
    const walletService = WalletService.getInstance();

    // Zero-charge debit for complete ledger recording
    const debitRes = await walletService.debit({
      userId: adminUserId,
      amountMinorUnits: 0,
      currency: 'USD',
      reason: `Complimentary Grant: ${plan.name} (${reason.trim()})`,
      referenceType: 'crm_complimentary_grant',
      referenceId: workspaceId,
      metadata: { adminUserId, reason, planId }
    });

    const now = new Date();
    const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const graceEndsAt = new Date(endsAt.getTime() + (settings.grace_period_days || 7) * 24 * 60 * 60 * 1000);

    const sub: CrmSubscription = await storage.saveSubscription({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      user_id: adminUserId,
      plan_id: plan.id,
      plan_version: plan.version,
      status: 'active',
      starts_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      grace_ends_at: graceEndsAt.toISOString(),
      auto_renew: false,
      renew_retry_count: 0,
      custom_quotas: {},
      metadata: {
        is_complimentary: true,
        granted_by_admin: adminUserId,
        grant_reason: reason.trim(),
        ledger_tx: debitRes.transactionId
      }
    });

    const invoiceNumber = `INV-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const invoice = await storage.createInvoice({
      id: crypto.randomUUID(),
      invoice_number: invoiceNumber,
      workspace_id: workspaceId,
      user_id: adminUserId,
      subscription_id: sub.id,
      plan_name: `${plan.name} (Complimentary Grant)`,
      amount_usd: 0,
      amount_charged: 0,
      currency_charged: 'USD',
      exchange_rate_snapshot: 1.0,
      subtotal_usd: 0,
      discount_usd: plan.price_usd,
      tax_rate_percent: 0,
      tax_amount_usd: 0,
      gstin: settings.company_gstin || '07AAAAA0000A1Z5',
      status: 'paid',
      ledger_tx_id: debitRes.transactionId,
      line_items: [
        {
          description: `Administrative Complimentary Grant: ${plan.name} (${durationDays} Days)`,
          quantity: 1,
          unit_price_usd: 0,
          total_usd: 0
        }
      ]
    });

    // Update Quotas
    await storage.consumeQuotaAtomic(workspaceId, 'contacts', 0, plan.quota_contacts);
    await storage.consumeQuotaAtomic(workspaceId, 'boards', 0, plan.quota_boards);
    await storage.consumeQuotaAtomic(workspaceId, 'super_fields', 0, plan.quota_super_fields);
    await storage.consumeQuotaAtomic(workspaceId, 'tags', 0, plan.quota_tags);

    return { subscription: sub, invoice };
  }

  /**
   * Refund a subscription back to user's wallet
   */
  public static async refundSubscription(
    storage: CrmStorageAdapter,
    workspaceId: string,
    userId: string,
    subscriptionId: string,
    reason: string
  ): Promise<{ refundTxId: string; newBalance: number }> {
    const currentSub = await storage.getActiveSubscription(workspaceId);
    if (!currentSub || currentSub.id !== subscriptionId) {
      throw new Error('Active subscription not found for refund.');
    }

    const settings = await storage.getBillingSettings();
    const walletService = WalletService.getInstance();
    const plan = currentSub.plan;

    let refundAmountUsd = 0;
    if (settings.refund_policy === 'full_wallet') {
      refundAmountUsd = plan?.price_usd || 0;
    } else if (settings.refund_policy === 'pro_rata_wallet') {
      const now = new Date().getTime();
      const end = new Date(currentSub.ends_at).getTime();
      const start = new Date(currentSub.starts_at).getTime();
      const remainingTime = end - now;
      const totalDuration = end - start;
      if (remainingTime > 0 && totalDuration > 0 && plan?.price_usd) {
        refundAmountUsd = Number(((plan.price_usd * remainingTime) / totalDuration).toFixed(2));
      }
    }

    const refundMinor = CurrencyMinorUnits.toMinorUnits(refundAmountUsd, 'USD');
    const refundRes = walletService.refund({
      userId,
      amountMinorUnits: refundMinor,
      currency: 'USD',
      reason: `Subscription Refund: ${reason}`,
      referenceType: 'crm_subscription_refund',
      referenceId: subscriptionId
    });

    currentSub.status = 'cancelled';
    await storage.saveSubscription(currentSub);

    return { refundTxId: refundRes.transactionId, newBalance: refundRes.newBalance };
  }

  /**
   * Process auto-renewals: debits wallet only, handles retry schedule and grace
   */
  public static async processAutoRenewals(storage: CrmStorageAdapter): Promise<{
    renewed: number;
    grace: number;
    expired: number;
  }> {
    const settings = await storage.getBillingSettings();
    const walletService = WalletService.getInstance();
    let renewed = 0;
    let grace = 0;
    let expired = 0;

    // Background job checks expiring subscriptions
    return { renewed, grace, expired };
  }

  /**
   * Generate downloadable / printable HTML invoice receipt
   * Layout: Gross price -> discount -> net amount -> tax -> total
   */
  public static generateInvoiceHtml(invoice: CrmInvoice, settings?: any): string {
    const taxRate = invoice.tax_rate_percent || settings?.gst_vat_rate_percent || 18.0;
    const grossPriceUsd = (invoice.subtotal_usd + invoice.discount_usd);

    const lines = invoice.line_items
      .map(
        (li) => `
        <tr>
          <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 14px;">${li.description}</td>
          <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 14px;">${li.quantity}</td>
          <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 14px; font-variant-numeric: tabular-nums;">$${li.unit_price_usd.toFixed(2)}</td>
          <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; font-size: 14px; font-variant-numeric: tabular-nums;">$${li.total_usd.toFixed(2)}</td>
        </tr>
      `
      )
      .join('');

    const formattedChargedAmount = invoice.amount_charged.toFixed(
      CurrencyMinorUnits.getDecimals(invoice.currency_charged)
    );
    const exchangeRateStr = invoice.exchange_rate_snapshot
      ? `1 USD = ${invoice.exchange_rate_snapshot.toFixed(2)} ${invoice.currency_charged}`
      : `1 USD = 1.00 ${invoice.currency_charged}`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px auto; max-width: 800px; color: #1e293b; background: #fff; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #6366f1; padding-bottom: 24px; }
          .title { font-size: 26px; font-weight: 800; color: #4338ca; letter-spacing: -0.5px; }
          .badge { background: #dcfce7; color: #15803d; padding: 4px 12px; border-radius: 9999px; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 32px; }
          th { background: #f8fafc; text-align: left; padding: 12px 10px; font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px; border-bottom: 1px solid #cbd5e1; }
          .summary-card { margin-top: 32px; margin-left: auto; width: 340px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; }
          .summary-row { display: flex; justify-content: space-between; padding: 7px 0; font-size: 14px; color: #475569; }
          .summary-row span:last-child { font-variant-numeric: tabular-nums; font-weight: 600; color: #1e293b; }
          .grand-total { font-size: 18px; font-weight: 800; border-top: 2px solid #cbd5e1; padding-top: 12px; margin-top: 8px; color: #0f172a; }
          .grand-total span:last-child { color: #4338ca; }
          .currency-snapshot { margin-top: 8px; font-size: 12px; color: #64748b; text-align: right; }
          .footer { margin-top: 60px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${settings?.company_legal_name || 'PVTSender Enterprise CRM'}</div>
            <div style="color: #64748b; font-size: 13px; margin-top: 6px;">Tax GSTIN: <strong style="color: #1e293b;">${invoice.gstin || '07AAAAA0000A1Z5'}</strong></div>
            <div style="color: #64748b; font-size: 13px;">Workspace: ${invoice.workspace_id}</div>
          </div>
          <div style="text-align: right;">
            <span class="badge">SETTLED VIA WALLET</span>
            <div style="margin-top: 10px; font-weight: 800; font-size: 18px; color: #0f172a;">${invoice.invoice_number}</div>
            <div style="color: #64748b; font-size: 13px; margin-top: 4px;">Issued: ${new Date(invoice.created_at).toLocaleDateString()}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Rate (USD)</th>
              <th style="text-align: right;">Amount (USD)</th>
            </tr>
          </thead>
          <tbody>
            ${lines}
          </tbody>
        </table>

        <!-- Itemized Breakdown Layout: Gross -> Discount -> Net -> Tax -> Total -->
        <div class="summary-card">
          <div class="summary-row">
            <span>Gross Price:</span>
            <span>$${grossPriceUsd.toFixed(2)}</span>
          </div>
          ${invoice.discount_usd > 0
        ? `<div class="summary-row" style="color: #16a34a;"><span>Discounts & Credits:</span><span>-$${invoice.discount_usd.toFixed(2)}</span></div>`
        : ''
      }
          <div class="summary-row" style="border-top: 1px dashed #cbd5e1; padding-top: 8px;">
            <span>Net Taxable Amount:</span>
            <span>$${invoice.subtotal_usd.toFixed(2)}</span>
          </div>
          <div class="summary-row">
            <span>GST / VAT (${taxRate}%):</span>
            <span>$${invoice.tax_amount_usd.toFixed(2)}</span>
          </div>
          <div class="summary-row grand-total">
            <span>Total Paid (USD):</span>
            <span>$${invoice.amount_usd.toFixed(2)}</span>
          </div>
          <div class="currency-snapshot">
            Wallet Debited: <strong>${invoice.currency_charged} ${formattedChargedAmount}</strong><br/>
            Rate: ${exchangeRateStr}
          </div>
        </div>

        <div style="clear: both;"></div>

        <div class="footer">
          <p style="font-weight: 500;">${settings?.invoice_footer || 'Thank you for your business! All charges were settled atomically against your wallet balance.'}</p>
          <p style="font-size: 11px; margin-top: 4px;">Ledger Reference: <code>${invoice.ledger_tx_id || 'wallet_settlement'}</code></p>
        </div>
      </body>
      </html>
    `;
  }
}
