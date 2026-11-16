import { Response } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getDatabase } from '../db/database.js';
import { AdvancedMarginEngine, MarginRuleV3 } from '../services/marketplace/AdvancedMarginEngine.js';
import { MarketplaceProductService } from '../services/marketplace/MarketplaceProductService.js';
import { CurrencyService } from '../services/virtualNumber/CurrencyService.js';

export class MarginStudioController {
  private marginEngine: AdvancedMarginEngine;
  private productService: MarketplaceProductService;
  private currencyService: CurrencyService;

  constructor() {
    this.marginEngine = AdvancedMarginEngine.getInstance();
    this.productService = MarketplaceProductService.getInstance();
    this.currencyService = CurrencyService.getInstance();
  }

  /**
   * List all v3 margin rules
   */
  public listRules = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const rows = db.prepare(`
        SELECT * FROM marketplace_margin_rules_v3
        ORDER BY priority ASC, created_at DESC
      `).all() as any[];

      const rules: MarginRuleV3[] = rows.map(r => ({
        id: r.id,
        name: r.name,
        priority: Number(r.priority || 100),
        scope: r.scope,
        target_id: r.target_id,
        rule_type: r.rule_type,
        percent_value: Number(r.percent_value || 0),
        fixed_value: Number(r.fixed_value || 0),
        multiplier_value: Number(r.multiplier_value || 1.0),
        tier_mode: r.tier_mode || 'flat',
        volume_tiers: r.volume_tiers_json ? JSON.parse(r.volume_tiers_json) : [],
        customer_plan_discounts: r.customer_plan_discounts_json ? JSON.parse(r.customer_plan_discounts_json) : {},
        min_margin_percent: Number(r.min_margin_percent || 15.0),
        min_sell_price: Number(r.min_sell_price || 0.50),
        maker_checker_status: r.maker_checker_status || 'approved',
        maker_checker_threshold_min: Number(r.maker_checker_threshold_min || 15.0),
        approved_by: r.approved_by,
        enabled: Boolean(r.enabled),
        created_at: r.created_at,
        updated_at: r.updated_at
      }));

      res.json({ rules });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  /**
   * Create new margin rule (enforces maker-checker threshold)
   */
  public createRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const body = req.body;
      const id = `rule_${crypto.randomBytes(6).toString('hex')}`;
      const name = body.name || 'Custom Margin Rule';
      const priority = Number(body.priority || 100);
      const scope = body.scope || 'global';
      const targetId = body.target_id || null;
      const ruleType = body.rule_type || 'percent';
      const percentValue = Number(body.percent_value || 0);
      const fixedValue = Number(body.fixed_value || 0);
      const multiplierValue = Number(body.multiplier_value || 1.0);
      const tierMode = body.tier_mode || 'flat';
      const volumeTiersJson = body.volume_tiers ? JSON.stringify(body.volume_tiers) : '[]';
      const planDiscountsJson = body.customer_plan_discounts ? JSON.stringify(body.customer_plan_discounts) : '{}';
      const minMarginPercent = Number(body.min_margin_percent || 15.0);
      const minSellPrice = Number(body.min_sell_price || 0.50);
      const thresholdMin = Number(body.maker_checker_threshold_min || 15.0);

      // Maker-checker policy: if percent_value is below threshold, flag as pending_approval
      const isSubThreshold = percentValue < thresholdMin && ruleType === 'percent';
      const makerCheckerStatus = isSubThreshold ? 'pending_approval' : 'approved';

      db.prepare(`
        INSERT INTO marketplace_margin_rules_v3 (
          id, name, priority, scope, target_id, rule_type, percent_value, fixed_value,
          multiplier_value, tier_mode, volume_tiers_json, customer_plan_discounts_json,
          min_margin_percent, min_sell_price, maker_checker_status, maker_checker_threshold_min,
          approved_by, enabled, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, datetime('now'), datetime('now')
        )
      `).run(
        id, name, priority, scope, targetId, ruleType, percentValue, fixedValue,
        multiplierValue, tierMode, volumeTiersJson, planDiscountsJson,
        minMarginPercent, minSellPrice, makerCheckerStatus, thresholdMin,
        makerCheckerStatus === 'approved' ? req.user?.username : null,
        body.enabled !== undefined ? (body.enabled ? 1 : 0) : 1
      );

