import crypto from 'crypto';
import {
  ProductDefinition,
  ProductLimits,
  ProductPricing,
  ProductAccess,
  ProductOutputDefinition,
  ProductCompliance
} from '../../types/marketplace.js';
import { SchemaMapper } from './SchemaMapper.js';
import { WhiteLabelSanitizer } from './WhiteLabelSanitizer.js';
import { MarketplacePricingService } from './MarketplacePricingService.js';
import { ProviderActorInfo } from './provider/ProviderAdapter.js';
import { ParsedActorRef } from './LinkParser.js';
import { ActorProfileService } from './ActorProfileService.js';

export interface DriftDetectionResult {
  hasDrift: boolean;
  status: 'IN_SYNC' | 'SCHEMA_CHANGED' | 'PRICE_CHANGED' | 'PROVIDER_ERROR';
  diffNotes: string[];
  freshSchemaHash: string;
  freshBuildNumber?: string;
}

export class DraftProductGenerator {
  /**
   * Generates a fully compliant draft ProductDefinition v2 from provider metadata & schema
   */
  public static generateDraft(
    ref: ParsedActorRef,
    info: ProviderActorInfo,
    schemaOverride?: any
  ): ProductDefinition {
    const pricingService = MarketplacePricingService.getInstance();
    const inputSchema = schemaOverride || info.inputSchema || {};
    const schemaMapping = SchemaMapper.mapSchema(inputSchema);

    // Build ActorProfile with CapabilityDetector & CompatibilityClassifier
    const actorProfile = ActorProfileService.buildProfile({
      id: info.actorId,
      name: info.name,
      username: ref.username,
      title: info.title,
      description: info.description,
      inputSchema,
      datasetSchema: info.datasetSchema,
      actorDefinition: info.actorDefinition,
      readme: info.readme,
      pricingInfos: info.pricingInfo?.rawPricingInfos || [],
      defaultRunOptions: {
        memoryMbytes: info.defaultMemoryMbytes,
        timeoutSecs: info.defaultTimeoutSecs
      },
      permissions: info.permissions,
      mode: info.mode,
      categories: info.categories,
      stats: info.stats,
      taggedBuilds: { latest: { buildNumber: info.buildNumber } }
    });

    // Compute schema hash for drift detection
    const schemaHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(inputSchema))
      .digest('hex')
      .slice(0, 16);

    // White-label sanitization of title, tagline and description
    let cleanTitle = info.title || info.name || 'Data Intelligence Extractor';
    cleanTitle = WhiteLabelSanitizer.cleanText(cleanTitle);
    if (ref.username) {
      cleanTitle = cleanTitle.replace(new RegExp(ref.username, 'gi'), '').trim();
    }
    cleanTitle = cleanTitle.replace(/^[-:\s]+|[-:\s]+$/g, '');
    if (!cleanTitle) cleanTitle = 'Verified Business Extractor';

    const cleanTagline = WhiteLabelSanitizer.cleanText(
      `High-speed automated data extraction and lead generation for ${cleanTitle}`
    );

    const cleanDescription = WhiteLabelSanitizer.cleanText(
      `# ${cleanTitle}\n\n${info.description || 'Extract structured data with guaranteed delivery and instant download.'}`
    );

