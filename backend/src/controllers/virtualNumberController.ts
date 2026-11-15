import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { VirtualNumberService } from '../services/virtualNumber/VirtualNumberService.js';
import { VirtualNumberMessageService } from '../services/virtualNumber/VirtualNumberMessageService.js';
import { VirtualNumberAdminService } from '../services/virtualNumber/VirtualNumberAdminService.js';

export class VirtualNumberController {
  private vnService: VirtualNumberService;
  private messageService: VirtualNumberMessageService;
  private adminService: VirtualNumberAdminService;

  constructor() {
    this.vnService = VirtualNumberService.getInstance();
    this.messageService = VirtualNumberMessageService.getInstance();
    this.adminService = VirtualNumberAdminService.getInstance();
  }

  // --- CUSTOMER MARKETPLACE ENDPOINTS ---

  public getCountries = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const countries = this.vnService.listCountries();
      res.json({ countries });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public searchNumbers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const {
        country,
        type,
        whatsapp,
        search,
        limit = '20',
        offset = '0'
      } = req.query;

      const result = this.vnService.searchNumbers({
        countryCode: country as string,
        numberType: type as string,
        whatsappCompatible: whatsapp === 'true',
        searchQuery: search as string,
        userId: req.user?.id,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10)
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public purchaseNumber = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { inventoryId, rentalDuration = 'monthly', idempotencyKey } = req.body;

      if (!inventoryId) {
        res.status(400).json({ error: 'Please specify the virtual number inventoryId to purchase.' });
        return;
      }

      const result = await this.vnService.purchaseNumber({
        userId,
        inventoryId,
        rentalDuration,
        idempotencyKey
      });

      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public getMyRentals = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { status } = req.query;
      const rentals = this.vnService.getCustomerRentals(userId, status as string);
      res.json({ rentals });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public renewRental = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const rentalId = String(req.params.rentalId);
      const { durationDays = 30 } = req.body;

      const result = await this.vnService.renewRental(userId, rentalId, durationDays);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public toggleAutoRenew = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const rentalId = String(req.params.rentalId);
      const { autoRenew } = req.body;

      const result = this.vnService.toggleAutoRenew(userId, rentalId, Boolean(autoRenew));
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public releaseRental = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const rentalId = String(req.params.rentalId);

      const result = await this.vnService.releaseRental(userId, rentalId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public getMessages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { rentalId, phone, limit = '50' } = req.query;

      const messages = this.messageService.getMessages(userId, {
        rentalId: rentalId as string,
        phoneNumber: phone as string,
        limit: parseInt(limit as string, 10)
      });

      res.json({ messages });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public markMessageRead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const messageId = String(req.params.messageId);
      this.messageService.markMessageAsRead(userId, messageId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getCallLogs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { rentalId, phone, limit = '50' } = req.query;

      const calls = this.messageService.getCallLogs(userId, {
        rentalId: rentalId as string,
        phoneNumber: phone as string,
        limit: parseInt(limit as string, 10)
      });

      res.json({ calls });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getOrderHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const orders = this.vnService.getOrderHistory(userId);
      res.json({ orders });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getCustomerAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const analytics = this.vnService.getCustomerDashboardAnalytics(userId);
      res.json({ analytics });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  // --- ADMIN MANAGEMENT ENDPOINTS ---

  public getAdminOverview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const overview = this.adminService.getAdminOverview();
      res.json({ overview });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getAdminProviders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const providers = this.adminService.listProviders();
      res.json({ providers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public saveAdminProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user!.id;
      const result = this.adminService.saveProvider(adminId, req.body);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public getAdminInventory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { country, status, limit = '50', offset = '0' } = req.query;
      const result = this.adminService.listInventory({
        countryCode: country as string,
        status: status as string,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10)
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public addAdminInventory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user!.id;
      const result = this.adminService.addInventoryNumber(adminId, req.body);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public getAdminPricing = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const rules = this.adminService.listPricingRules();
      res.json({ rules });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public saveAdminPricing = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user!.id;
      const result = this.adminService.savePricingRule(adminId, req.body);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public getAdminRentals = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { status, search, limit = '50', offset = '0' } = req.query;
      const result = this.adminService.listAllRentals({
        status: status as string,
        search: search as string,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10)
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public refundAdminOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user!.id;
      const orderId = String(req.params.orderId);
      const { reason = 'Customer requested refund' } = req.body;

      const result = this.adminService.refundOrder(adminId, orderId, reason);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };
}
