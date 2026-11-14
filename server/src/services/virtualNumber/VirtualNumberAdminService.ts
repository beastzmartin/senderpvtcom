import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';
import { WalletService } from '../walletService.js';
import { ProviderRegistry } from './ProviderRegistry.js';

export class VirtualNumberAdminService {
  private static instance: VirtualNumberAdminService | null = null;
  private walletService: WalletService;

  private constructor() {
    this.walletService = WalletService.getInstance();
  }

  public static getInstance(): VirtualNumberAdminService {
    if (!VirtualNumberAdminService.instance) {
      VirtualNumberAdminService.instance = new VirtualNumberAdminService();
    }
    return VirtualNumberAdminService.instance;
  }

  /**
   * 1. Master System Analytics & Admin Overview
   */
  public getAdminOverview() {
    const db = getDatabase();

    const stats = db
      .prepare(`
        SELECT
          COUNT(DISTINCT r.id) as total_rentals,
          SUM(CASE WHEN r.status = 'active' THEN 1 ELSE 0 END) as active_rentals,
          SUM(CASE WHEN r.status = 'expired' THEN 1 ELSE 0 END) as expired_rentals,
          SUM(CASE WHEN r.status = 'released' THEN 1 ELSE 0 END) as released_rentals,
          COALESCE(SUM(o.total_amount), 0.0) as gross_revenue,
          COALESCE(SUM(o.activation_fee + o.rental_fee), 0.0) as net_sales,
          COUNT(DISTINCT o.user_id) as total_customers
        FROM virtual_number_rentals r
        LEFT JOIN virtual_number_orders o ON r.order_id = o.id
      `)
      .get() as any;

    const failedOrders = (
      db.prepare("SELECT COUNT(*) as count FROM virtual_number_orders WHERE status = 'failed'").get() as { count: number }
    ).count;

    const availableInventory = (
      db.prepare("SELECT COUNT(*) as count FROM virtual_number_inventory WHERE status = 'available'").get() as { count: number }
    ).count;

    const activeProviders = (
      db.prepare("SELECT COUNT(*) as count FROM virtual_number_providers WHERE status = 'active'").get() as { count: number }
    ).count;

    // Country-wise sales breakdown
    const countrySales = db
      .prepare(`
        SELECT country_code, COUNT(*) as count, SUM(total_charges_accrued) as total_spent
        FROM virtual_number_rentals
        GROUP BY country_code
        ORDER BY count DESC
        LIMIT 6
      `)
      .all();

    return {
      totalRentals: stats?.total_rentals || 0,
      activeRentals: stats?.active_rentals || 0,
      expiredRentals: stats?.expired_rentals || 0,
      releasedRentals: stats?.released_rentals || 0,
      grossRevenue: stats?.gross_revenue || 0.0,
      totalCustomers: stats?.total_customers || 0,
      failedOrdersCount: failedOrders,
      availableInventoryCount: availableInventory,
      activeProvidersCount: activeProviders,
      countrySales
    };
  }

  /**
   * 2. Providers Management
   */
  public listProviders() {
    const db = getDatabase();
    return db
      .prepare(`
        SELECT id, name, slug, description, api_base_url, auth_type, priority,
          status, is_mock, supported_countries, capabilities, health_status,
          created_at, updated_at
        FROM virtual_number_providers
        ORDER BY priority ASC, created_at DESC
      `)
      .all();
  }

