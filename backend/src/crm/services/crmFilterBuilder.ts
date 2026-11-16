import { FilterCondition, FilterGroup } from '../models/types.js';

export interface SqlFragment {
  sql: string;
  params: any[];
}

export class CrmFilterBuilder {
  /**
   * Build parameterized SQL WHERE fragment from nested FilterGroup
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
      const isNot = group.combinator === 'NOT' || Boolean(group.not);
      const combinator = group.combinator === 'OR' ? ' OR ' : ' AND ';

      for (const item of group.conditions) {
        if ('conditions' in item || 'combinator' in item) {
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

      if (clauses.length === 0) return '1=1';
      const inner = clauses.join(combinator);
      return isNot ? `NOT (${inner})` : inner;
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

    const placeholder = (idx: number) => (isPostgres ? `$${idx}` : '?');
    const ilikeOp = isPostgres ? 'ILIKE' : 'LIKE';

    // 1. Tag Filter
    if (cond.field === 'tag' || cond.field === 'tag_id' || cond.field === 'tag_name') {
      const isNot = cond.operator === 'not_equals' || cond.operator === 'not_contains';
      const subquery = `SELECT 1 FROM crm_contact_tags ct JOIN crm_tags t ON t.id = ct.tag_id WHERE ct.contact_id = c.id AND (t.name ${ilikeOp} ${placeholder(offset)} OR t.id = ${placeholder(offset)})`;
      return {
        sql: isNot ? `NOT EXISTS (${subquery})` : `EXISTS (${subquery})`,
        params: [cond.value]
      };
    }

    // 2. Activity Filter (e.g. "opened email in last 7 days")
    if (cond.field === 'activity' || cond.field === 'activity_type' || cond.field === 'has_activity') {
      let actType = 'email_opened';
      let days = 30;
      if (typeof cond.value === 'object' && cond.value !== null) {
        actType = cond.value.type || cond.value.activity_type || 'email_opened';
        days = parseInt(cond.value.days || cond.value.within_days || '30', 10);
      } else if (typeof cond.value === 'string') {
        actType = cond.value;
      }

      const timeClause = isPostgres
        ? `a.created_at >= NOW() - INTERVAL '${days} days'`
        : `a.created_at >= datetime('now', '-${days} days')`;

      const subquery = `SELECT 1 FROM crm_activities a WHERE a.contact_id = c.id AND a.type = ${placeholder(offset)} AND ${timeClause}`;
      const isNot = cond.operator === 'not_equals';
      return {
        sql: isNot ? `NOT EXISTS (${subquery})` : `EXISTS (${subquery})`,
        params: [actType]
      };
    }

    // 3. Custom Object Association Filter
    if (cond.field === 'associated_object' || cond.field === 'has_associated_record') {
      const objSlug = typeof cond.value === 'object' && cond.value !== null ? cond.value.slug : String(cond.value);
      const subquery = `SELECT 1 FROM crm_object_associations oa WHERE (oa.source_entity_id = c.id OR oa.target_entity_id = c.id) AND (oa.source_entity_type = ${placeholder(offset)} OR oa.target_entity_type = ${placeholder(offset)})`;
      return {
        sql: `EXISTS (${subquery})`,
        params: [objSlug]
      };
    }

    // 4. Company columns vs Core contact columns vs Custom Fields
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
      'is_archived',
      'created_at',
      'updated_at'
    ]);

    let columnRef: string;
    if (cond.field === 'company_name') {
      columnRef = 'comp.name';
    } else if (cond.field === 'company_domain') {
      columnRef = 'comp.domain';
    } else if (standardFields.has(cond.field)) {
      columnRef = `c.${cond.field}`;
    } else {
      // Dynamic Custom Field JSON lookup
      const safeKey = cond.field.replace(/'/g, "''");
      if (isPostgres) {
        columnRef = `(c.custom_fields->>'${safeKey}')`;
      } else {
        columnRef = `json_extract(c.custom_fields, '$.${safeKey}')`;
      }
    }

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
          sql: `${columnRef} ${ilikeOp} ${placeholder(offset)}`,
          params: [`%${cond.value}%`]
        };

      case 'not_contains':
        return {
          sql: `(${columnRef} IS NULL OR ${columnRef} NOT ${ilikeOp} ${placeholder(offset)})`,
          params: [`%${cond.value}%`]
        };

      case 'starts_with':
        return {
          sql: `${columnRef} ${ilikeOp} ${placeholder(offset)}`,
          params: [`${cond.value}%`]
        };

      case 'ends_with':
        return {
          sql: `${columnRef} ${ilikeOp} ${placeholder(offset)}`,
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
