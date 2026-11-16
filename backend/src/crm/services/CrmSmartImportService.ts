import { SmartImportAnalysis, SmartImportColumnMapping } from '../models/types.js';

export class CrmSmartImportService {
  private static instance: CrmSmartImportService | null = null;

  public static getInstance(): CrmSmartImportService {
    if (!CrmSmartImportService.instance) {
      CrmSmartImportService.instance = new CrmSmartImportService();
    }
    return CrmSmartImportService.instance;
  }

  /**
   * Analyzes raw CSV header strings and sample row values, producing an intelligent
   * column mapping, inferred country codes, and data anomaly warnings.
   */
  public analyzeHeaders(headers: string[], sampleRows: Record<string, any>[] = []): SmartImportAnalysis {
    const mappings: SmartImportColumnMapping[] = [];
    const detectedAnomalies: string[] = [];

    // Header standard dictionary
    const dictionary: Record<string, string[]> = {
      first_name: ['first_name', 'fname', 'first name', 'given name', 'forename'],
      last_name: ['last_name', 'lname', 'last name', 'surname', 'family name'],
      name: ['name', 'full_name', 'fullname', 'contact name', 'lead name', 'prospect'],
      email: ['email', 'e_mail', 'e-mail', 'email_address', 'mail', 'email address', 'contact email'],
      phone: ['phone', 'mobile', 'cell', 'tel', 'telephone', 'mob', 'mob_no', 'whatsapp', 'phone_number', 'contact number', 'cellphone'],
      company_name: ['company', 'company_name', 'org', 'organization', 'business', 'employer', 'account', 'firm'],
      job_title: ['title', 'job_title', 'designation', 'role', 'position', 'job title', 'rank'],
      country: ['country', 'nation', 'nationality', 'geo_country'],
      city: ['city', 'town', 'municipality'],
      state: ['state', 'province', 'region'],
      postal_code: ['zip', 'zipcode', 'postal_code', 'postal', 'pin', 'pincode'],
      address: ['address', 'street', 'street_address'],
      website: ['website', 'site', 'url', 'web', 'domain'],
      linkedin_url: ['linkedin', 'linkedin_url', 'profile_url', 'social'],
      tags: ['tag', 'tags', 'labels', 'categories', 'segment'],
      notes: ['note', 'notes', 'comment', 'comments', 'remark', 'description']
    };

    let hasEmailColumn = false;
    let hasPhoneColumn = false;
    let inferredCountryCode: string | undefined = undefined;

    // 1. Analyze each header
    for (const rawHeader of headers) {
      const clean = rawHeader.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      let matchedField = '';
      let confidence = 0.5;

      for (const [crmField, aliases] of Object.entries(dictionary)) {
        for (const alias of aliases) {
          if (clean === alias || clean === alias.replace(/_/g, ' ')) {
            matchedField = crmField;
            confidence = 0.99;
            break;
          } else if (clean.includes(alias) || alias.includes(clean)) {
            if (!matchedField || confidence < 0.85) {
              matchedField = crmField;
              confidence = 0.85;
            }
          }
        }
        if (confidence >= 0.99) break;
      }

      if (!matchedField) {
        matchedField = `custom_${rawHeader.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30)}`;
        confidence = 0.40;
      }

      if (matchedField === 'email') hasEmailColumn = true;
      if (matchedField === 'phone') hasPhoneColumn = true;

      // Extract sample value if available
      let sampleVal: string | undefined = undefined;
      for (const row of sampleRows) {
        const val = row[rawHeader];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          sampleVal = String(val).trim();
          break;
        }
      }

      mappings.push({
        csv_header: rawHeader,
        mapped_crm_field: matchedField,
        confidence,
        sample_value: sampleVal
      });
    }

    // 2. Identify missing primary identifiers
    if (!hasEmailColumn && !hasPhoneColumn) {
      detectedAnomalies.push('CRITICAL: Neither email nor phone column was confidently detected. Records may fail deduplication.');
    }

    // 3. Inspect sample rows for country code inference and data anomalies
    let indianPhonePatterns = 0;
    let usPhonePatterns = 0;
    let unformattedPhones = 0;

    for (const row of sampleRows) {
      for (const map of mappings) {
        const val = String(row[map.csv_header] || '').trim();
        if (!val) continue;

        if (map.mapped_crm_field === 'phone') {
          if (!val.startsWith('+')) {
            unformattedPhones++;
            const digits = val.replace(/\D/g, '');
            if (digits.length === 10) {
              if (['9', '8', '7', '6'].includes(digits[0])) {
                indianPhonePatterns++;
              } else {
                usPhonePatterns++;
              }
            }
          }

          // Check if user accidentally mapped email column to phone
          if (val.includes('@')) {
            detectedAnomalies.push(`Warning: Column "${map.csv_header}" mapped to phone contains email values (e.g. "${val}").`);
          }
        }

        if (map.mapped_crm_field === 'email') {
          if (!val.includes('@') || !val.includes('.')) {
            detectedAnomalies.push(`Warning: Column "${map.csv_header}" mapped to email contains invalid format "${val}".`);
          }
        }
      }
    }

    // Infert default country code if many phones lack '+'
    if (unformattedPhones > 0) {
      if (indianPhonePatterns >= usPhonePatterns && indianPhonePatterns > 0) {
        inferredCountryCode = '+91';
        detectedAnomalies.push(`Notice: Detected ${unformattedPhones} phone numbers without '+' international prefix. Inferred country calling code +91 (India).`);
      } else if (usPhonePatterns > 0) {
        inferredCountryCode = '+1';
        detectedAnomalies.push(`Notice: Detected ${unformattedPhones} phone numbers without '+' international prefix. Inferred country calling code +1 (North America).`);
      }
    }

    return {
      total_columns: headers.length,
      mappings,
      country_code_inferred: inferredCountryCode,
      detected_anomalies: [...new Set(detectedAnomalies)]
    };
  }
}

