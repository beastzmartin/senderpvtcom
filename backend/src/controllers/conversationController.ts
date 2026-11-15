import { Request, Response, NextFunction } from 'express';
import { MessageService } from '../services/messageService.js';
import { getDatabase } from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

export class ConversationController {
  private messageService: MessageService;

  constructor() {
    this.messageService = MessageService.getInstance();
  }

  public getConversations = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const search = req.query.search as string | undefined;
      const conversations = this.messageService.getConversations(search, req.user?.id);
      res.json({
        data: conversations,
        count: conversations.length
      });
    } catch (err) {
      next(err);
    }
  };

  public getConversationMessages = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
      const userId = req.user?.id;

      const db = getDatabase();
      const conversation = userId
        ? db.prepare(`
            SELECT c.*, ct.name as contact_name, ct.avatar_url, ct.notes
            FROM conversations c
            LEFT JOIN contacts ct ON c.contact_id = ct.id
            WHERE c.id = ? AND c.user_id = ?
          `).get(id, userId)
        : db.prepare(`
            SELECT c.*, ct.name as contact_name, ct.avatar_url, ct.notes
            FROM conversations c
            LEFT JOIN contacts ct ON c.contact_id = ct.id
            WHERE c.id = ?
          `).get(id);

      if (!conversation) {
        res.status(404).json({ error: `Conversation with id "${id}" not found.` });
        return;
      }

      const messages = this.messageService.getMessages({ conversationId: id, limit, offset, userId });

      // Automatically mark as read when messages are requested
      this.messageService.markConversationAsRead(id, userId);

      res.json({
        conversation,
        messages,
        count: messages.length
      });
    } catch (err) {
      next(err);
    }
  };

  public markAsRead = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      this.messageService.markConversationAsRead(id, req.user?.id);
      res.json({ success: true, message: 'Conversation marked as read.' });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Delete a single conversation from website storage only (does not delete from WhatsApp phone)
   */
  public deleteConversation = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      const userId = req.user?.id;
      const db = getDatabase();

      let deleted = 0;
      db.transaction(() => {
        if (userId) {
          db.prepare('DELETE FROM messages WHERE conversation_id = ? AND user_id = ?').run(id, userId);
          deleted = db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(id, userId).changes;
        } else {
          db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
          deleted = db.prepare('DELETE FROM conversations WHERE id = ?').run(id).changes;
        }
      })();

      if (deleted === 0) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }

      res.json({ success: true, message: 'Chat deleted from website storage.' });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Delete ALL conversations & messages for the current user from website storage only
   */
  public deleteAllConversations = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const db = getDatabase();
      let deletedConvs = 0;
      let deletedMsgs = 0;

      db.transaction(() => {
        deletedMsgs = db.prepare('DELETE FROM messages WHERE user_id = ?').run(userId).changes;
        deletedConvs = db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId).changes;
      })();

      res.json({
        success: true,
        message: `Cleared ${deletedConvs} chat(s) and ${deletedMsgs} message(s) from website storage.`,
        deletedConvs,
        deletedMsgs
      });
    } catch (err) {
      next(err);
    }
  };
}
