import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';
import {
  ProductDefinition,
  MarketplaceProductRecord,
  ProductStatus,
  ProductWizardGates
} from '../../types/marketplace.js';
import { ProviderRegistry } from './provider/ProviderRegistry.js';
import { MarketplacePricingService } from './MarketplacePricingService.js';
import { WhiteLabelSanitizer } from './WhiteLabelSanitizer.js';
import { LinkParser, ParsedActorRef } from './LinkParser.js';
import { DraftProductGenerator, DriftDetectionResult } from './DraftProductGenerator.js';

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
   * Admin Tool: "Import from Provider ID or URL" (Add-by-Link)
   * Uses LinkParser to normalize link and DraftProductGenerator to create a compliant ProductDefinition v1
   */
  public async importFromProvider(
    providerType: string,
    actorIdOrUrl: string
  ): Promise<ProductDefinition> {
    const parsedRef = LinkParser.parseActorRef(actorIdOrUrl);
    const adapter = ProviderRegistry.getInstance().getAdapter(providerType || 'apify');
    const info = await adapter.getActorInfo(parsedRef.normalizedActorId);

    const draft = DraftProductGenerator.generateDraft(parsedRef, info);
    return draft;
  }

  /**
   * Admin Tool: Bulk Import by Links
   * Parses batch of links, validates, generates draft products and identifies duplicates
   */
  public async bulkImportFromProvider(
    providerType: string,
    rawLinks: string[]
  ): Promise<{
    drafts: ProductDefinition[];
    existing: string[];
    errors: Array<{ input: string; error: string }>;
  }> {
    const parsedBatch = LinkParser.parseBatch(rawLinks);
    const db = getDatabase();

    const drafts: ProductDefinition[] = [];
    const existing: string[] = [];
    const errors: Array<{ input: string; error: string }> = [];

    // Pre-load all existing actor_ids in database
    const existingProducts = db.prepare('SELECT slug, definition_json FROM extraction_marketplace_products').all() as any[];
    const existingActorIds = new Set<string>();
    const existingSlugs = new Set<string>();
    for (const ep of existingProducts) {
      existingSlugs.add(ep.slug);
      try {
        const def = JSON.parse(ep.definition_json);
        if (def.provider?.actor_id) existingActorIds.add(def.provider.actor_id.toLowerCase());
      } catch {}
    }

    const adapter = ProviderRegistry.getInstance().getAdapter(providerType || 'apify');

    for (const ref of parsedBatch) {
      if (existingActorIds.has(ref.normalizedActorId.toLowerCase())) {
        existing.push(ref.originalInput);
        continue;
      }

      try {
        const info = await adapter.getActorInfo(ref.normalizedActorId);
        const draft = DraftProductGenerator.generateDraft(ref, info);

        // Ensure unique slug if collision
        if (existingSlugs.has(draft.slug)) {
          draft.slug = `${draft.slug}-${Date.now().toString().slice(-4)}`;
        }

        drafts.push(draft);
      } catch (err: any) {
        errors.push({
          input: ref.originalInput,
          error: err.message || 'Failed to fetch actor metadata from provider'
        });
      }
    }

    return { drafts, existing, errors };
  }

  /**
   * Re-sync & Drift Detection
   * Compares currently stored product definition against fresh provider info
   */
  public async checkDrift(slug: string): Promise<DriftDetectionResult> {
    const product = this.getProductBySlug(slug, true);
    if (!product) {
      throw new Error(`Product not found: ${slug}`);
    }

    const providerType = product.definition.provider?.type || 'apify';
    const actorId = product.definition.provider?.actor_id;
    if (!actorId) {
      throw new Error(`No provider actor_id associated with product: ${slug}`);
    }

    const adapter = ProviderRegistry.getInstance().getAdapter(providerType);
    const freshInfo = await adapter.getActorInfo(actorId);

    const drift = DraftProductGenerator.detectDrift(product.definition, freshInfo);

    // Update product sync status in database
    const updatedDef: ProductDefinition = {
      ...product.definition,
      sync: {
        provider_schema_hash: drift.freshSchemaHash,
        provider_build_number: drift.freshBuildNumber || 'latest',
        last_synced_at: new Date().toISOString(),
        sync_status: drift.status,
        diff_notes: drift.diffNotes.join('; ')
      }
    };

    this.saveProduct(updatedDef, undefined, `Drift check: ${drift.status}`);
    return drift;
  }

  /**
   * Wizard Gate Update
   * Updates verification checklist state for the Review & Activate Wizard
   */
  public updateWizardGate(
    slug: string,
    gateKey: keyof ProductWizardGates,
    value: boolean
  ): MarketplaceProductRecord {
    const product = this.getProductBySlug(slug, true);
    if (!product) {
      throw new Error(`Product not found: ${slug}`);
    }

    const currentGates: ProductWizardGates = product.definition.wizard_gates || {
      link_imported: true,
      schema_mapped: true,
      whitelabel_passed: true,
      pricing_validated: true,
      test_run_passed: false,
      output_reviewed: false,
      compliance_set: true,
      studio_preview_verified: false
    };

    currentGates[gateKey] = value;

    const updatedDef: ProductDefinition = {
      ...product.definition,
      wizard_gates: currentGates
    };

    return this.saveProduct(updatedDef, undefined, `Wizard gate "${gateKey}" updated to ${value}`);
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

