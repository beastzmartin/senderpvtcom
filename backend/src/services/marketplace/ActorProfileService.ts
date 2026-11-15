import crypto from 'crypto';
import {
  ActorCapabilities,
  ActorCompatibility,
  ActorProfile,
  CompatibilityClassification,
  CompatibilityEvidence,
  DatasetViewDefinition,
  InputKind,
  KVCollectionDefinition,
  OutputKind,
  OutputLinkDefinition,
  RuntimeClass
} from '../../types/marketplace.js';

export interface RawActorMetadata {
  id?: string;
  name?: string;
  username?: string;
  title?: string;
  description?: string;
  categories?: string[];
  stats?: any;
  pricingModel?: string;
  pricingInfo?: any;
  pricingInfos?: any[];
  defaultRunOptions?: any;
  taggedBuilds?: any;
  versions?: any[];
  permissions?: any;
  mode?: string;
  inputSchema?: any;
  datasetSchema?: any;
  actorDefinition?: any;
  readme?: string;
}

export class CapabilityDetector {
  private static readonly CUSTOM_CODE_PATTERNS = [
    /pagefunction/i,
    /customfunction/i,
    /evalfunction/i,
    /prenavigationhooks/i,
    /postnavigationhooks/i,
    /codeeditor/i,
    /javascript/i,
    /puppeteerfunction/i,
    /playwrightfunction/i
  ];

  private static readonly CREDENTIAL_PATTERNS = [
    /\blogin\b/i,
    /\bpassword\b/i,
    /\bpasswd\b/i,
    /\bcookies\b/i,
    /\bcookie\b/i,
    /\bsession\b/i,
    /\btoken\b/i,
    /\bapikey\b/i,
    /\bapi_key\b/i,
    /\bsecret\b/i,
    /\bauth\b/i
  ];

  private static readonly ACCOUNT_STATE_PATTERNS = [
    /\bskip\b/i,
    /\bhistory\b/i,
    /\bsaved\b/i,
    /\blist\b/i,
    /\bdedupe\b/i,
    /\bprevious\b/i,
    /\bcache\b/i,
    /\bstate\b/i,
    /\bmemory\b/i
  ];

  private static readonly LOCATION_PATTERNS = [
    /location/i,
    /country/i,
    /city/i,
    /geo/i,
    /region/i,
    /postal/i,
    /zip/i
  ];

