import crypto from 'crypto';
import { getDatabase } from '../db/database.js';

export interface MessageTemplate {
  id: string;
  user_id?: string | null;
  name: string;
  category: string;
  content: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}

export class TemplateService {
  private static instance: TemplateService | null = null;

  private constructor() {
    this.seedDefaultTemplates();
  }

  public static getInstance(): TemplateService {
    if (!TemplateService.instance) {
      TemplateService.instance = new TemplateService();
    }
    return TemplateService.instance;
  }

  /**
   * Extract variable placeholders like {name}, {lid}, {company} ignoring Spintax with |
   */
  public extractVariables(content: string): string[] {
    const regex = /\{([a-zA-Z0-9_]+)\}/g;
    const vars = new Set<string>();
    let match;
    while ((match = regex.exec(content)) !== null) {
      vars.add(match[1]);
    }
    return Array.from(vars);
  }

  private seedDefaultTemplates(): void {
    try {
      const db = getDatabase();
      const countRow = db.prepare('SELECT COUNT(*) as count FROM templates WHERE user_id IS NULL').get() as { count: number };
      if (countRow.count === 0) {
        const defaults = [
          {
            name: 'Community Announcement',
            category: 'Announcements',
            content: '{Hello|Hi|Greetings} {name}! We are pleased to announce an important update regarding our community activities. Reference: #{random}. Please let us know if you have any questions!'
          },
          {
            name: 'Welcome & Onboarding',
            category: 'Onboarding',
            content: '{Welcome|Glad to have you here}, {name}! Thank you for connecting with us on WhatsApp ({lid}). If you need any assistance, feel free to reply directly to this message.'
          },
          {
            name: 'Service Follow-up',
            category: 'Follow-up',
            content: '{Hi|Hello} {name}, {hope you are doing great|hope all is well with you}! We wanted to follow up and see how everything is going. Ref ID: #{random}.'
          },
          {
            name: 'Event / Meeting Reminder',
            category: 'Reminders',
            content: '{Reminder|Friendly Notice}: {Hello|Hi} {name}! Don\'t forget about our upcoming session scheduled on {date} at {time}. We look forward to seeing you!'
          }
        ];

        const insert = db.prepare(`
          INSERT INTO templates (id, user_id, name, category, content, variables, created_at, updated_at)
          VALUES (?, NULL, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        for (const t of defaults) {
          const vars = this.extractVariables(t.content);
          insert.run(crypto.randomUUID(), t.name, t.category, t.content, JSON.stringify(vars));
        }

        console.log('[Template Service] Seeded default message templates.');
      }
    } catch (err) {
      console.warn('[Template Service] Template seeding notice:', err);
    }
  }

  public listTemplates(category?: string, search?: string, userId?: string): MessageTemplate[] {
    const db = getDatabase();
    let query = 'SELECT * FROM templates';
    const params: any[] = [];
    const conditions: string[] = [];

    if (userId) {
      conditions.push('(user_id = ? OR user_id IS NULL)');
      params.push(userId);
    }

    if (category && category !== 'all') {
      conditions.push('LOWER(category) = LOWER(?)');
      params.push(category.trim());
    }

    if (search && search.trim()) {
      conditions.push('(name LIKE ? OR content LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY created_at DESC';

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map((r) => ({
      ...r,
      variables: typeof r.variables === 'string' ? JSON.parse(r.variables) : r.variables || []
    }));
  }

  public getTemplateById(id: string, userId?: string): MessageTemplate | null {
    const db = getDatabase();
    let row: any;
    if (userId) {
      row = db.prepare('SELECT * FROM templates WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(id, userId);
    } else {
      row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    }
    if (!row) return null;
    return {
      ...row,
      variables: typeof r_vars(row.variables)
    };

    function r_vars(v: any) {
      return typeof v === 'string' ? JSON.parse(v) : v || [];
    }
  }

  public createTemplate(data: { name: string; category?: string; content: string }, userId?: string): MessageTemplate {
    if (!data.name || !data.name.trim()) {
      throw new Error('Template name is required.');
    }
    if (!data.content || !data.content.trim()) {
      throw new Error('Template content cannot be empty.');
    }

    const db = getDatabase();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const vars = this.extractVariables(data.content.trim());

    db.prepare(`
      INSERT INTO templates (id, user_id, name, category, content, variables, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId || null,
      data.name.trim(),
      data.category?.trim() || 'General',
      data.content.trim(),
      JSON.stringify(vars),
      now,
      now
    );

    return this.getTemplateById(id, userId)!;
  }

  public updateTemplate(
    id: string,
    data: { name?: string; category?: string; content?: string },
    userId?: string
  ): MessageTemplate {
    const existing = this.getTemplateById(id, userId);
    if (!existing) {
      throw new Error('Template not found.');
    }

    if (userId && existing.user_id && existing.user_id !== userId) {
      throw new Error('Unauthorized to modify this template.');
    }

    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const category = data.category !== undefined ? data.category.trim() : existing.category;
    const content = data.content !== undefined ? data.content.trim() : existing.content;

    if (!name) throw new Error('Template name cannot be empty.');
    if (!content) throw new Error('Template content cannot be empty.');

    const vars = this.extractVariables(content);
    const now = new Date().toISOString();
    const db = getDatabase();

    if (userId) {
      db.prepare(`
        UPDATE templates 
        SET name = ?, category = ?, content = ?, variables = ?, updated_at = ?
        WHERE id = ? AND (user_id = ? OR user_id IS NULL)
      `).run(name, category, content, JSON.stringify(vars), now, id, userId);
    } else {
      db.prepare(`
        UPDATE templates 
        SET name = ?, category = ?, content = ?, variables = ?, updated_at = ?
        WHERE id = ?
      `).run(name, category, content, JSON.stringify(vars), now, id);
    }

    return this.getTemplateById(id, userId)!;
  }

  public deleteTemplate(id: string, userId?: string): void {
    const db = getDatabase();
    if (userId) {
      db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?').run(id, userId);
    } else {
      db.prepare('DELETE FROM templates WHERE id = ?').run(id);
    }
  }
}
