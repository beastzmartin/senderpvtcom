import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';
import {
  ProductDefinition,
  MarketplaceProductRecord,
  ProductStatus
} from '../../types/marketplace.js';
import { ProviderRegistry } from './provider/ProviderRegistry.js';
import { MarketplacePricingService } from './MarketplacePricingService.js';
import { WhiteLabelSanitizer } from './WhiteLabelSanitizer.js';

export class MarketplaceProductService {
  private static instance: MarketplaceProductService | null = null;
  private pricingService: MarketplacePricingService;

  private constructor() {
    this.pricingService = MarketplacePricingService.getInstance();
  }

  public static getInstance(): MarketplaceProductService {
    if (!MarketplaceProductService.instance) {
      MarketplaceProductService.instance = new MarketplaceProductService();
    }
    return MarketplaceProductService.instance;
  }

  /**
   * List products (for customer or admin)
   */
  public listProducts(isAdmin: boolean = false, category?: string): MarketplaceProductRecord[] {
    const db = getDatabase();
    let query = 'SELECT * FROM extraction_marketplace_products WHERE 1=1';
    const params: any[] = [];

    if (!isAdmin) {
      query += " AND status = 'active'";
    }

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY display_name ASC';
    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((r) => {
      const def: ProductDefinition = JSON.parse(r.definition_json);
      return {
        id: r.id,
        slug: r.slug,
        display_name: r.display_name,
        tagline: r.tagline || def.tagline,
        description_md: r.description_md || def.description_md,
        category: r.category || def.category,
        icon: r.icon || def.icon || null,
        status: r.status as ProductStatus,
        definition: isAdmin ? def : WhiteLabelSanitizer.sanitizeData(def),
        created_at: r.created_at,
        updated_at: r.updated_at
      };
    });
  }