  public saveProvider(adminUserId: string, data: {
    id?: string;
    name: string;
    slug: string;
    description?: string;
    apiBaseUrl?: string;
    authType?: string;
    credentials?: Record<string, any>;
    webhookSecret?: string;
    priority?: number;
    status?: string;
    supportedCountries?: string[];
    capabilities?: string[];
  }) {
    const db = getDatabase();
    const id = data.id || `prov-${crypto.randomUUID()}`;
    const encryptedCreds = data.credentials ? JSON.stringify(data.credentials) : null;
    const countriesJson = JSON.stringify(data.supportedCountries || ['US']);
    const capsJson = JSON.stringify(data.capabilities || ['sms', 'voice']);

    if (data.id) {
      db.prepare(`
        UPDATE virtual_number_providers
        SET name = ?, description = ?, api_base_url = ?, auth_type = ?,
          encrypted_credentials = COALESCE(?, encrypted_credentials),
          webhook_secret = COALESCE(?, webhook_secret),
          priority = ?, status = ?, supported_countries = ?, capabilities = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        data.name,
        data.description || '',
        data.apiBaseUrl || '',
        data.authType || 'api_key',
        encryptedCreds,
        data.webhookSecret || null,
        data.priority || 1,
        data.status || 'active',
        countriesJson,
        capsJson,
        data.id
      );
    } else {
      db.prepare(`
        INSERT INTO virtual_number_providers (
          id, name, slug, description, api_base_url, auth_type, encrypted_credentials,
          webhook_secret, priority, status, is_mock, supported_countries, capabilities
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        id,
        data.name,
        data.slug,
        data.description || '',
        data.apiBaseUrl || '',
        data.authType || 'api_key',
        encryptedCreds,
        data.webhookSecret || null,
        data.priority || 1,
        data.status || 'active',
        countriesJson,
        capsJson
      );
    }

    // Audit log
    db.prepare(`
      INSERT INTO virtual_number_audit_logs (id, admin_user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, 'provider', ?, ?)
    `).run(
      `aud_${crypto.randomUUID()}`,
      adminUserId,
      data.id ? 'update_provider' : 'create_provider',
      id,
      JSON.stringify({ name: data.name, slug: data.slug, status: data.status })
    );

    return { success: true, id };
  }

  /**
   * 3. Number Inventory Management
   */
  public listInventory(filter?: { countryCode?: string; status?: string; limit?: number; offset?: number }) {
    const db = getDatabase();
    const { countryCode, status, limit = 50, offset = 0 } = filter || {};

    const conditions: string[] = [];
    const params: any[] = [];

    if (countryCode && countryCode !== 'all') {
      conditions.push('vni.country_code = ?');
      params.push(countryCode.toUpperCase());
    }
    if (status && status !== 'all') {
      conditions.push('vni.status = ?');
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = (
      db.prepare(`SELECT COUNT(*) as count FROM virtual_number_inventory vni ${where}`).get(...params) as { count: number }
    ).count;

    const rows = db
      .prepare(`
        SELECT vni.*, vnp.name as provider_name, vnc.name as country_name, vnc.flag_emoji
        FROM virtual_number_inventory vni
        LEFT JOIN virtual_number_providers vnp ON vni.provider_id = vnp.id
        LEFT JOIN virtual_number_countries vnc ON vni.country_code = vnc.iso_code
        ${where}
        ORDER BY vni.created_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset);

    return { total, rows };
  }

  public addInventoryNumber(adminUserId: string, data: {
    providerId: string;
    phoneNumber: string;
    countryCode: string;
    numberType: string;
    capabilities: string[];
    whatsappCompatible?: boolean;
    otpCompatible?: boolean;
    providerBaseCost: number;
    activationFee: number;
    monthlyPrice: number;
    renewalPrice: number;
  }) {
    const db = getDatabase();
    const id = `inv-${crypto.randomUUID()}`;

    db.prepare(`
      INSERT INTO virtual_number_inventory (
        id, provider_id, phone_number, country_code, number_type, capabilities,
        whatsapp_compatible, otp_compatible, provider_base_cost, activation_fee,
        monthly_price, renewal_price, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')
    `).run(
      id,
      data.providerId,
      data.phoneNumber,
      data.countryCode.toUpperCase(),
      data.numberType,
      JSON.stringify(data.capabilities),
      data.whatsappCompatible ? 1 : 0,
      data.otpCompatible ? 1 : 0,
      data.providerBaseCost,
      data.activationFee,
      data.monthlyPrice,
      data.renewalPrice
    );

    // Update country count
    db.prepare(`
      UPDATE virtual_number_countries
      SET available_numbers_count = available_numbers_count + 1
      WHERE iso_code = ?
    `).run(data.countryCode.toUpperCase());

    return { success: true, id };
  }

  /**
   * 4. Pricing & Markup Configuration
   */
  public listPricingRules() {
    const db = getDatabase();
    return db
      .prepare(`
        SELECT pr.*, vnp.name as provider_name, vnc.name as country_name, vnc.flag_emoji, u.name as customer_name
        FROM virtual_number_pricing pr
        LEFT JOIN virtual_number_providers vnp ON pr.provider_id = vnp.id
        LEFT JOIN virtual_number_countries vnc ON pr.country_code = vnc.iso_code
        LEFT JOIN users u ON pr.user_id = u.id
        ORDER BY pr.created_at DESC
      `)
      .all();
  }

  public savePricingRule(adminUserId: string, data: {
    id?: string;
    providerId?: string;
    countryCode?: string;
    productId?: string;
    userId?: string;
    pricingModel: string;
    baseCost: number;
    activationFee: number;
    markupAmount: number;
    markupPercentage: number;
    monthlyRentalPrice: number;
    renewalPrice: number;
  }) {
    const db = getDatabase();
    const id = data.id || `rule-${crypto.randomUUID()}`;

    if (data.id) {
      db.prepare(`
        UPDATE virtual_number_pricing
        SET provider_id = ?, country_code = ?, user_id = ?, pricing_model = ?,
          base_cost = ?, activation_fee = ?, markup_amount = ?, markup_percentage = ?,
          monthly_rental_price = ?, renewal_price = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        data.providerId || null,
        data.countryCode || null,
        data.userId || null,
        data.pricingModel || 'cost_plus',
        data.baseCost,
        data.activationFee,
        data.markupAmount,
        data.markupPercentage,
        data.monthlyRentalPrice,
        data.renewalPrice,
        data.id
      );
    } else {
      db.prepare(`
        INSERT INTO virtual_number_pricing (
          id, provider_id, country_code, user_id, pricing_model, base_cost,
          activation_fee, markup_amount, markup_percentage, monthly_rental_price, renewal_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.providerId || null,
        data.countryCode || null,
        data.userId || null,
        data.pricingModel || 'cost_plus',
        data.baseCost,
        data.activationFee,
        data.markupAmount,
        data.markupPercentage,
        data.monthlyRentalPrice,
        data.renewalPrice
      );
    }

    return { success: true, id };
  }

  /**
   * 5. List All Active Customer Rentals across the platform
   */
  public listAllRentals(filter?: { status?: string; search?: string; limit?: number; offset?: number }) {
    const db = getDatabase();
    const { status, search, limit = 50, offset = 0 } = filter || {};

    const conditions: string[] = [];
    const params: any[] = [];

    if (status && status !== 'all') {
      conditions.push('r.status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(r.phone_number LIKE ? OR u.name LIKE ? OR u.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = (
      db.prepare(`SELECT COUNT(*) as count FROM virtual_number_rentals r LEFT JOIN users u ON r.user_id = u.id ${where}`).get(...params) as { count: number }
    ).count;

    const rows = db
      .prepare(`
        SELECT r.*, u.name as user_name, u.email as user_email, u.username, c.name as country_name, c.flag_emoji
        FROM virtual_number_rentals r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN virtual_number_countries c ON r.country_code = c.iso_code
        ${where}
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset);

    return { total, rows };
  }

  /**
   * 6. Issue Refund for a Failed or Disputed Virtual Number Order
   */
  public refundOrder(adminUserId: string, orderId: string, reason: string) {
    const db = getDatabase();
    const order = db.prepare('SELECT * FROM virtual_number_orders WHERE id = ?').get(orderId) as any;

    if (!order) {
      throw new Error('Order not found.');
    }

    if (order.status === 'refunded') {
      throw new Error('This order has already been refunded.');
    }

    // Call Central Wallet Service to credit back the user
    const refundResult = this.walletService.refund(
      order.user_id,
      order.total_amount,
      `Refund for Virtual Number Order ${order.phone_number}: ${reason}`,
      order.wallet_transaction_id
    );

    // Update order status
    db.prepare("UPDATE virtual_number_orders SET status = 'refunded', failure_reason = ?, updated_at = datetime('now') WHERE id = ?").run(reason, orderId);

    // If an associated rental exists, cancel it
    db.prepare("UPDATE virtual_number_rentals SET status = 'released', auto_renew = 0 WHERE order_id = ?").run(orderId);

    // Audit log
    db.prepare(`
      INSERT INTO virtual_number_audit_logs (id, admin_user_id, target_user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, 'refund_order', 'virtual_number_orders', ?, ?)
    `).run(
      `aud_${crypto.randomUUID()}`,
      adminUserId,
      order.user_id,
      orderId,
      JSON.stringify({ amount: order.total_amount, reason, orderId })
    );

    return { success: true, refundedAmount: order.total_amount, newBalance: refundResult.newBalance };
  }
}
