import { Router, Request, Response } from 'express';
import { authenticateJWT, requireAdmin } from '../auth-middleware.js';
import { loadConfig, saveConfig } from '../config-store.js';

export const configRoutes = Router();

/**
 * GET /api/v1/config
 * Get application configuration
 */
configRoutes.get('/config', authenticateJWT, (req: Request, res: Response) => {
  try {
    const config = loadConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error'
    });
  }
});

/**
 * POST /api/v1/config
 * Update application configuration (Admin only)
 */
configRoutes.post('/config', authenticateJWT, requireAdmin, (req: Request, res: Response) => {
  try {
    const { sampleTestSuite, sampleTargetUrl, sampleSteps } = req.body;

    if (!sampleTestSuite || !sampleTargetUrl || !Array.isArray(sampleSteps)) {
      res.status(400).json({
        success: false,
        error: 'Missing or invalid configuration fields'
      });
      return;
    }

    const newConfig = {
      sampleTestSuite,
      sampleTargetUrl,
      sampleSteps
    };

    saveConfig(newConfig);

    res.json({
      success: true,
      message: 'Configuration saved successfully',
      data: newConfig
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error'
    });
  }
});
