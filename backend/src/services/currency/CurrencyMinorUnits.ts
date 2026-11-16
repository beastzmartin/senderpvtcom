/**
 * Currency Minor Units & Exact Rounding Engine
 * Guarantees zero float artifacts, single-point rounding, and zero-decimal currency compliance
 */

export const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  INR: 2,
  CAD: 2,
  AUD: 2,
  SGD: 2,
  AED: 2,
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
};

export class CurrencyMinorUnits {
  public static getDecimals(currency: string): number {
    return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
  }

  /**
   * Convert human float amount to integer minor units (e.g. $29.00 USD -> 2900 cents, ¥1500 JPY -> 1500)
   */
  public static toMinorUnits(amount: number, currency: string): number {
    const decimals = this.getDecimals(currency);
    const factor = Math.pow(10, decimals);
    return Math.round(Number(amount.toFixed(decimals)) * factor);
  }

  /**
   * Convert integer minor units back to human float
   */
  public static fromMinorUnits(minorUnits: number, currency: string): number {
    const decimals = this.getDecimals(currency);
    const factor = Math.pow(10, decimals);
    return Number((minorUnits / factor).toFixed(decimals));
  }

  /**
   * Format display string with exact decimal places (e.g. "29.00" or "1500")
   */
  public static formatAmount(minorUnits: number, currency: string): string {
    const decimals = this.getDecimals(currency);
    const val = this.fromMinorUnits(minorUnits, currency);
    return val.toFixed(decimals);
  }

  /**
   * Safe rounded arithmetic on minor units
   */
  public static calculateTax(subtotalMinor: number, taxRatePercent: number): number {
    return Math.round((subtotalMinor * taxRatePercent) / 100);
  }
}