  public static detect(meta: RawActorMetadata): ActorCapabilities {
    const inputSchema = meta.inputSchema || {};
    const properties: Record<string, any> = inputSchema.properties || {};
    const datasetSchema = meta.datasetSchema || {};
    const actorDef = meta.actorDefinition || {};

    // 1. Detect input kinds
    const inputKindsSet = new Set<InputKind>();
    let hasCustomCode = false;
    let hasCredentials = false;
    let hasProxy = false;
    let hasAccountState = false;
    let supportsMaxItems = false;

    // Check run options or schema for maxItems
    if (meta.defaultRunOptions?.maxItems || meta.defaultRunOptions?.maxResults) {
      supportsMaxItems = true;
    }

    for (const [key, prop] of Object.entries(properties)) {
      if (!prop || typeof prop !== 'object') continue;
      const lowerKey = key.toLowerCase();
      const title = String(prop.title || '').toLowerCase();
      const desc = String(prop.description || '').toLowerCase();
      const editor = String(prop.editor || '').toLowerCase();
      const type = prop.type;

      // max items
      if (
        lowerKey === 'maxitems' ||
        lowerKey === 'maxresults' ||
        lowerKey === 'limit' ||
        lowerKey === 'count' ||
        lowerKey === 'max_items'
      ) {
        supportsMaxItems = true;
      }

      // custom code
      if (
        this.CUSTOM_CODE_PATTERNS.some((pat) => pat.test(key) || pat.test(title)) ||
        editor === 'javascript' ||
        editor === 'python'
      ) {
        hasCustomCode = true;
      }

      // credentials
      if (
        prop.isSecret === true ||
        editor === 'hidden' ||
        this.CREDENTIAL_PATTERNS.some((pat) => pat.test(key) || pat.test(title))
      ) {
        // Exclude generic search terms or non-sensitive words
        if (!lowerKey.includes('query') && !lowerKey.includes('keyword')) {
          hasCredentials = true;
        }
      }

      // proxy
      if (lowerKey.includes('proxy') || editor === 'proxy') {
        hasProxy = true;
      }

      // account state
      if (this.ACCOUNT_STATE_PATTERNS.some((pat) => pat.test(key) || pat.test(title))) {
        hasAccountState = true;
      }

      // Classify input kind
      if (type === 'boolean') {
        inputKindsSet.add('toggles');
      } else if (type === 'object') {
        if (editor === 'json') {
          inputKindsSet.add('json');
        } else {
          inputKindsSet.add('nested_objects');
        }
      } else if (type === 'integer' || type === 'number') {
        inputKindsSet.add('filters');
      } else if (
        editor === 'datepicker' ||
        prop.format === 'date' ||
        prop.format === 'date-time' ||
        lowerKey.includes('date')
      ) {
        inputKindsSet.add('date_range');
      } else if (
        editor === 'requestlistsources' ||
        editor === 'globlistsources' ||
        lowerKey.includes('url') ||
        title.includes('url')
      ) {
        inputKindsSet.add('url_list');
      } else if (
        lowerKey.includes('id') ||
        lowerKey.includes('handles') ||
        lowerKey.includes('usernames')
      ) {
        inputKindsSet.add('id_list');
      } else if (this.LOCATION_PATTERNS.some((p) => p.test(key) || p.test(title))) {
        inputKindsSet.add('location');
      } else if (
        lowerKey.includes('query') ||
        lowerKey.includes('keyword') ||
        lowerKey.includes('search') ||
        lowerKey.includes('term')
      ) {
        inputKindsSet.add('keyword');
      } else if (type === 'array') {
        inputKindsSet.add('filters');
      } else if (type === 'string') {
        if (Array.isArray(prop.enum)) {
          inputKindsSet.add('filters');
        } else {
          inputKindsSet.add('keyword');
        }
      }
    }

    if (inputKindsSet.size === 0) {
      inputKindsSet.add('keyword');
    }

    // 2. Pricing model
    let pricingModel: 'free_usage' | 'rental' | 'pay_per_result' | 'pay_per_event' | 'unknown' = 'unknown';
    const pricingInfos: any[] = Array.isArray(meta.pricingInfos) && meta.pricingInfos.length > 0
      ? meta.pricingInfos
      : meta.pricingInfo
        ? [meta.pricingInfo]
        : [];

    const directPricingModel = String(meta.pricingModel || '').toLowerCase();

    if (pricingInfos.length > 0) {
      const activePricing = pricingInfos[pricingInfos.length - 1];
      const pModel = String(
        activePricing.pricingModel ||
        activePricing.model ||
        directPricingModel ||
        ''
      ).toLowerCase();

      if (pModel.includes('result') || pModel === 'pay_per_result' || pModel === 'per_item') {
        pricingModel = 'pay_per_result';
        supportsMaxItems = true; // PPR always supports item limiting
      } else if (pModel.includes('event') || pModel === 'pay_per_event' || activePricing.pricingPerEvent) {
        pricingModel = 'pay_per_event';
      } else if (pModel.includes('rental') || pModel.includes('subscription') || pModel.includes('monthly')) {
        pricingModel = 'rental';
      } else if (pModel.includes('free') || pModel.includes('usage')) {
        pricingModel = 'free_usage';
      } else {
        pricingModel = 'unknown';
      }
    } else if (directPricingModel) {
      if (directPricingModel.includes('result') || directPricingModel === 'pay_per_result' || directPricingModel === 'per_item') {
        pricingModel = 'pay_per_result';
        supportsMaxItems = true;
      } else if (directPricingModel.includes('event') || directPricingModel === 'pay_per_event') {
        pricingModel = 'pay_per_event';
      } else if (directPricingModel.includes('rental') || directPricingModel.includes('monthly')) {
        pricingModel = 'rental';
      } else if (directPricingModel.includes('free') || directPricingModel.includes('usage')) {
        pricingModel = 'free_usage';
      } else {
        pricingModel = 'unknown';
      }
    } else {
      pricingModel = 'free_usage';
    }

    // 3. Output discovery (Dataset views, KV collections, Output links)
    const datasetViews: DatasetViewDefinition[] = [];
    const kvCollections: KVCollectionDefinition[] = [];
    const outputLinks: OutputLinkDefinition[] = [];
    const outputKindsSet = new Set<OutputKind>();

    // From datasetSchema or actorDefinition
    const rawViews =
      datasetSchema.views ||
      actorDef.storages?.dataset?.views ||
      actorDef.dataset?.views ||
      actorDef.views ||
      [];

    if (Array.isArray(rawViews)) {
      for (const v of rawViews) {
        if (!v || typeof v !== 'object') continue;
        const fields = Array.isArray(v.transformation?.fields)
          ? v.transformation.fields
          : Array.isArray(v.fields)
            ? v.fields
            : [];
        datasetViews.push({
          title: v.title || 'Default View',
          description: v.description,
          fields,
          display_component: v.display?.component || v.displayComponent,
          properties: v.display?.properties || v.properties
        });
      }
    }

    // KV collections
    const rawKv =
      actorDef.storages?.keyValueStore?.collections ||
      actorDef.keyValueStore?.collections ||
      [];
    if (Array.isArray(rawKv)) {
      for (const col of rawKv) {
        if (!col || typeof col !== 'object') continue;
        kvCollections.push({
          key_prefix: col.keyPrefix,
          key: col.key,
          content_types: col.contentTypes
        });
      }
    }

    // Output links
    const rawOutputs = actorDef.output || actorDef.outputs;
    if (rawOutputs && typeof rawOutputs === 'object') {
      const props = rawOutputs.properties || rawOutputs;
      for (const [outKey, outDef] of Object.entries(props)) {
        if (outDef && typeof outDef === 'object' && (outDef as any).template) {
          outputLinks.push({
            template: (outDef as any).template,
            label: (outDef as any).title || outKey
          });
        }
      }
    }

    // Check files presence heuristic from title, readme, description
    const descText = `${meta.title || ''} ${meta.description || ''} ${meta.readme || ''}`.toLowerCase();
    const producesFiles =
      kvCollections.length > 0 ||
      outputLinks.some((l) => l.template.includes('.pdf') || l.template.includes('.png') || l.template.includes('.zip')) ||
      descText.includes('screenshot') ||
      descText.includes('download pdf') ||
      descText.includes('zip file') ||
      descText.includes('export images');

    if (producesFiles) {
      outputKindsSet.add('key_value_files');
    }
    outputKindsSet.add('dataset'); // Default primary output

    if (outputLinks.length > 1 || datasetViews.length > 1) {
      outputKindsSet.add('multiple_outputs');
    }

    // 4. Runtime class
    let runtimeClass: RuntimeClass = 'unknown';
    const timeoutSecs = meta.defaultRunOptions?.timeoutSecs;
    if (timeoutSecs) {
      if (timeoutSecs <= 120) runtimeClass = 'quick';
      else if (timeoutSecs <= 1800) runtimeClass = 'medium';
      else runtimeClass = 'long';
    } else {
      runtimeClass = 'medium'; // default baseline
    }

    // 5. Mode (standby / normal)
    const mode = (meta.mode && meta.mode.toLowerCase().includes('standby')) ? 'standby' : 'normal';

    // 6. Permission level (limited vs full)
    let permissionLevel: 'limited' | 'full' = 'limited';
    if (meta.permissions) {
      if (
        meta.permissions === 'full' ||
        meta.permissions?.full === true ||
        (Array.isArray(meta.permissions) && meta.permissions.includes('full'))
      ) {
        permissionLevel = 'full';
      }
    }

    // 7. Stateful or interactive (e.g. requires manual captcha solving or browser live login)
    const statefulOrInteractive =
      descText.includes('interactive login') ||
      descText.includes('manual captcha') ||
      descText.includes('phone 2fa required');

    return {
      input_kinds: Array.from(inputKindsSet),
      supports_max_items: supportsMaxItems,
      pricing_model: pricingModel,
      output_kinds: Array.from(outputKindsSet),
      dataset_views: datasetViews,
      kv_collections: kvCollections,
      output_links: outputLinks,
      runtime_class: runtimeClass,
      has_custom_code_inputs: hasCustomCode,
      has_credentials_inputs: hasCredentials,
      has_proxy_input: hasProxy,
      has_account_state: hasAccountState,
      mode,
      permission_level: permissionLevel,
      stateful_or_interactive: statefulOrInteractive
    };
  }
}

