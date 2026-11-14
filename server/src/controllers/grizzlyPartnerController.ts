import { Request, Response } from 'express';
import { GrizzlyPartnerProtocolService } from '../services/virtualNumber/grizzly/GrizzlyPartnerProtocolService.js';
import { GrizzlyProviderConfigService } from '../services/virtualNumber/grizzly/GrizzlyProviderConfigService.js';
import { GrizzlyHardwareCapacityService } from '../services/virtualNumber/grizzly/GrizzlyHardwareCapacityService.js';
import { GrizzlyAdminService } from '../services/virtualNumber/grizzly/GrizzlyAdminService.js';
import { grizzlyPushSmsAdapter } from '../services/virtualNumber/grizzly/GrizzlyPushSmsAdapter.js';
import { grizzlyFinishActivationAdapter } from '../services/virtualNumber/grizzly/GrizzlyFinishActivationAdapter.js';

export class GrizzlyPartnerController {
  /**
   * Main inbound partner webhook handling GET_SERVICES, GET_NUMBER, etc.
   * POST /api/virtual-numbers/partners/grizzlysms
   */
  public static async handlePartnerRequest(req: Request, res: Response): Promise<void> {
    const action = req.body?.action;
    const clientIp = req.ip || req.socket.remoteAddress;

    // Set mandatory UTF-8 JSON header
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (!action || typeof action !== 'string') {
      res.status(400).json({ status: 'ERROR', message: 'Missing "action" in request body.' });
      return;
    }

    try {
      if (action === 'GET_SERVICES') {
        const result = GrizzlyPartnerProtocolService.handleGetServices(req.body, clientIp);
        res.status(200).json(result);
        return;
      }

      if (action === 'GET_NUMBER') {
        const result = GrizzlyPartnerProtocolService.handleGetNumber(req.body, clientIp);
        res.status(200).json(result);
        return;
      }

      if (action === 'PUSH_SMS') {
        const result = await grizzlyPushSmsAdapter.pushSms(req.body);
        res.status(200).json(result);
        return;
      }

      if (action === 'FINISH_ACTIVATION') {
        const result = await grizzlyFinishActivationAdapter.finishActivation(req.body);
        res.status(200).json(result);
        return;
      }

      res.status(400).json({ status: 'ERROR', message: `Unsupported action: "${action}"` });
    } catch (err: any) {
      if (err.message === 'AUTH_ERROR') {
        res.status(401).json({ status: 'AUTH_ERROR', message: 'Unauthorized protocol key.' });
        return;
      }
      res.status(500).json({ status: 'ERROR', message: err.message || 'Internal server error' });
    }
  }

  // --- Admin API Handlers ---

  public static async getAdminOverview(_req: Request, res: Response): Promise<void> {
    try {
      const overview = GrizzlyAdminService.getOverview();
      res.json({ success: true, overview });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getAdminConfig(_req: Request, res: Response): Promise<void> {
    try {
      const config = GrizzlyProviderConfigService.getConfig();
      // Mask protocol key for display
      const maskedConfig = {
        ...config,
        protocol_key_masked: `${config.protocol_key.substring(0, 4)}...${config.protocol_key.slice(-4)}`
      };
      res.json({ success: true, config: maskedConfig });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async updateAdminConfig(req: Request, res: Response): Promise<void> {
    try {
      const updated = GrizzlyProviderConfigService.updateConfig(req.body);
      res.json({ success: true, config: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getAdminInventory(req: Request, res: Response): Promise<void> {
    try {
      const country = req.query.country ? parseInt(String(req.query.country), 10) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const result = GrizzlyAdminService.getInventory({ country, status, limit, offset });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async addAdminInventory(req: Request, res: Response): Promise<void> {
    try {
      const result = GrizzlyAdminService.addInventory(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getAdminHardware(_req: Request, res: Response): Promise<void> {
    try {
      const modules = GrizzlyHardwareCapacityService.listModules();
      res.json({ success: true, modules });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getAdminActivations(req: Request, res: Response): Promise<void> {
    try {
      const status = req.query.status ? String(req.query.status) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const result = GrizzlyAdminService.getActivations({ status, search, limit, offset });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getAdminSms(_req: Request, res: Response): Promise<void> {
    try {
      const messages = GrizzlyAdminService.getSmsMessages();
      res.json({ success: true, messages });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getAdminLogs(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
      const result = GrizzlyAdminService.getApiLogs(limit, offset);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getAdminMappings(_req: Request, res: Response): Promise<void> {
    try {
      const mappings = GrizzlyAdminService.getMappings();
      res.json({ success: true, ...mappings });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async finishActivationManually(req: Request, res: Response): Promise<void> {
    try {
      const activationId = parseInt(String(req.params.activationId), 10);
      const statusCode = req.body?.statusCode !== undefined ? parseInt(String(req.body.statusCode), 10) : 3;
      const notes = req.body?.notes || 'Manually finished via Admin Dashboard';

      const result = await grizzlyFinishActivationAdapter.finishActivation({
        activationId,
        statusCode,
        notes
      });
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
