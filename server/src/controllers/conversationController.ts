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
}
