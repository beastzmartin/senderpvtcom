import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = AuthService.getInstance();
  }

  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    res.status(400).json({
      error: 'User login system has been replaced with License Key Activation in Desktop Edition.',
      desktop_mode: true
    });
  };

  public register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    res.status(400).json({
      error: 'User registration is disabled in Desktop Edition. The application operates via License Key.',
      desktop_mode: true
    });
  };

  public getRegistrationStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const enabled = this.authService.isRegistrationEnabled();
      res.json({ success: true, registrationEnabled: enabled });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to get registration status' });
    }
  };

  public listUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = this.authService.listUsers();
      res.json({ users, count: users.length });
    } catch (err) {
      next(err);
    }
  };

  public getMe = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      let user = this.authService.getUserById(req.user.id);
      if (!user) {
        user = {
          id: req.user.id || 'local_user',
          username: req.user.username || 'local_user',
          name: req.user.name || 'Desktop User',
          email: 'user@desktop.local',
          company_name: 'Local Workstation',
          phone: '',
          role: 'admin',
          plan_tier: req.user.plan_tier || 'enterprise',
          subscription_status: 'active',
          subscription_expires_at: null,
          max_devices: req.user.max_devices || 10,
          daily_message_limit: req.user.daily_message_limit || 10000,
          daily_extraction_limit: req.user.daily_extraction_limit || 10000,
          allowed_pages: null,
          is_active: true,
          created_at: new Date().toISOString()
        };
      }

      res.json({ user, isLicensed: true });
    } catch (err) {
      next(err);
    }
  };

  public updateProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { name, email, company_name, phone } = req.body;
      const updatedUser = this.authService.updateProfile(req.user.id, {
        name,
        email,
        company_name,
        phone
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: updatedUser
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update profile' });
    }
  };

  public changePassword = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { oldPassword, newPassword } = req.body;
      if (!oldPassword || !newPassword) {
        res.status(400).json({ error: 'Current password and new password are required.' });
        return;
      }

      this.authService.changePassword(req.user.id, oldPassword, newPassword);

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to change password' });
    }
  };
}
