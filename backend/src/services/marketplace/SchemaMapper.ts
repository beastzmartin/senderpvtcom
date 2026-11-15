import {
  InputFieldDefinition,
  InputFieldType,
  ProductInputDefinition
} from '../../types/marketplace.js';

export interface SchemaMappingResult {
  fields: InputFieldDefinition[];
  staticOverrides: Record<string, any>;
  hiddenDefaults: Record<string, any>;
  multiCustomerRiskFields: string[];
  unmappedFieldCount: number;
  sections: Array<{ caption: string; description?: string; fields: string[] }>;
}

export class SchemaMapper {
  private static readonly SENSITIVE_OR_INTERNAL_KEYS = new Set([
    'proxyconfiguration',
    'proxy',
    'useapifyproxy',
    'apifyproxygroups',
    'customproxies',
    'debuglog',
    'debug',
    'verbose',
    'memorymbytes',
    'timeoutsecs',
    'webhook',
    'webhooks',
    'postrunwebhook',
    'apifytoken',
    'token'
  ]);

  private static readonly MULTI_CUSTOMER_RISK_PATTERNS = [
    /\bskip\b/i,
    /\bhistory\b/i,
    /\blist\b/i,
    /\bsession\b/i,
    /\bcookie\b/i,
    /\bcookies\b/i,
    /\bdedupe\b/i,
    /\bprevious\b/i,
    /\bcache\b/i,
    /\bstate\b/i
  ];

  /**
   * Map provider JSON Schema / Apify input schema to our ProductInputDefinition
   */
  public static mapSchema(inputSchema: any): SchemaMappingResult {
    const fields: InputFieldDefinition[] = [];
    const staticOverrides: Record<string, any> = {};
    const hiddenDefaults: Record<string, any> = {};
    const multiCustomerRiskFields: string[] = [];
    const sectionsMap = new Map<string, { caption: string; description?: string; fields: string[] }>();

    if (!inputSchema || typeof inputSchema !== 'object') {
      return {
        fields: [],
        staticOverrides: {},
        hiddenDefaults: {},
        multiCustomerRiskFields: [],
        unmappedFieldCount: 0,
        sections: []
      };
    }

    const properties = inputSchema.properties || {};
    const requiredSet = new Set(Array.isArray(inputSchema.required) ? inputSchema.required : []);
    let currentSectionCaption = 'General Options';
    let currentSectionDesc = '';

    for (const [propKey, propVal] of Object.entries(properties as Record<string, any>)) {
      if (!propVal || typeof propVal !== 'object') continue;

      const lowerKey = propKey.toLowerCase();

      // Check section captions
      if (propVal.sectionCaption) {
        currentSectionCaption = String(propVal.sectionCaption);
        currentSectionDesc = String(propVal.sectionDescription || '');
      }

      // Check multi-customer state risks
      const isRisk = this.MULTI_CUSTOMER_RISK_PATTERNS.some((pat) => pat.test(propKey) || pat.test(propVal.title || ''));
      if (isRisk) {
        multiCustomerRiskFields.push(propKey);
      }

      // Internal or secret fields are automatically converted to hidden defaults or locked overrides
      const isInternal =
        this.SENSITIVE_OR_INTERNAL_KEYS.has(lowerKey) ||
        propVal.isSecret === true ||
        propVal.editor === 'hidden' ||
        lowerKey.includes('proxy');

      if (isInternal) {
        let defaultVal = propVal.default !== undefined ? propVal.default : propVal.prefill;
        if (defaultVal === undefined && lowerKey.includes('proxy')) {
          defaultVal = { useApifyProxy: true };
        }
        if (defaultVal !== undefined) {
          hiddenDefaults[propKey] = defaultVal;
        }
        continue;
      }

      // Determine clean field type
      const fieldType = this.resolveFieldType(propVal);

      // Resolve options for select / multiselect
      let options: Array<{ label: string; value: string | number }> | undefined = undefined;
      const rawEnum = propVal.enum || (propVal.items && propVal.items.enum);
      if (Array.isArray(rawEnum) && rawEnum.length > 0) {
        const enumTitles = propVal.enumTitles || (propVal.items && propVal.items.enumTitles) || [];
        options = rawEnum.map((val: any, idx: number) => ({
          label: String(enumTitles[idx] || val || 'None'),
          value: val
        }));
      }

      // Normalize default value
      let defaultVal = propVal.default;
      if (defaultVal === undefined && propVal.prefill !== undefined) {
        defaultVal = propVal.prefill;
      }
      if (defaultVal === undefined) {
        if (fieldType === 'boolean') defaultVal = false;
        else if (fieldType === 'number') defaultVal = propVal.minimum || null;
        else if (fieldType === 'string_list' || fieldType === 'url_list' || fieldType === 'multiselect') defaultVal = [];
        else defaultVal = '';
      }

      const ourKey = propKey.toLowerCase().replace(/[^a-z0-9_]/g, '_');

      const fieldDef: InputFieldDefinition = {
        key: ourKey,
        provider_key: propKey,
        label: propVal.title || propKey,
        help: propVal.description || '',
        type: fieldType,
        required: requiredSet.has(propKey),
        default: defaultVal,
        options,
        min: propVal.minimum !== undefined ? propVal.minimum : propVal.minLength !== undefined ? propVal.minLength : null,
        max: propVal.maximum !== undefined ? propVal.maximum : propVal.maxLength !== undefined ? propVal.maxLength : null,
        visible_to_user: true,
        section_caption: currentSectionCaption,
        section_description: currentSectionDesc,
        advanced: Boolean(propVal.sectionCaption && propVal.sectionCaption.toLowerCase().includes('advanced')),
        unit: propVal.unit || undefined,
        pattern: propVal.pattern || undefined,
        placeholder: propVal.example ? String(propVal.example) : undefined
      };

      fields.push(fieldDef);

      // Track section grouping
      if (!sectionsMap.has(currentSectionCaption)) {
        sectionsMap.set(currentSectionCaption, {
          caption: currentSectionCaption,
          description: currentSectionDesc,
          fields: []
        });
      }
      sectionsMap.get(currentSectionCaption)!.fields.push(ourKey);
    }

    return {
      fields,
      staticOverrides,
      hiddenDefaults,
      multiCustomerRiskFields,
      unmappedFieldCount: 0,
      sections: Array.from(sectionsMap.values())
    };
  }

