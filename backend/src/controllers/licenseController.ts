import { Request, Response } from 'express';
import { LicenseService } from '../services/licenseService.js';

export class LicenseController {
  private service: LicenseService;

  constructor() {
    this.service = LicenseService.getInstance();
  }

  public getStatus = (req: Request, res: Response): void => {
    try {
      const status = this.service.getActiveLicense();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve license status.' });
    }
  };

  public getHardwareId = (req: Request, res: Response): void => {
    try {
      const hwid = this.service.getHardwareId();
      res.json({
        hwid,
        platform: process.platform,
        arch: process.arch
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to determine Machine Hardware ID.' });
    }
  };

  public activate = (req: Request, res: Response): void => {
    try {
      const { licenseKey } = req.body;
      if (!licenseKey || typeof licenseKey !== 'string') {
        res.status(400).json({ error: 'Please enter a valid license activation key.' });
        return;
      }

      const result = this.service.activateLicense(licenseKey);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'License activation failed.' });
    }
  };

  public deactivate = (req: Request, res: Response): void => {
    try {
      const result = this.service.deactivateLicense();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to deactivate license.' });
    }
  };

  public generateKey = (req: Request, res: Response): void => {
    try {
      const { tier, days, isLifetime, hwid, dailyMsgLimit, dailyExtLimit, maxDevices } = req.body;
      const key = this.service.generateSignedKey({
        tier,
        days: days ? parseInt(days, 10) : undefined,
        isLifetime: Boolean(isLifetime),
        hwid,
        dailyMsgLimit: dailyMsgLimit ? parseInt(dailyMsgLimit, 10) : undefined,
        dailyExtLimit: dailyExtLimit ? parseInt(dailyExtLimit, 10) : undefined,
        maxDevices: maxDevices ? parseInt(maxDevices, 10) : undefined
      });
      res.json({ success: true, key });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to generate key.' });
    }
  };
}
