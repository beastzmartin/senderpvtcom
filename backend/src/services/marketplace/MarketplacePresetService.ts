import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';
import { MarketplaceUserPreset } from '../../types/marketplace.js';

export class MarketplacePresetService {
  private static instance: MarketplacePresetService | null = null;

  public static getInstance(): MarketplacePresetService {
    if (!MarketplacePresetService.instance) {
      MarketplacePresetService.instance = new MarketplacePresetService();
    }
    return MarketplacePresetService.instance;
  }

  /**
   * List all presets saved by a specific user for a product
   */
  public listPresets(userId: string, productSlug: string): MarketplaceUserPreset[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM marketplace_user_presets
      WHERE user_id = ? AND product_slug = ?
      ORDER BY updated_at DESC
    `).all(userId, productSlug) as any[];

    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      product_slug: r.product_slug,
      name: r.name,
      input_data: JSON.parse(r.input_json || '{}'),
      created_at: r.created_at,
      updated_at: r.updated_at
    }));
  }

  /**
   * Save or update a user preset
   */
  public savePreset(
    userId: string,
    productSlug: string,
    name: string,
    inputData: Record<string, any>,
    presetId?: string
  ): MarketplaceUserPreset {
    const db = getDatabase();
    const cleanName = (name || 'My Preset').trim().slice(0, 50);
    const id = presetId || `preset_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const inputJson = JSON.stringify(inputData || {});

    db.prepare(`
      INSERT INTO marketplace_user_presets (id, user_id, product_slug, name, input_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        input_json = excluded.input_json,
        updated_at = datetime('now')
    `).run(id, userId, productSlug, cleanName, inputJson);

    return {
      id,
      user_id: userId,
      product_slug: productSlug,
      name: cleanName,
      input_data: inputData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Delete a preset owned by user
   */
  public deletePreset(userId: string, presetId: string): boolean {
    const db = getDatabase();
    const res = db.prepare(`
      DELETE FROM marketplace_user_presets
      WHERE id = ? AND user_id = ?
    `).run(presetId, userId);
    return res.changes > 0;
  }
}

