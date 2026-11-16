/**
 * CRM V2: Kanban Board Manager Service
 * Manages board cards, fractional LexoRank positioning, column auto-actions,
 * board stage synchronization, and board templates.
 */

import crypto from 'crypto';
import {
  CrmBoard,
  CrmBoardColumn,
  CrmBoardCard,
  ColumnAutoAction
} from '../models/types.js';
import { CrmStorageAdapter } from '../db/CrmStorageAdapter.js';
import { CrmLexoRankService } from './CrmLexoRankService.js';
import { getSocketIO } from '../../socket/socketManager.js';

export interface BoardTemplateDefinition {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  columns: Array<{
    name: string;
    color: string;
    stage_type: 'standard' | 'won' | 'lost';
    wip_limit?: number;
    auto_actions?: ColumnAutoAction[];
  }>;
}

export const PRESET_BOARD_TEMPLATES: BoardTemplateDefinition[] = [
  {
    id: 'sales_funnel',
    name: 'Sales Funnel & Deals',
    description: 'Track leads from initial qualification to deal close.',
    color: '#4f46e5',
    icon: 'funnel',
    columns: [
      { name: 'New Lead', color: '#94a3b8', stage_type: 'standard', auto_actions: [{ type: 'add_tag', config: { tag_name: 'Lead' } }] },
      { name: 'Contacted', color: '#38bdf8', stage_type: 'standard' },
      { name: 'Demo / Pitch', color: '#818cf8', stage_type: 'standard' },
      { name: 'Proposal Sent', color: '#f59e0b', stage_type: 'standard', wip_limit: 15 },
      { name: 'Won', color: '#10b981', stage_type: 'won', auto_actions: [{ type: 'add_tag', config: { tag_name: 'Customer' } }] },
      { name: 'Lost', color: '#ef4444', stage_type: 'lost' }
    ]
  },
  {
    id: 'real_estate',
    name: 'Real Estate Pipeline',
    description: 'Manage property inquiries, site tours, and contract closings.',
    color: '#059669',
    icon: 'home',
    columns: [
      { name: 'Inquiry', color: '#94a3b8', stage_type: 'standard' },
      { name: 'Tour Scheduled', color: '#38bdf8', stage_type: 'standard' },
      { name: 'Offer Made', color: '#f59e0b', stage_type: 'standard' },
      { name: 'Under Contract', color: '#8b5cf6', stage_type: 'standard' },
      { name: 'Closed / Handed Over', color: '#10b981', stage_type: 'won' }
    ]
  },
  {
    id: 'customer_support',
    name: 'Support & Helpdesk',
    description: 'Track customer requests, escalated tickets, and resolutions.',
    color: '#d97706',
    icon: 'ticket',
    columns: [
      { name: 'Open / Unassigned', color: '#ef4444', stage_type: 'standard' },
      { name: 'In Progress', color: '#3b82f6', stage_type: 'standard', wip_limit: 10 },
      { name: 'Waiting on Customer', color: '#f59e0b', stage_type: 'standard' },
      { name: 'Resolved', color: '#10b981', stage_type: 'won' }
    ]
  },
  {
    id: 'recruiting',
    name: 'Recruitment & Hiring',
    description: 'Applicant tracking system from screening to offer acceptance.',
    color: '#8b5cf6',
    icon: 'users',
    columns: [
      { name: 'Applied', color: '#94a3b8', stage_type: 'standard' },
      { name: 'Screening', color: '#38bdf8', stage_type: 'standard' },
      { name: 'Technical Interview', color: '#8b5cf6', stage_type: 'standard' },
      { name: 'Offer Extended', color: '#f59e0b', stage_type: 'standard' },
      { name: 'Hired', color: '#10b981', stage_type: 'won' },
      { name: 'Rejected', color: '#ef4444', stage_type: 'lost' }
    ]
  }
];

