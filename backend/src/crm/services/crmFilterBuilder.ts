import { FilterCondition, FilterGroup } from '../models/types.js';

export interface SqlFragment {
  sql: string;
  params: any[];
}

export class CrmFilterBuilder {
  /**
   * Build parameterized SQL WHERE fragment from FilterGroup
   */
  public static buildFilterClause(
    filter: FilterGroup,
    isPostgres: boolean,
    paramOffset: number = 1
  ): SqlFragment {
    const params: any[] = [];
    let currentOffset = paramOffset;

    const buildGroup = (group: FilterGroup): string => {
      if (!group.conditions || group.conditions.length === 0) {
        return '1=1';
      }

      const clauses: string[] = [];
      const combinator = group.combinator === 'OR' ? ' OR ' : ' AND ';

      for (const item of group.conditions) {
        if ('combinator' in item) {
          // Nested group
          const nested = buildGroup(item as FilterGroup);
          if (nested && nested !== '1=1') {
            clauses.push(`(${nested})`);
          }
        } else {
          // Single condition
          const cond = item as FilterCondition;
          const fragment = this.buildCondition(cond, isPostgres, currentOffset);
          if (fragment.sql) {
            clauses.push(fragment.sql);
            params.push(...fragment.params);
            currentOffset += fragment.params.length;
          }
        }
      }

      return clauses.length > 0 ? clauses.join(combinator) : '1=1';
    };

    const sql = buildGroup(filter);
    return { sql, params };
  }

  private static buildCondition(
    cond: FilterCondition,
    isPostgres: boolean,
    offset: number
  ): SqlFragment {
    if (!cond.field) return { sql: '', params: [] };

    // Standard columns vs custom fields
    const standardFields = new Set([
      'first_name',
      'last_name',
      'email',
      'email_normalized',
      'phone',
      'phone_e164',
      'title',
      'country',
      'city',
      'source',
      'lead_score',
      'status',
      'email_status',
      'created_at',
      'updated_at'
    ]);

    let columnRef: string;
    if (standardFields.has(cond.field)) {
      columnRef = cond.field;
    } else {
      // Custom field
      if (isPostgres) {
        columnRef = `(custom_fields->>'${cond.field.replace(/'/g, "''")}')`;
      } else {
        columnRef = `json_extract(custom_fields, '$.${cond.field.replace(/'/g, "''")}')`;
      }
    }

    const placeholder = (idx: number) => (isPostgres ? `$${idx}` : '?');

    switch (cond.operator) {
      case 'equals':
        return {
          sql: `${columnRef} = ${placeholder(offset)}`,
          params: [cond.value]
        };

      case 'not_equals':
        return {
          sql: `(${columnRef} IS NULL OR ${columnRef} != ${placeholder(offset)})`,
          params: [cond.value]
        };

      case 'contains':
        return {
          sql: `${columnRef} LIKE ${placeholder(offset)}`,
          params: [`%${cond.value}%`]
        };

      case 'not_contains':
        return {
          sql: `(${columnRef} IS NULL OR ${columnRef} NOT LIKE ${placeholder(offset)})`,
          params: [`%${cond.value}%`]
        };

      case 'starts_with':
        return {
          sql: `${columnRef} LIKE ${placeholder(offset)}`,
          params: [`${cond.value}%`]
        };

      case 'ends_with':
        return {
          sql: `${columnRef} LIKE ${placeholder(offset)}`,
          params: [`%${cond.value}`]
        };

      case 'is_set':
        return {
          sql: `(${columnRef} IS NOT NULL AND ${columnRef} != '')`,
          params: []
        };

      case 'is_not_set':
        return {
          sql: `(${columnRef} IS NULL OR ${columnRef} = '')`,
          params: []
        };

      case 'gt':
        return {
          sql: `${columnRef} > ${placeholder(offset)}`,
          params: [cond.value]
        };

      case 'gte':
        return {
          sql: `${columnRef} >= ${placeholder(offset)}`,
          params: [cond.value]
        };

      case 'lt':
        return {
          sql: `${columnRef} < ${placeholder(offset)}`,
          params: [cond.value]
        };

      case 'lte':
        return {
          sql: `${columnRef} <= ${placeholder(offset)}`,
          params: [cond.value]
        };

      case 'in': {
        const arr = Array.isArray(cond.value) ? cond.value : [cond.value];
        if (arr.length === 0) return { sql: '1=0', params: [] };
        const placeholders = arr.map((_, i) => placeholder(offset + i)).join(', ');
        return {
          sql: `${columnRef} IN (${placeholders})`,
          params: arr
        };
      }

      case 'not_in': {
        const arr = Array.isArray(cond.value) ? cond.value : [cond.value];
        if (arr.length === 0) return { sql: '1=1', params: [] };
        const placeholders = arr.map((_, i) => placeholder(offset + i)).join(', ');
        return {
          sql: `(${columnRef} IS NULL OR ${columnRef} NOT IN (${placeholders}))`,
          params: arr
        };
      }

      default:
        return { sql: '', params: [] };
    }
  }
}

