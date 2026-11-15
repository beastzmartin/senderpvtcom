export class OutputFlattener {
  /**
   * Resolves selector path on an item: supports dot-notation and array predicate selectors
   * e.g. "company.name" or "contacts[method=email].target"
   */
  public static resolvePath(item: any, path: string): any {
    if (!item || !path) return undefined;

    const parts = path.split('.');
    let current: any = item;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;

      // Check for array predicate e.g. "contacts[method=email]"
      const match = part.match(/^([^[]+)\[([^=]+)=([^\]]+)\]$/);
      if (match) {
        const [, arrayKey, propName, targetVal] = match;
        const arr = current[arrayKey];
        if (!Array.isArray(arr)) return undefined;

        const found = arr.find((elem: any) => String(elem[propName]) === targetVal);
        current = found;
      } else {
        current = current[part];
      }
    }

    return current;
  }

  /**
   * Auto-flattens a nested object into a flat dot-path dictionary
   */
  public static flattenObject(obj: Record<string, any>, prefix: string = '', maxDepth: number = 3): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (
        key === 'actorExecutionId' ||
        key === '_internalId' ||
        key === 'provider_debug_info' ||
        key.toLowerCase().includes('apify')
      ) {
        continue;
      }

      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value !== null && typeof value === 'object' && !Array.isArray(value) && maxDepth > 0) {
        const nested = this.flattenObject(value, newKey, maxDepth - 1);
        Object.assign(result, nested);
      } else if (Array.isArray(value)) {
        // If array of primitives, join by comma; if array of objects, store stringified or count
        if (value.length > 0 && typeof value[0] !== 'object') {
          result[newKey] = value.join(', ');
        } else {
          result[newKey] = JSON.stringify(value);
        }
      } else {
        result[newKey] = value;
      }
    }

    return result;
  }

  /**
   * Filter out provider allowance/notice rows (e.g. Apify sample allowance warnings)
   */
  public static isNoticeOrAllowanceRow(item: Record<string, any>): boolean {
    if (!item || typeof item !== 'object') return false;
    const str = JSON.stringify(item).toLowerCase();
    return (
      str.includes('allowance limit reached') ||
      str.includes('free apify accounts receive') ||
      str.includes('result notice explains allowance') ||
      str.includes('sample limit reached')
    );
  }

  /**
   * Flattens a single item according to output mappings and drop fields
   */
  public static flattenItem(
    item: Record<string, any>,
    itemMapping?: Array<{ from: string; to: string; label?: string }>,
    dropFields?: string[]
  ): Record<string, any> {
    if (!item || typeof item !== 'object') return {};
    const drops = new Set(dropFields || []);

    if (itemMapping && itemMapping.length > 0) {
      const mapped: Record<string, any> = {};
      for (const m of itemMapping) {
        if (drops.has(m.from) || drops.has(m.to)) continue;
        const val = this.resolvePath(item, m.from);
        if (val !== undefined) {
          mapped[m.to] = val;
        }
      }
      return mapped;
    }

    const flat = this.flattenObject(item);
    for (const d of drops) {
      delete flat[d];
    }
    return flat;
  }

  /**
   * Neutralize CSV Formula Injection vulnerabilities
   * In Excel/Calc, values beginning with '=', '+', '-', '@', '\t', '\r' are treated as executable formulas.
   * Prefixing with a single quote "'" safely renders the value as a plain text string.
   */
  public static sanitizeForCsvFormulaInjection(val: any): string {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (/^[=+\-@\t\r]/.test(str)) {
      return `'${str}`;
    }
    return str;
  }
}
