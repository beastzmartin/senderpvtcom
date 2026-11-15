import { getDatabase } from '../../db/database.js';

export interface CircuitBreakerStatus {
  productSlug: string;
  failureCount: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  tripReason?: string;
  lastFailureAt?: string;
}

export class MarketplaceCircuitBreakerService {
  private static readonly FAILURE_THRESHOLD = 5;

  public static getStatus(productSlug: string): CircuitBreakerStatus {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM product_circuit_breakers WHERE product_slug = ?').get(productSlug) as any;

    if (!row) {
      return {
        productSlug,
        failureCount: 0,
        state: 'CLOSED'
      };
    }

    return {
      productSlug: row.product_slug,
      failureCount: row.failure_count || 0,
      state: (row.state as any) || 'CLOSED',
      tripReason: row.trip_reason || undefined,
      lastFailureAt: row.last_failure_at || undefined
    };
  }

  public static recordSuccess(productSlug: string): void {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO product_circuit_breakers (product_slug, failure_count, state, updated_at)
      VALUES (?, 0, 'CLOSED', datetime('now'))
      ON CONFLICT(product_slug) DO UPDATE SET
        failure_count = 0,
        state = 'CLOSED',
        updated_at = datetime('now')
    `).run(productSlug);
  }

  public static recordFailure(productSlug: string, errorReason: string): CircuitBreakerStatus {
    const db = getDatabase();
    const current = this.getStatus(productSlug);
    const newCount = current.failureCount + 1;
    const shouldTrip = newCount >= this.FAILURE_THRESHOLD;
    const newState = shouldTrip ? 'OPEN' : current.state;

    db.prepare(`
      INSERT INTO product_circuit_breakers (product_slug, failure_count, state, trip_reason, last_failure_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(product_slug) DO UPDATE SET
        failure_count = ?,
        state = ?,
        trip_reason = ?,
        last_failure_at = datetime('now'),
        updated_at = datetime('now')
    `).run(productSlug, newCount, newState, errorReason, newCount, newState, errorReason);

    if (shouldTrip) {
      console.warn(`[Circuit Breaker TRIPPED] Product "${productSlug}" reached ${newCount} consecutive failures. Automatically disabling product to protect customers.`);
      // Auto-pause product
      db.prepare(`
        UPDATE extraction_marketplace_products
        SET status = 'disabled',
            updated_at = datetime('now')
        WHERE slug = ?
      `).run(productSlug);
    }

    return {
      productSlug,
      failureCount: newCount,
      state: newState,
      tripReason: errorReason
    };
  }

  public static reset(productSlug: string): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE product_circuit_breakers
      SET failure_count = 0,
          state = 'CLOSED',
          trip_reason = NULL,
          updated_at = datetime('now')
      WHERE product_slug = ?
    `).run(productSlug);
  }
}