export class CompatibilityClassifier {
  public static classify(capabilities: ActorCapabilities, meta?: RawActorMetadata): ActorCompatibility {
    const reasons: string[] = [];
    const evidence: CompatibilityEvidence[] = [];

    // Rule 1: Standby/HTTP-mode-only actors -> UNSUPPORTED
    if (capabilities.mode === 'standby') {
      reasons.push('Standby/HTTP-mode actors are not currently supported for automated batch extraction.');
      evidence.push({ check: 'mode_check', detail: 'Actor runs in standby/HTTP server mode.' });
      return {
        classification: 'UNSUPPORTED',
        reasons,
        evidence
      };
    }

    // Rule 2: Stateful / interactive required -> UNSUPPORTED
    if (capabilities.stateful_or_interactive) {
      reasons.push('Actor requires real-time manual user interaction or interactive 2FA, which cannot be automated.');
      evidence.push({ check: 'stateful_interactive_check', detail: 'Interactive login/captcha intervention required.' });
      return {
        classification: 'UNSUPPORTED',
        reasons,
        evidence
      };
    }

    // Rule 3: Full-permission actor -> ADMIN_REVIEW_REQUIRED / UNSUPPORTED
    if (capabilities.permission_level === 'full') {
      reasons.push('Actor requests FULL provider account permissions, posing severe multi-tenant data access risk.');
      evidence.push({ check: 'permission_level', detail: 'Permission level is set to "full".' });
      return {
        classification: 'ADMIN_REVIEW_REQUIRED',
        reasons,
        evidence
      };
    }

    // Rule 4: Unknown / unparseable pricing -> ADMIN_REVIEW_REQUIRED
    if (capabilities.pricing_model === 'unknown') {
      reasons.push('Upstream pricing model is unparseable or unspecified. Must be manually priced before activation.');
      evidence.push({ check: 'pricing_model', detail: 'Pricing model could not be automatically resolved.' });
      return {
        classification: 'ADMIN_REVIEW_REQUIRED',
        reasons,
        evidence
      };
    }

    // Rule 5: Risky inputs: Custom code inputs (pageFunction, etc.)
    if (capabilities.has_custom_code_inputs) {
      reasons.push('Actor contains custom code/hook inputs (e.g. pageFunction). These must remain hidden/locked from customers.');
      evidence.push({ check: 'custom_code_inputs', detail: 'Schema contains executable code or hook parameters.' });
    }

    // Rule 6: Credentials / cookies / secret inputs
    if (capabilities.has_credentials_inputs) {
      reasons.push('Actor contains authentication or cookie inputs. Multi-tenant credentials must be strictly controlled.');
      evidence.push({ check: 'credential_inputs', detail: 'Schema contains session/cookie/secret fields.' });
    }

    // Rule 7: Account state (skip history, lists, saved dedupe memory)
    if (capabilities.has_account_state) {
      reasons.push('Actor contains stateful history/list inputs that could leak or conflict across multiple platform customers.');
      evidence.push({ check: 'account_state', detail: 'Schema contains skip/history/list deduplication fields.' });
    }

    // Rule 8: Proxy inputs
    if (capabilities.has_proxy_input) {
      evidence.push({ check: 'proxy_input', detail: 'Proxy configuration fields safely abstracted to server-side defaults.' });
    }

    // Determine final classification
    if (reasons.length > 0) {
      // If there are sensitive inputs (code, credentials, or state), require limits or review
      if (capabilities.has_custom_code_inputs || capabilities.has_credentials_inputs || capabilities.has_account_state) {
        return {
          classification: 'SUPPORTED_WITH_LIMITS',
          reasons,
          evidence
        };
      }
      return {
        classification: 'SUPPORTED_WITH_LIMITS',
        reasons,
        evidence
      };
    }

    // All clean!
    evidence.push({ check: 'clean_pass', detail: 'All capability, security, and pricing checks passed successfully.' });
    return {
      classification: 'FULLY_SUPPORTED',
      reasons: ['All compatibility and security checks passed without limitations.'],
      evidence
    };
  }
}

export class ActorProfileService {
  /**
   * Generates a complete ActorProfile from metadata
   */
  public static buildProfile(meta: RawActorMetadata): ActorProfile {
    const capabilities = CapabilityDetector.detect(meta);
    const compatibility = CompatibilityClassifier.classify(capabilities, meta);

    return {
      actor_id: meta.id || meta.name || 'unknown-actor',
      title: meta.title || meta.name || 'Untitled Actor',
      name: meta.name || meta.id || 'unnamed-actor',
      build_number: meta.taggedBuilds?.latest?.buildNumber || meta.defaultRunOptions?.build,
      capabilities,
      compatibility,
      detected_at: new Date().toISOString()
    };
  }

  /**
   * Applies an admin override to an ActorProfile's compatibility classification with audit reason
   */
  public static applyAdminOverride(
    profile: ActorProfile,
    newClassification: CompatibilityClassification,
    adminUserId: string,
    reason: string
  ): ActorProfile {
    const original = profile.compatibility.classification;
    return {
      ...profile,
      compatibility: {
        ...profile.compatibility,
        classification: newClassification,
        admin_override: {
          original_classification: original,
          overridden_by: adminUserId,
          reason,
          overridden_at: new Date().toISOString()
        }
      }
    };
  }
}