      res.status(201).json({
        id,
        makerCheckerStatus,
        warning: isSubThreshold ? 'Rule submitted for admin review because margin is below threshold safeguard.' : null
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  /**
   * Update existing rule
   */
  public updateRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const { id } = req.params;
      const body = req.body;

      const existing = db.prepare('SELECT * FROM marketplace_margin_rules_v3 WHERE id = ?').get(id) as any;
      if (!existing) {
        res.status(404).json({ error: 'Margin rule not found' });
        return;
      }

      const percentValue = body.percent_value !== undefined ? Number(body.percent_value) : Number(existing.percent_value);
      const thresholdMin = Number(existing.maker_checker_threshold_min || 15.0);
      const isSubThreshold = percentValue < thresholdMin;
      const makerCheckerStatus = isSubThreshold ? 'pending_approval' : 'approved';

      db.prepare(`
        UPDATE marketplace_margin_rules_v3
        SET name = COALESCE(?, name),
            priority = COALESCE(?, priority),
            scope = COALESCE(?, scope),
            target_id = ?,
            rule_type = COALESCE(?, rule_type),
            percent_value = ?,
            fixed_value = COALESCE(?, fixed_value),
            multiplier_value = COALESCE(?, multiplier_value),
            tier_mode = COALESCE(?, tier_mode),
            volume_tiers_json = COALESCE(?, volume_tiers_json),
            customer_plan_discounts_json = COALESCE(?, customer_plan_discounts_json),
            min_margin_percent = COALESCE(?, min_margin_percent),
            min_sell_price = COALESCE(?, min_sell_price),
            maker_checker_status = ?,
            enabled = COALESCE(?, enabled),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        body.name,
        body.priority !== undefined ? Number(body.priority) : null,
        body.scope,
        body.target_id !== undefined ? body.target_id : existing.target_id,
        body.rule_type,
        percentValue,
        body.fixed_value !== undefined ? Number(body.fixed_value) : null,
        body.multiplier_value !== undefined ? Number(body.multiplier_value) : null,
        body.tier_mode,
        body.volume_tiers ? JSON.stringify(body.volume_tiers) : null,
        body.customer_plan_discounts ? JSON.stringify(body.customer_plan_discounts) : null,
        body.min_margin_percent !== undefined ? Number(body.min_margin_percent) : null,
        body.min_sell_price !== undefined ? Number(body.min_sell_price) : null,
        makerCheckerStatus,
        body.enabled !== undefined ? (body.enabled ? 1 : 0) : null,
        id
      );

      res.json({ success: true, makerCheckerStatus });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  /**
   * Delete margin rule
   */
  public deleteRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const { id } = req.params;
      db.prepare('DELETE FROM marketplace_margin_rules_v3 WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  /**
   * Approve sub-threshold rule (Maker-Checker)
   */
  public approveRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const { id } = req.params;
      const username = req.user?.username || 'admin';

      db.prepare(`
        UPDATE marketplace_margin_rules_v3
        SET maker_checker_status = 'approved',
            approved_by = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(username, id);

      res.json({ success: true, message: `Rule approved by @${username}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  /**
   * Reject sub-threshold rule
   */
  public rejectRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const { id } = req.params;

      db.prepare(`
        UPDATE marketplace_margin_rules_v3
        SET maker_checker_status = 'rejected',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(id);

      res.json({ success: true, message: 'Rule rejected' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  /**
   * Interactive Waterfall Simulator
   */
  public simulateWaterfall = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const {
        productSlug,
        requestedItems = 1000,
        currency = 'INR',
        customerPlan = 'starter',
        couponCode,
        customOverheadUsd,
        customFxBufferPct
      } = req.body;

      const product = this.productService.getProductBySlug(productSlug, true);
      if (!product) {
        res.status(404).json({ error: `Product not found: ${productSlug}` });
        return;
      }

      const quote = this.marginEngine.resolveQuote({
        product: product.definition,
        requestedItems: Number(requestedItems),
        targetCurrency: currency,
        customerPlan,
        couponCode,
        customOverheadUsd: customOverheadUsd !== undefined ? Number(customOverheadUsd) : undefined,
        customFxBufferPct: customFxBufferPct !== undefined ? Number(customFxBufferPct) : undefined
      });

      res.json(quote);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  /**
   * Heatmap Matrix Simulator (Volumes x Currencies)
   */
  public simulateMatrix = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { productSlug } = req.body;
      const product = this.productService.getProductBySlug(productSlug, true);
      if (!product) {
        res.status(404).json({ error: `Product not found: ${productSlug}` });
        return;
      }

      const volumes = [100, 500, 1000, 5000, 10000, 50000];
      const currencies = ['USD', 'INR', 'EUR', 'GBP', 'AED', 'CAD'];
      const matrix: Record<string, Record<number, any>> = {};

      for (const curr of currencies) {
        matrix[curr] = {};
        for (const vol of volumes) {
          const q = this.marginEngine.resolveQuote({
            product: product.definition,
            requestedItems: vol,
            targetCurrency: curr
          });
          matrix[curr][vol] = {
            sellPrice: q.finalSellPrice,
            providerCostConverted: q.loadedCostConverted,
            profit: q.profitConverted,
            marginPct: q.profitMarginPercent,
            floorApplied: q.floorApplied
          };
        }
      }

      res.json({ productSlug, volumes, currencies, matrix });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  /**
   * Historical Replay Preview:
   * Re-evaluates past jobs against current or simulated margin rules
   */
  public historicalReplay = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const days = Number(req.body.days || 30);

      const jobs = db.prepare(`
        SELECT * FROM marketplace_jobs
        WHERE status IN ('COMPLETED', 'PARTIAL')
          AND created_at >= datetime('now', '-' || ? || ' days')
        ORDER BY created_at DESC
        LIMIT 100
      `).all(days) as any[];

      let actualTotalRevenue = 0;
      let simulatedTotalRevenue = 0;
      let actualTotalProfit = 0;
      let simulatedTotalProfit = 0;
      const replayItems: any[] = [];

      for (const j of jobs) {
        actualTotalRevenue += Number(j.charged_amount || 0);
        actualTotalProfit += Number((Number(j.charged_amount || 0) - Number(j.provider_cost_converted || 0)).toFixed(2));

        const prod = this.productService.getProductBySlug(j.product_slug, true);
        if (prod) {
          const q = this.marginEngine.resolveQuote({
            product: prod.definition,
            requestedItems: j.items_delivered || j.requested_items || 100,
            targetCurrency: j.currency || 'INR'
          });

          simulatedTotalRevenue += q.finalSellPrice;
          simulatedTotalProfit += q.profitConverted;

          replayItems.push({
            jobId: j.id,
            productName: j.product_name,
            items: j.items_delivered || j.requested_items,
            currency: j.currency,
            actualCharged: j.charged_amount,
            simulatedCharged: q.finalSellPrice,
            actualProfit: Number((j.charged_amount - j.provider_cost_converted).toFixed(2)),
            simulatedProfit: q.profitConverted,
            difference: Number((q.finalSellPrice - j.charged_amount).toFixed(2))
          });
        }
      }

      res.json({
        totalJobsReplayed: jobs.length,
        periodDays: days,
        actualTotalRevenue: Number(actualTotalRevenue.toFixed(2)),
        simulatedTotalRevenue: Number(simulatedTotalRevenue.toFixed(2)),
        revenueDelta: Number((simulatedTotalRevenue - actualTotalRevenue).toFixed(2)),
        actualTotalProfit: Number(actualTotalProfit.toFixed(2)),
        simulatedTotalProfit: Number(simulatedTotalProfit.toFixed(2)),
        profitDelta: Number((simulatedTotalProfit - actualTotalProfit).toFixed(2)),
        replayItems: replayItems.slice(0, 20)
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  /**
   * Profit Analytics & Margin KPI Dashboard
   */
  public getKpis = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const statsRow = db.prepare(`
        SELECT
          COUNT(*) as total_jobs,
          COALESCE(SUM(charged_amount), 0) as total_revenue,
          COALESCE(SUM(provider_cost_converted), 0) as total_provider_cost
        FROM marketplace_jobs
        WHERE status IN ('COMPLETED', 'PARTIAL')
      `).get() as any;

      const totalRevenue = Number(statsRow?.total_revenue || 0);
      const totalCost = Number(statsRow?.total_provider_cost || 0);
      const grossProfit = Number((totalRevenue - totalCost).toFixed(2));
      const realizedMarginPct = totalRevenue > 0 ? Number(((grossProfit / totalRevenue) * 100).toFixed(1)) : 0;

      // Leakage count: jobs where profit margin was < 15%
      const leakageRow = db.prepare(`
        SELECT COUNT(*) as leakage_count
        FROM marketplace_jobs
        WHERE status IN ('COMPLETED', 'PARTIAL')
          AND charged_amount > 0
          AND ((charged_amount - provider_cost_converted) / charged_amount) < 0.15
      `).get() as any;

      // Recent margin traces
      const recentTraces = db.prepare(`
        SELECT * FROM marketplace_margin_traces
        ORDER BY created_at DESC
        LIMIT 10
      `).all() as any[];

      res.json({
        totalJobs: statsRow?.total_jobs || 0,
        totalRevenue,
        totalCost,
        grossProfit,
        realizedMarginPct,
        marginLeakageJobsCount: leakageRow?.leakage_count || 0,
        recentTraces: recentTraces.map(t => ({
          ...t,
          waterfall: t.waterfall_json ? JSON.parse(t.waterfall_json) : []
        }))
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  /**
   * Coupons CRUD
   */
  public listCoupons = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const coupons = db.prepare('SELECT * FROM marketplace_coupons ORDER BY created_at DESC').all();
      res.json({ coupons });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public saveCoupon = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const {
        id,
        code,
        description,
        discount_type = 'percent',
        discount_value,
        max_discount_amount,
        min_order_amount = 0,
        max_uses = 100,
        starts_at,
        expires_at,
        enabled = 1
      } = req.body;

      const couponId = id || `cpn_${crypto.randomBytes(6).toString('hex')}`;

      db.prepare(`
        INSERT INTO marketplace_coupons (
          id, code, description, discount_type, discount_value, max_discount_amount,
          min_order_amount, max_uses, starts_at, expires_at, enabled, created_at
        ) VALUES (
          ?, UPPER(?), ?, ?, ?, ?,
          ?, ?, ?, ?, ?, datetime('now')
        )
        ON CONFLICT(id) DO UPDATE SET
          code = UPPER(excluded.code),
          description = excluded.description,
          discount_type = excluded.discount_type,
          discount_value = excluded.discount_value,
          max_discount_amount = excluded.max_discount_amount,
          min_order_amount = excluded.min_order_amount,
          max_uses = excluded.max_uses,
          starts_at = excluded.starts_at,
          expires_at = excluded.expires_at,
          enabled = excluded.enabled
      `).run(
        couponId,
        code.trim().toUpperCase(),
        description || null,
        discount_type,
        Number(discount_value),
        max_discount_amount ? Number(max_discount_amount) : null,
        Number(min_order_amount),
        Number(max_uses),
        starts_at || null,
        expires_at || null,
        enabled ? 1 : 0
      );

      res.json({ success: true, id: couponId });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public deleteCoupon = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const { id } = req.params;
      db.prepare('DELETE FROM marketplace_coupons WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
}