  /**
   * Resolves schema property to one of our strict InputFieldTypes
   */
  private static resolveFieldType(prop: any): InputFieldType {
    const type = prop.type;
    const editor = prop.editor ? String(prop.editor).toLowerCase() : '';

    if (editor === 'textarea') return 'textarea';
    if (editor === 'datepicker' || prop.format === 'date' || prop.format === 'date-time') return 'date';

    if (type === 'array') {
      if (
        editor === 'select' ||
        editor === 'multiselect' ||
        Array.isArray(prop.enum) ||
        (prop.items && Array.isArray(prop.items.enum))
      ) {
        return 'multiselect';
      }
      if (
        editor === 'requestlistsources' ||
        editor === 'globlistsources' ||
        prop.title?.toLowerCase().includes('url') ||
        prop.description?.toLowerCase().includes('url')
      ) {
        return 'url_list';
      }
      return 'string_list';
    }

    if (editor === 'select' || (Array.isArray(prop.enum) && prop.enum.length > 0)) return 'select';

    if (type === 'boolean') return 'boolean';
    if (type === 'integer' || type === 'number') return 'number';

    if (type === 'object') {
      if (editor === 'keyvalue' || editor === 'key_value' || prop.patternProperties) return 'key_value';
      return 'object';
    }

    if (type === 'string') {
      if (prop.title?.toLowerCase().includes('url') && !editor) return 'url';
      return 'text';
    }

    return 'json'; // Safe fallback, never drops fields!
  }

  /**
   * Server-side input payload builder & validator
   * Transforms customer submitted form values into provider-compatible payload
   */
  public static buildProviderPayload(
    inputDef: ProductInputDefinition,
    userValues: Record<string, any>,
    enforceValidation: boolean = true
  ): { payload: Record<string, any>; errors: string[] } {
    const payload: Record<string, any> = {};
    const errors: string[] = [];

    // 1. Inject hidden defaults
    if (inputDef.hidden_defaults) {
      Object.assign(payload, inputDef.hidden_defaults);
    }

    // 2. Map user provided fields
    for (const field of inputDef.fields) {
      // If field is locked by admin, always use the locked value
      if (field.locked_value !== undefined) {
        payload[field.provider_key] = field.locked_value;
        continue;
      }

      // Check conditional visibility (show_if)
      if (field.show_if) {
        const dependentValue = userValues[field.show_if.field];
        if (dependentValue !== field.show_if.equals) {
          continue; // Skipped because condition is not satisfied
        }
      }

      let val = userValues[field.key];
      if (val === undefined || val === null || val === '') {
        val = field.default !== undefined ? field.default : null;
      }

      if (enforceValidation) {
        if (field.required && (val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0))) {
          errors.push(`Field "${field.label}" (${field.key}) is required.`);
          continue;
        }

        if (val !== null && val !== undefined) {
          if (field.type === 'number') {
            const num = Number(val);
            if (isNaN(num)) {
              errors.push(`Field "${field.label}" must be a valid number.`);
            } else {
              if (field.min !== null && field.min !== undefined && num < field.min) {
                errors.push(`Field "${field.label}" cannot be less than ${field.min}.`);
              }
              if (field.max !== null && field.max !== undefined && num > field.max) {
                errors.push(`Field "${field.label}" cannot be greater than ${field.max}.`);
              }
              val = num;
            }
          } else if (field.type === 'boolean') {
            val = Boolean(val);
          } else if (field.type === 'url') {
            try {
              const u = new URL(String(val));
              if (!['http:', 'https:'].includes(u.protocol)) {
                errors.push(`Field "${field.label}" must be a valid HTTP/HTTPS URL.`);
              }
            } catch {
              errors.push(`Field "${field.label}" is not a valid URL.`);
            }
          } else if (field.type === 'string_list' || field.type === 'url_list') {
            if (typeof val === 'string') {
              val = val.split('\n').map((s) => s.trim()).filter(Boolean);
            }
            if (!Array.isArray(val)) {
              val = [];
            }
          }
        }
      }

      if (val !== null && val !== undefined) {
        payload[field.provider_key] = val;
      }
    }

    // 3. Inject static overrides
    if (inputDef.static_overrides) {
      Object.assign(payload, inputDef.static_overrides);
    }

    return { payload, errors };
  }
}