    // Clean generic slug
    let cleanSlug = (info.name || ref.actorName || cleanTitle)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!cleanSlug) cleanSlug = `extractor-${Date.now().toString().slice(-4)}`;

    // Pricing estimation (conservative highest-tier rate)
    const costUsd = info.pricingInfo?.usdPer1000Items || 2.50;
    const runStartUsd = info.pricingInfo?.usdPerRunStart || 0.05;
    const suggestedSellInr = pricingService.calculateSuggestedSellPrice(costUsd, 'percent', 40.0, 'INR');

    // Personal data detection heuristic
    const fieldKeys = schemaMapping.fields.map((f) => f.key.toLowerCase());
    const containsPersonalData =
      fieldKeys.some((k) => k.includes('email') || k.includes('phone') || k.includes('contact') || k.includes('profile')) ||
      cleanDescription.toLowerCase().includes('email') ||
      cleanDescription.toLowerCase().includes('phone');

    return {
      slug: cleanSlug,
      display_name: cleanTitle,
      tagline: cleanTagline,
      description_md: cleanDescription,
      category: 'General & Leads',
      icon: 'Building2',
      status: 'draft',
      provider: {
        type: 'apify',
        actor_id: ref.normalizedActorId,
        build: 'latest'
      },
      input: {
        fields: schemaMapping.fields,
        static_overrides: schemaMapping.staticOverrides,
        hidden_defaults: schemaMapping.hiddenDefaults
      },
      limits: {
        min_items: 5,
        max_items_per_run: 1000,
        max_concurrent_runs_per_user: 2,
        timeout_secs: info.defaultTimeoutSecs || 1800,
        memory_mb: info.defaultMemoryMbytes || 1024
      },
      pricing: {
        mode: 'per_item',
        currency_basis: 'BASE',
        provider_cost_reference: {
          model: (info.pricingInfo?.model as any) || 'pay_per_result',
          usd_per_1000_items: costUsd,
          usd_per_run_start: runStartUsd,
          notes: `Auto-imported on ${new Date().toISOString().split('T')[0]}. Conservative highest-tier price reference.`
        },
        sell: {
          per_1000_items: suggestedSellInr,
          per_run_flat: 0.0
        },
        margin: {
          type: 'percent',
          value: 40.0
        },
        min_charge: 10.0,
        min_margin_percent: 30,
        fx_safety_buffer_percent: 5,
        quote_ttl_secs: 300,
        price_drift_tolerance_percent: 10
      },
      access: {
        requires_subscription: false,
        allowed_plan_slugs: []
      },
      output: {
        item_mapping: [],
        drop_fields: ['_internalId', 'actorExecutionId', 'provider_debug_info', 'apifyDatasetId'],
        preview_columns: [],
        export_formats: ['csv', 'xlsx', 'json'],
        sanitize: {
          strip_provider_urls: true
        }
      },
      compliance: {
        contains_personal_data: containsPersonalData,
        disclaimer_md: containsPersonalData
          ? 'This product extracts publicly available business contact information. Ensure compliance with GDPR, CAN-SPAM, and local digital marketing regulations.'
          : undefined,
        notes: schemaMapping.multiCustomerRiskFields.length > 0
          ? `Multi-customer state warning: The following input fields may store account-level state: ${schemaMapping.multiCustomerRiskFields.join(', ')}.`
          : undefined
      },
      ui: {
        show_in_menu: true,
        menu_group: 'Extractors',
        display_order: 10
      },
      whitelabel: {
        extra_blocklist_terms: ref.username ? [ref.username, info.name] : [info.name],
        scrub_fields: ['provider_debug_info', 'actorExecutionId']
      },
      sync: {
        provider_schema_hash: schemaHash,
        provider_build_number: info.buildNumber || 'latest',
        last_synced_at: new Date().toISOString(),
        sync_status: 'IN_SYNC'
      },
      profile: actorProfile,
      pinned_build: info.buildNumber || 'latest',
      wizard_gates: {
        link_imported: true,
        actor_profile_approved: actorProfile.compatibility.classification === 'FULLY_SUPPORTED' || actorProfile.compatibility.classification === 'SUPPORTED_WITH_LIMITS',
        schema_mapped: schemaMapping.fields.length > 0 && schemaMapping.unmappedFieldCount === 0,
        whitelabel_passed: true,
        pricing_validated: suggestedSellInr > 0,
        test_run_passed: false,
        output_reviewed: actorProfile.capabilities.dataset_views.length > 0 || actorProfile.capabilities.output_kinds.includes('dataset'),
        compliance_set: true,
        studio_preview_verified: false,
        multi_customer_risk_decided: schemaMapping.multiCustomerRiskFields.length === 0
      }
    };
  }

  /**
   * Re-sync & Drift Detection
   * Compares currently stored product definition against fresh provider info
   */
  public static detectDrift(
    existing: ProductDefinition,
    freshInfo: ProviderActorInfo,
    freshSchema?: any
  ): DriftDetectionResult {
    const diffNotes: string[] = [];
    let status: 'IN_SYNC' | 'SCHEMA_CHANGED' | 'PRICE_CHANGED' | 'PROVIDER_ERROR' = 'IN_SYNC';

    const inputSchema = freshSchema || freshInfo.inputSchema || {};
    const freshSchemaHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(inputSchema))
      .digest('hex')
      .slice(0, 16);

    const oldHash = existing.sync?.provider_schema_hash;

    if (oldHash && oldHash !== freshSchemaHash) {
      status = 'SCHEMA_CHANGED';
      diffNotes.push('Input schema modified by upstream provider.');

      // Check fields diff
      const existingFieldKeys = new Set((existing.input?.fields || []).map((f) => f.provider_key));
      const freshProps = inputSchema.properties || {};

      for (const key of Object.keys(freshProps)) {
        if (!existingFieldKeys.has(key)) {
          diffNotes.push(`New upstream field added: "${key}".`);
        }
      }

      for (const oldKey of existingFieldKeys) {
        if (!freshProps[oldKey]) {
          diffNotes.push(`Existing upstream field removed: "${oldKey}".`);
        }
      }
    }

    // Check pricing drift
    const freshCost = freshInfo.pricingInfo?.usdPer1000Items;
    const oldCost = existing.pricing?.provider_cost_reference?.usd_per_1000_items;

    if (freshCost !== undefined && oldCost !== undefined && oldCost !== null) {
      if (Math.abs(freshCost - oldCost) > 0.0001) {
        if (status === 'IN_SYNC') status = 'PRICE_CHANGED';
        diffNotes.push(`Provider cost changed: was $${oldCost}/1000, now $${freshCost}/1000.`);
      }
    }

    // Check permission escalation or mode changes
    if (freshInfo.permissions === 'full' && existing.profile?.capabilities?.permission_level !== 'full') {
      status = 'SCHEMA_CHANGED';
      diffNotes.push('CRITICAL: Provider permissions escalated to "full". Auto-pause recommended to prevent multi-tenant data risk.');
    }

    if (freshInfo.mode === 'standby' && existing.profile?.capabilities?.mode !== 'standby') {
      status = 'SCHEMA_CHANGED';
      diffNotes.push('Actor mode switched to standby/HTTP mode. Standby actors cannot be automated.');
    }

    return {
      hasDrift: status !== 'IN_SYNC',
      status,
      diffNotes,
      freshSchemaHash,
      freshBuildNumber: freshInfo.buildNumber
    };
  }
}