  /**
   * Get single product by slug
   */
  public getProductBySlug(slug: string, isAdmin: boolean = false): MarketplaceProductRecord | null {
    const db = getDatabase();
    const query = isAdmin
      ? 'SELECT * FROM extraction_marketplace_products WHERE slug = ?'
      : "SELECT * FROM extraction_marketplace_products WHERE slug = ? AND status = 'active'";

    const row = db.prepare(query).get(slug) as any;
    if (!row) return null;

    const def: ProductDefinition = JSON.parse(row.definition_json);
    return {
      id: row.id,
      slug: row.slug,
      display_name: row.display_name,
      tagline: row.tagline || def.tagline,
      description_md: row.description_md || def.description_md,
      category: row.category || def.category,
      icon: row.icon || def.icon || null,
      status: row.status as ProductStatus,
      definition: isAdmin ? def : WhiteLabelSanitizer.sanitizeData(def),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * Admin Tool: "Import from Provider ID"
   * Calls adapter to inspect actor schema and pre-fills white-labeled ProductDefinition
   */
  public async importFromProvider(
    providerType: string,
    actorIdOrUrl: string
  ): Promise<Partial<ProductDefinition>> {
    const cleanActorId = actorIdOrUrl.trim().replace(/^https?:\/\/(?:www\.)?apify\.com\//i, '');
    const adapter = ProviderRegistry.getInstance().getAdapter(providerType || 'apify');
    const info = await adapter.getActorInfo(cleanActorId);

    // Extract input fields from schema properties
    const fields: any[] = [];
    if (info.inputSchema && info.inputSchema.properties) {
      const requiredSet = new Set(info.inputSchema.required || []);
      for (const [propKey, propVal] of Object.entries(info.inputSchema.properties)) {
        let fieldType: any = 'text';
        if (propVal.type === 'integer' || propVal.type === 'number') fieldType = 'number';
        else if (propVal.type === 'boolean') fieldType = 'boolean';
        else if (propVal.type === 'array') fieldType = 'string_list';
        else if (propVal.editor === 'textarea') fieldType = 'textarea';

        fields.push({
          key: propKey.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          provider_key: propKey,
          label: propVal.title || propKey,
          help: propVal.description || '',
          type: fieldType,
          required: requiredSet.has(propKey),
          default: propVal.default || null,
          options: propVal.enum ? propVal.enum.map((e: any) => ({ label: String(e), value: e })) : [],
          visible_to_user: true
        });
      }
    }

    // Default suggested sell price (Cost + 40% margin)
    const costUsd = info.pricingInfo?.usdPer1000Items || 2.0;
    const suggestedSellInr = this.pricingService.calculateSuggestedSellPrice(costUsd, 'percent', 40.0, 'INR');

    const cleanSlug = info.name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/^-+|-+$/g, '');

    return {
      slug: cleanSlug,
      display_name: info.title || info.name,
      tagline: `High-speed automated data intelligence extraction for ${info.title || info.name}`,
      description_md: `# ${info.title || info.name}\n\n${info.description || 'Extract structured data with guaranteed delivery.'}`,
      category: 'General & Leads',
      icon: 'Building2',
      status: 'draft',
      provider: {
        type: providerType as any || 'apify',
        actor_id: cleanActorId,
        build: 'latest'
      },
      input: {
        fields: fields.slice(0, 10), // Take top 10 relevant fields
        static_overrides: {},
        hidden_defaults: {}
      },
      limits: {
        min_items: 10,
        max_items_per_run: 1000,
        max_concurrent_runs_per_user: 2,
        timeout_secs: info.defaultTimeoutSecs || 1800,
        memory_mb: info.defaultMemoryMbytes || 1024
      },
      pricing: {
        mode: 'per_item',
        provider_cost_reference: {
          model: (info.pricingInfo?.model as any) || 'pay_per_result',
          usd_per_1000_items: costUsd,
          usd_per_run_start: info.pricingInfo?.usdPerRunStart || 0.0,
          notes: 'Imported from provider configuration'
        },
        sell: {
          per_1000_items: suggestedSellInr,
          per_run_flat: 0.0
        },
        margin: {
          type: 'percent',
          value: 40.0
        },
        min_charge: 10.0
      },
      access: {
        requires_subscription: false,
        allowed_plan_slugs: []
      },
      output: {
        item_mapping: [],
        drop_fields: ['_internalId', 'actorExecutionId', 'provider_debug_info'],
        preview_columns: [],
        export_formats: ['csv', 'xlsx', 'json'],
        sanitize: {
          strip_provider_urls: true
        }
      },
      compliance: {
        contains_personal_data: false,
        disclaimer_md: 'Extract public web data responsibly according to terms and applicable privacy laws.'
      }
    };
  }

  /**
   * Admin: Save or update ProductDefinition
   */
  public saveProduct(
    productDef: ProductDefinition,
    adminUserId?: string,
    reason?: string
  ): MarketplaceProductRecord {
    const db = getDatabase();
    const slug = productDef.slug.trim().toLowerCase();

    // Check existing
    const existing = db.prepare('SELECT * FROM extraction_marketplace_products WHERE slug = ?').get(slug) as any;

    // Safety rule check: verify sell price >= provider cost
    const est = this.pricingService.calculateEstimatedPrice(productDef, 1000);
    if (est.isBelowCost) {
      console.warn(`[Marketplace Warning] Product "${slug}" sell price (₹${est.sellPrice}) is below provider cost (₹${est.providerCostConverted}).`);
    }

    if (existing) {
      // Audit pricing history if pricing changed
      const oldDef: ProductDefinition = JSON.parse(existing.definition_json);
      if (JSON.stringify(oldDef.pricing) !== JSON.stringify(productDef.pricing)) {
        db.prepare(`
          INSERT INTO product_pricing_history (id, product_id, changed_by_user_id, old_pricing_json, new_pricing_json, reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          crypto.randomUUID(),
          existing.id,
          adminUserId || null,
          JSON.stringify(oldDef.pricing),
          JSON.stringify(productDef.pricing),
          reason || 'Admin pricing update'
        );
      }

      db.prepare(`
        UPDATE extraction_marketplace_products
        SET display_name = ?,
            tagline = ?,
            description_md = ?,
            category = ?,
            icon = ?,
            status = ?,
            definition_json = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        productDef.display_name,
        productDef.tagline,
        productDef.description_md,
        productDef.category,
        productDef.icon || null,
        productDef.status,
        JSON.stringify(productDef),
        existing.id
      );

      return this.getProductBySlug(slug, true)!;
    } else {
      const id = slug;
      db.prepare(`
        INSERT INTO extraction_marketplace_products (
          id, slug, display_name, tagline, description_md, category, icon, status, definition_json, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
        )
      `).run(
        id,
        slug,
        productDef.display_name,
        productDef.tagline,
        productDef.description_md,
        productDef.category,
        productDef.icon || null,
        productDef.status,
        JSON.stringify(productDef)
      );

      return this.getProductBySlug(slug, true)!;
    }
  }

  /**
   * Admin: Duplicate product
   */
  public duplicateProduct(sourceSlug: string): MarketplaceProductRecord {
    const source = this.getProductBySlug(sourceSlug, true);
    if (!source) {
      throw new Error(`Product not found: ${sourceSlug}`);
    }

    const newSlug = `${source.slug}-copy-${Date.now().toString().slice(-4)}`;
    const newDef: ProductDefinition = {
      ...source.definition,
      slug: newSlug,
      display_name: `${source.display_name} (Copy)`,
      status: 'draft'
    };

    return this.saveProduct(newDef);
  }

  /**
   * Admin: Toggle product status
   */
  public setProductStatus(slug: string, status: ProductStatus): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE extraction_marketplace_products
      SET status = ?, updated_at = datetime('now')
      WHERE slug = ?
    `).run(status, slug);
  }

  /**
   * Admin: Delete product
   */
  public deleteProduct(slug: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM extraction_marketplace_products WHERE slug = ?').run(slug);
  }
}
