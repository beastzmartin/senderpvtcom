import { getDatabase } from '../../../db/database.js';
import { FiveSimConfigService } from './FiveSimConfigService.js';
import { FiveSimMaxPriceItem } from './types.js';

export class FiveSimPriceLimitsService {
  private configService: FiveSimConfigService;

  constructor() {
    this.configService = FiveSimConfigService.getInstance();
  }

  private get client() {
    return this.configService.getClient();
  }

  /**
   * 3.1 List Max Prices from live 5SIM API and sync to local DB
   */
  public async syncMaxPrices(): Promise<FiveSimMaxPriceItem[]> {
    const list = await this.client.getMaxPrices();
    this.saveMaxPricesToDb(list);
    return list;
  }

  /**
   * Save / mirror max price limits into local database
   */
  public saveMaxPricesToDb(items: FiveSimMaxPriceItem[]): void {
    if (!items || !Array.isArray(items)) return;
    try {
      const db = getDatabase();

      // Clear existing records and replace with fresh list from provider
      db.prepare('DELETE FROM fivesim_max_prices').run();

      const insert = db.prepare(`
        INSERT INTO fivesim_max_prices (id, product, price, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `);

      const tx = db.transaction((rows: FiveSimMaxPriceItem[]) => {
        for (const item of rows) {
          insert.run(
            item.id || Math.floor(Math.random() * 1000000),
            item.product.toLowerCase().trim(),
            item.price,
            item.CreatedAt || new Date().toISOString()
          );
        }
      });

      tx(items);
    } catch (err) {
      console.error('[5SIM PriceLimits] Error saving max prices to DB:', err);
    }
  }

  /**
   * Get cached max prices from local database
   */
  public getCachedMaxPrices(): FiveSimMaxPriceItem[] {
    try {
      const db = getDatabase();
      const rows = db.prepare('SELECT * FROM fivesim_max_prices ORDER BY product ASC').all() as any[];
      return rows.map((r) => ({
        id: r.id,
        product: r.product,
        price: r.price,
        CreatedAt: r.created_at
      }));
    } catch (err) {
      console.error('[5SIM PriceLimits] Error getting cached max prices:', err);
      return [];
    }
  }

  /**
   * 3.2 Create or Update Price Limit on 5SIM and update local DB
   */
  public async setMaxPrice(productName: string, price: number): Promise<{ success: boolean; item: FiveSimMaxPriceItem }> {
    const cleanProduct = productName.toLowerCase().trim();
    await this.client.setMaxPrice(cleanProduct, price);

    // Save to local database
    const db = getDatabase();
    db.prepare(`
      INSERT INTO fivesim_max_prices (product, price, created_at, updated_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(product) DO UPDATE SET
        price = excluded.price,
        updated_at = datetime('now')
    `).run(cleanProduct, price);

    const saved = db.prepare('SELECT * FROM fivesim_max_prices WHERE product = ?').get(cleanProduct) as any;

    return {
      success: true,
      item: {
        id: saved?.id || 0,
        product: cleanProduct,
        price,
        CreatedAt: saved?.created_at || new Date().toISOString()
      }
    };
  }

  /**
   * 3.3 Delete Price Limit on 5SIM and remove from local DB
   */
  public async deleteMaxPrice(productName: string): Promise<{ success: boolean; product: string }> {
    const cleanProduct = productName.toLowerCase().trim();
    await this.client.deleteMaxPrice(cleanProduct);

    // Remove from local database
    const db = getDatabase();
    db.prepare('DELETE FROM fivesim_max_prices WHERE product = ?').run(cleanProduct);

    return { success: true, product: cleanProduct };
  }
}

