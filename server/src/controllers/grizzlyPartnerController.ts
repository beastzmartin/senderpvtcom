import { Request, Response } from 'express';
import { GrizzlyPartnerProtocolService } from '../services/virtualNumber/grizzly/GrizzlyPartnerProtocolService.js';
import { GrizzlyProviderConfigService } from '../services/virtualNumber/grizzly/GrizzlyProviderConfigService.js';
import { GrizzlyHardwareCapacityService } from '../services/virtualNumber/grizzly/GrizzlyHardwareCapacityService.js';
import { GrizzlyAdminService } from '../services/virtualNumber/grizzly/GrizzlyAdminService.js';
import { GrizzlySmsQueueService } from '../services/virtualNumber/grizzly/GrizzlySmsQueueService.js';
import { GrizzlyVoiceQueueService } from '../services/virtualNumber/grizzly/GrizzlyVoiceQueueService.js';
import { grizzlyFinishActivationAdapter } from '../services/virtualNumber/grizzly/GrizzlyFinishActivationAdapter.js';
import { GrizzlyDataManagementService } from '../services/virtualNumber/grizzly/GrizzlyDataManagementService.js';

export class GrizzlyPartnerController {
  /**
   * Main inbound partner webhook handling GET_SERVICES, GET_NUMBER, FINISH_ACTIVATION, etc.
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

      if (action === 'FINISH_ACTIVATION') {
        // Official Grizzly status callback (1=prohibited, 3=sold, 4=cancelled, 5=returned)
        const result = await grizzlyFinishActivationAdapter.handleCallback(req.body);
        res.status(200).json(result);
        return;
      }

      if (action === 'PUSH_SMS') {
        const result = await GrizzlySmsQueueService.enqueueAndSendSms({
          phone: req.body.phone,
          phoneFrom: req.body.phoneFrom || 'System',
          text: req.body.text || req.body.messageContent || '',
          activationId: req.body.activationId || 0,
          smsId: req.body.smsId
        });
        res.status(200).json({ status: result.success ? 'SUCCESS' : 'ERROR' });
        return;
      }

      if (action === 'PUSH_CALL') {
        const result = await GrizzlyVoiceQueueService.enqueueAndSendCall({
          phone: req.body.phone,
          phoneFrom: req.body.phoneFrom || 'Caller',
          activationId: req.body.activationId,
          callId: req.body.callId
        });
        res.status(200).json({ status: result.success ? 'SUCCESS' : 'ERROR' });
        return;
      }

      if (action === 'PUSH_CALL_RECORD') {
        const result = await GrizzlyVoiceQueueService.enqueueAndSendCallRecord({
          recordId: req.body.recordId,
          callId: req.body.callId,
          phone: req.body.phone,
          phoneFrom: req.body.phoneFrom || 'Caller',
          filePath: req.body.filePath
        });
        res.status(200).json({ status: result.success ? 'SUCCESS' : 'ERROR' });
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

  public static async getAdminVoiceCalls(_req: Request, res: Response): Promise<void> {
    try {
      const calls = GrizzlyAdminService.getVoiceCalls();
      res.json({ success: true, calls });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getAdminCallRecords(_req: Request, res: Response): Promise<void> {
    try {
      const records = GrizzlyAdminService.getCallRecords();
      res.json({ success: true, records });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getAdminCancellations(_req: Request, res: Response): Promise<void> {
    try {
      const cancellations = GrizzlyAdminService.getCancellations();
      res.json({ success: true, cancellations });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getAdminQuarantine(_req: Request, res: Response): Promise<void> {
    try {
      const quarantine = GrizzlyAdminService.getQuarantine();
      res.json({ success: true, quarantine });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getAdminProhibited(_req: Request, res: Response): Promise<void> {
    try {
      const prohibited = GrizzlyAdminService.getProhibited();
      res.json({ success: true, prohibited });
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
      const reason = req.body?.reason || req.body?.notes;

      const result = await grizzlyFinishActivationAdapter.handleCallback({
        action: 'FINISH_ACTIVATION',
        key: 'internal_admin',
        activationId,
        status: statusCode,
        reason
      });
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async triggerPushCall(req: Request, res: Response): Promise<void> {
    try {
      const { phone, phoneFrom, activationId } = req.body;
      const result = await GrizzlyVoiceQueueService.enqueueAndSendCall({
        phone,
        phoneFrom,
        activationId: activationId ? parseInt(String(activationId), 10) : undefined
      });
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async triggerPushSms(req: Request, res: Response): Promise<void> {
    try {
      const { phone, phoneFrom, text, activationId } = req.body;
      const result = await GrizzlySmsQueueService.enqueueAndSendSms({
        phone,
        phoneFrom,
        text,
        activationId: activationId ? parseInt(String(activationId), 10) : 0
      });
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // --- OFFICIAL DATA MANAGEMENT ENDPOINTS ---

  public static async getDataCountries(req: Request, res: Response): Promise<void> {
    try {
      const { search, activeOnly, supportedOnly, limit, offset } = req.query;
      const result = GrizzlyDataManagementService.listCountries({
        search: search as string,
        activeOnly: activeOnly === 'true',
        supportedOnly: supportedOnly === 'true',
        limit: limit ? parseInt(String(limit), 10) : undefined,
        offset: offset ? parseInt(String(offset), 10) : undefined
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async toggleDataCountry(req: Request, res: Response): Promise<void> {
    try {
      const countryId = parseInt(String(req.params.id), 10);
      const { isActive, isSupported } = req.body;
      const country = GrizzlyDataManagementService.toggleCountry(countryId, Boolean(isActive), isSupported !== undefined ? Boolean(isSupported) : undefined);
      res.json({ success: true, country });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async updateDataCountry(req: Request, res: Response): Promise<void> {
    try {
      const countryId = parseInt(String(req.params.id), 10);
      const country = GrizzlyDataManagementService.updateCountry(countryId, req.body);
      res.json({ success: true, country });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async deleteDataCountry(req: Request, res: Response): Promise<void> {
    try {
      const countryId = parseInt(String(req.params.id), 10);
      const result = GrizzlyDataManagementService.deleteCountry(countryId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public static async importDataCountries(req: Request, res: Response): Promise<void> {
    try {
      const { countries, fileName } = req.body;
      if (!Array.isArray(countries) || countries.length === 0) {
        res.status(400).json({ success: false, error: 'countries array is required for import' });
        return;
      }
      const result = GrizzlyDataManagementService.importCountries(countries, fileName);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getDataServices(req: Request, res: Response): Promise<void> {
    try {
      const { search, category, activeOnly, supportedOnly } = req.query;
      const result = GrizzlyDataManagementService.listServices({
        search: search as string,
        category: category as string,
        activeOnly: activeOnly === 'true',
        supportedOnly: supportedOnly === 'true'
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async toggleDataService(req: Request, res: Response): Promise<void> {
    try {
      const code = String(req.params.code);
      const { isActive, isSupported } = req.body;
      const service = GrizzlyDataManagementService.toggleService(code, Boolean(isActive), isSupported !== undefined ? Boolean(isSupported) : undefined);
      res.json({ success: true, service });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async addOrUpdateDataService(req: Request, res: Response): Promise<void> {
    try {
      const service = GrizzlyDataManagementService.addOrUpdateService(req.body);
      res.json({ success: true, service });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async deleteDataService(req: Request, res: Response): Promise<void> {
    try {
      const code = String(req.params.code);
      const result = GrizzlyDataManagementService.deleteService(code);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public static async importDataServices(req: Request, res: Response): Promise<void> {
    try {
      const { services, fileName } = req.body;
      if (!Array.isArray(services) || services.length === 0) {
        res.status(400).json({ success: false, error: 'services array is required for import' });
        return;
      }
      const result = GrizzlyDataManagementService.importServices(services, fileName);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getDataOperators(req: Request, res: Response): Promise<void> {
    try {
      const countryId = req.query.countryId ? parseInt(String(req.query.countryId), 10) : undefined;
      const operators = GrizzlyDataManagementService.listOperators(countryId);
      res.json({ success: true, operators });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async addDataOperator(req: Request, res: Response): Promise<void> {
    try {
      const { code, name, countryId } = req.body;
      if (!code || !name) {
        res.status(400).json({ success: false, error: 'code and name are required' });
        return;
      }
      const operator = GrizzlyDataManagementService.addOperator(code, name, countryId);
      res.json({ success: true, operator });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getDataCountryServices(req: Request, res: Response): Promise<void> {
    try {
      const { countryId, serviceCode, operator, availableOnly, limit, offset } = req.query;
      const result = GrizzlyDataManagementService.listCountryServices({
        countryId: countryId ? parseInt(String(countryId), 10) : undefined,
        serviceCode: serviceCode as string,
        operator: operator as string,
        availableOnly: availableOnly === 'true',
        limit: limit ? parseInt(String(limit), 10) : undefined,
        offset: offset ? parseInt(String(offset), 10) : undefined
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async syncDataInventory(_req: Request, res: Response): Promise<void> {
    try {
      const result = GrizzlyDataManagementService.syncCountryServicesWithLiveInventory();
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async exportDataMapping(_req: Request, res: Response): Promise<void> {
    try {
      const exportData = GrizzlyDataManagementService.exportMappingData();
      res.setHeader('Content-Disposition', 'attachment; filename="grizzlysms_mappings.json"');
      res.setHeader('Content-Type', 'application/json');
      res.json(exportData);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getDataImports(_req: Request, res: Response): Promise<void> {
    try {
      const imports = GrizzlyDataManagementService.getImportHistory();
      res.json({ success: true, imports });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
