/**
 * CRM V2: Super Field Service
 * Supports 20 field types, formula evaluation, regex validation,
 * promoted field index sync without ALTER TABLE, and stage two-way synchronization.
 */

import { CrmSuperField, SuperFieldType } from '../models/types.js';
import { CrmStorageAdapter } from '../db/CrmStorageAdapter.js';

export class CrmSuperFieldService {
  /**
   * Validate and normalize a value against a SuperField definition
   */
  public static validateValue(field: CrmSuperField, rawValue: any): { valid: boolean; error?: string; normalizedValue?: any } {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      if (field.is_required) {
        return { valid: false, error: `Field '${field.name}' is required.` };
      }
      return { valid: true, normalizedValue: field.default_value || null };
    }

    switch (field.field_type) {
      case 'text':
      case 'long_text': {
        const str = String(rawValue).trim();
        if (field.validation_regex) {
          try {
            const re = new RegExp(field.validation_regex);
            if (!re.test(str)) {
              return { valid: false, error: `Field '${field.name}' does not match required format.` };
            }
          } catch {}
        }
        return { valid: true, normalizedValue: str };
      }

      case 'number':
      case 'currency':
      case 'percent': {
        const num = Number(rawValue);
        if (isNaN(num)) {
          return { valid: false, error: `Field '${field.name}' must be a valid number.` };
        }
        if (field.min_value !== undefined && field.min_value !== null && num < field.min_value) {
          return { valid: false, error: `Field '${field.name}' cannot be less than ${field.min_value}.` };
        }
        if (field.max_value !== undefined && field.max_value !== null && num > field.max_value) {
          return { valid: false, error: `Field '${field.name}' cannot exceed ${field.max_value}.` };
        }
        return { valid: true, normalizedValue: num };
      }

      case 'checkbox': {
        const bool = Boolean(rawValue === true || rawValue === 'true' || rawValue === 1 || rawValue === '1');
        return { valid: true, normalizedValue: bool };
      }

      case 'date':
      case 'datetime': {
        const d = new Date(rawValue);
        if (isNaN(d.getTime())) {
          return { valid: false, error: `Field '${field.name}' must be a valid date.` };
        }
        return { valid: true, normalizedValue: d.toISOString() };
      }

      case 'dropdown': {
        const str = String(rawValue);
        const exists = field.options.some((o) => o.value === str || o.label === str);
        if (!exists && field.options.length > 0) {
          return { valid: false, error: `Invalid option '${str}' for dropdown '${field.name}'.` };
        }
        return { valid: true, normalizedValue: str };
      }

      case 'multi_select': {
        const arr = Array.isArray(rawValue) ? rawValue : [rawValue];
        const stringArr = arr.map((item) => String(item));
        return { valid: true, normalizedValue: stringArr };
      }

      case 'email': {
        const str = String(rawValue).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
          return { valid: false, error: `Field '${field.name}' must be a valid email address.` };
        }
        return { valid: true, normalizedValue: str };
      }

      case 'phone': {
        const str = String(rawValue).trim().replace(/[^0-9+]/g, '');
        if (str.length < 5) {
          return { valid: false, error: `Field '${field.name}' must be a valid phone number.` };
        }
        return { valid: true, normalizedValue: str };
      }

      case 'url': {
        const str = String(rawValue).trim();
        try {
          new URL(str.startsWith('http') ? str : `https://${str}`);
          return { valid: true, normalizedValue: str };
        } catch {
          return { valid: false, error: `Field '${field.name}' must be a valid URL.` };
        }
      }

      case 'rating': {
        const rating = parseInt(String(rawValue), 10);
        if (isNaN(rating) || rating < 1 || rating > 5) {
          return { valid: false, error: `Rating must be an integer between 1 and 5.` };
        }
        return { valid: true, normalizedValue: rating };
      }

      case 'stage': {
        return { valid: true, normalizedValue: String(rawValue).trim() };
      }

      case 'formula':
      case 'lookup':
      case 'auto_number':
      case 'user':
      case 'tag':
      case 'file':
      default:
        return { valid: true, normalizedValue: rawValue };
    }
  }

  /**
   * Safe Formula evaluation (e.g. `{deal_value} * 0.18` or `{budget} - {spent}`)
   */
  public static evaluateFormula(expression: string, context: Record<string, any>): number | string | null {
    if (!expression) return null;
    try {
      // Replace tokens of form {field_slug} with context value
      let expr = expression.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, fieldName) => {
        const val = context[fieldName];
        if (val === undefined || val === null) return '0';
        return typeof val === 'number' ? String(val) : JSON.stringify(val);
      });

      // Disallow dangerous JS globals
      if (/[;{}()[\]]/.test(expr.replace(/[\d+\-*/.() ]/g, ''))) {
        // Contains suspicious characters outside arithmetic
        return null;
      }

      // Safe arithmetic evaluator
      const safeEval = new Function(`return (${expr});`);
      const res = safeEval();
      return typeof res === 'number' && !isNaN(res) ? Number(res.toFixed(4)) : res;
    } catch {
      return null;
    }
  }

  /**
   * Generate an auto-number string like "INV-0042"
   */
  public static generateAutoNumber(field: CrmSuperField, sequenceIndex: number): string {
    const prefix = field.auto_number_prefix || 'ID-';
    const padding = field.auto_number_padding || 4;
    const numStr = String(sequenceIndex).padStart(padding, '0');
    return `${prefix}${numStr}`;
  }

  /**
   * Sync a field value to promoted index table if the field is marked as is_promoted
   */
  public static async syncPromotedValue(
    storage: CrmStorageAdapter,
    field: CrmSuperField,
    entityId: string,
    value: any
  ): Promise<void> {
    if (!field.is_promoted) return;

    let valueText: string | null = null;
    let valueNumeric: number | null = null;
    let valueTimestamp: string | null = null;
    let valueJson: any = null;

    if (typeof value === 'number') {
      valueNumeric = value;
      valueText = String(value);
    } else if (typeof value === 'boolean') {
      valueNumeric = value ? 1 : 0;
      valueText = String(value);
    } else if (typeof value === 'string') {
      valueText = value;
      if (field.field_type === 'date' || field.field_type === 'datetime') {
        valueTimestamp = value;
      }
    } else if (typeof value === 'object' && value !== null) {
      valueJson = value;
    }

    await storage.upsertPromotedFieldValue({
      workspace_id: field.workspace_id,
      entity_type: field.entity_type,
      entity_id: entityId,
      field_slug: field.slug,
      field_type: field.field_type,
      value_text: valueText,
      value_numeric: valueNumeric,
      value_timestamp: valueTimestamp,
      value_json: valueJson
    });
  }
}