export class CrmBoardManager {
  /**
   * Instantiate a board from a pre-built template
   */
  public static async createFromTemplate(
    storage: CrmStorageAdapter,
    workspaceId: string,
    templateId: string,
    customName?: string,
    ownerUserId?: string
  ): Promise<CrmBoard> {
    const tpl = PRESET_BOARD_TEMPLATES.find((t) => t.id === templateId) || PRESET_BOARD_TEMPLATES[0];

    const board = await storage.createBoard(workspaceId, {
      name: customName || tpl.name,
      description: tpl.description,
      color: tpl.color,
      icon: tpl.icon,
      owner_user_id: ownerUserId || null,
      visibility: 'workspace',
      card_layout: {
        visible_fields: ['email', 'phone', 'lead_score'],
        field_order: ['email', 'phone', 'lead_score'],
        card_size: 'standard',
        action_buttons: [
          { id: 'btn_chat', type: 'open_chat', label: 'Chat', color: '#25D366', size: 'sm' },
          { id: 'btn_move', type: 'move_chat', label: 'Move', color: '#4f46e5', size: 'sm' },
          { id: 'btn_task', type: 'create_task', label: 'Task', color: '#64748b', size: 'sm' }
        ],
        show_avatar: true,
        show_tags: true,
        show_score: true,
        show_owner: true
      }
    });

    // Create columns in order
    for (let i = 0; i < tpl.columns.length; i++) {
      const col = tpl.columns[i];
      await storage.createBoardColumn(workspaceId, {
        board_id: board.id,
        name: col.name,
        color: col.color,
        order_index: i,
        stage_type: col.stage_type,
        wip_limit: col.wip_limit || null,
        auto_actions: col.auto_actions || []
      });
    }

    const fullBoard = await storage.getBoard(workspaceId, board.id);
    return fullBoard || board;
  }

  /**
   * Move a card to a target column at a specific rank or between neighbors
   */
  public static async moveCard(
    storage: CrmStorageAdapter,
    workspaceId: string,
    cardId: string,
    targetColumnId: string,
    prevRank?: string | null,
    nextRank?: string | null,
    userId?: string
  ): Promise<CrmBoardCard> {
    const newRank = CrmLexoRankService.between(prevRank, nextRank);
    const updatedCard = await storage.moveBoardCard(workspaceId, cardId, targetColumnId, newRank);

    // Retrieve target column details
    const columns = await storage.listBoardColumns(workspaceId, updatedCard.board_id);
    const targetCol = columns.find((c: any) => c.id === targetColumnId);

    if (targetCol) {
      // 1. Execute Column Auto-Actions
      await this.executeColumnAutoActions(storage, workspaceId, targetCol, updatedCard, userId);

      // 2. Log Activity Timeline Item
      if (updatedCard.entity_type === 'contact') {
        await storage.logActivity(workspaceId, {
          workspace_id: workspaceId,
          contact_id: updatedCard.entity_id,
          user_id: userId || undefined,
          type: 'status_change',
          title: `Moved to ${targetCol.name}`,
          details: {
            board_id: updatedCard.board_id,
            column_id: targetColumnId,
            column_name: targetCol.name,
            rank: newRank
          }
        });

        // 3. Sync Linked Stage Super Field if present
        const superFields = await storage.listSuperFields(workspaceId, 'contact');
        const stageField = superFields.find((f: any) => f.field_type === 'stage' && (!f.linked_board_id || f.linked_board_id === updatedCard.board_id));
        if (stageField) {
          const contact = await storage.getContact(workspaceId, updatedCard.entity_id);
          if (contact) {
            const currentCustom = contact.custom_fields || {};
            currentCustom[stageField.slug] = targetCol.name;
            await storage.updateContact(workspaceId, contact.id, { custom_fields: currentCustom });
          }
        }
      }
    }

    // Broadcast Realtime Event
    try {
      getSocketIO()?.to(`workspace:${workspaceId}`).emit('crm:board_card_moved', {
        card_id: cardId,
        board_id: updatedCard.board_id,
        column_id: targetColumnId,
        rank: newRank,
        moved_by: userId
      });
    } catch {}

    return updatedCard;
  }

  /**
   * Execute auto-actions configured for a column on card entry
   */
  private static async executeColumnAutoActions(
    storage: CrmStorageAdapter,
    workspaceId: string,
    column: CrmBoardColumn,
    card: CrmBoardCard,
    userId?: string
  ): Promise<void> {
    if (!column.auto_actions || column.auto_actions.length === 0) return;

    for (const action of column.auto_actions) {
      try {
        if (action.type === 'add_tag' && action.config.tag_name && card.entity_type === 'contact') {
          // Ensure tag exists and add to contact
          const tags = await storage.listTags(workspaceId);
          let tag = tags.find((t: any) => t.name.toLowerCase() === action.config.tag_name!.toLowerCase());
          if (!tag) {
            tag = await storage.createTag(workspaceId, action.config.tag_name, '#3b82f6');
          }
          await storage.tagContacts(workspaceId, tag.id, [card.entity_id]);
        } else if (action.type === 'set_field' && action.config.field_slug && card.entity_type === 'contact') {
          const contact = await storage.getContact(workspaceId, card.entity_id);
          if (contact) {
            const cf = { ...contact.custom_fields, [action.config.field_slug]: action.config.field_value };
            await storage.updateContact(workspaceId, contact.id, { custom_fields: cf });
          }
        }
      } catch (err) {
        console.error(`[CrmBoardManager] Auto action ${action.type} failed:`, err);
      }
    }
  }
}
