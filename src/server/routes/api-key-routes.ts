import { Router, Response } from 'express';
import { authenticateJWT, requireApprovedUser, requireJwtOnly } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { generateApiKey, getUserApiKeys, revokeApiKey, deleteApiKey } from '../api-key-store.js';
import { getUserApiKeysUsageSummary, getAllApiKeysUsageSummary, getUsageResetDays, getPeriodStartDate } from '../api-key-usage-store.js';
import { addLog } from '../activity-log-store.js';

export const apiKeyRoutes = Router();

// Enforce JWT authentication and approved account status for all API Key management endpoints
apiKeyRoutes.use(authenticateJWT, requireApprovedUser, requireJwtOnly);

/**
 * GET /api/v1/api-keys
 * List all API keys belonging to the authenticated user (or all keys if admin) with usage summary
 */
apiKeyRoutes.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const keys = await getUserApiKeys(req.user!.id);
    const usageMap = await getUserApiKeysUsageSummary(req.user!.id);
    const periodDays = getUsageResetDays();
    const periodStart = getPeriodStartDate().toISOString();

    const enrichedKeys = keys.map((k) => ({
      ...k,
      usage: usageMap[k.id] || {
        apiKeyId: k.id,
        total: 0,
        generated: 0,
        success: 0,
        failed: 0,
        periodDays,
        periodStart
      }
    }));

    res.json({
      success: true,
      data: enrichedKeys
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch API keys'
    });
  }
});

/**
 * POST /api/v1/api-keys
 * Generate a new API key for the authenticated user
 */
apiKeyRoutes.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name } = req.body;
    const apiKey = await generateApiKey(req.user!.id, name);

    await addLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'API Key Created',
      details: `Generated new API key '${apiKey.name}' (${apiKey.keyPrefix})`
    });

    res.status(201).json({
      success: true,
      message: 'API Key generated successfully. Save this key now; it cannot be shown again.',
      data: apiKey
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to generate API key'
    });
  }
});

/**
 * DELETE /api/v1/api-keys/:id
 * Revoke an API key
 */
apiKeyRoutes.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const keyId = req.params.id;
    if (!keyId) {
      res.status(400).json({ success: false, error: 'Missing API key ID' });
      return;
    }
    const success = await revokeApiKey(req.user!.id, keyId);

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'API key not found or already revoked'
      });
      return;
    }

    await addLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'API Key Revoked',
      details: `Revoked API key with ID ${keyId}`
    });

    res.json({
      success: true,
      message: 'API key revoked successfully'
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to revoke API key'
    });
  }
});

/**
 * DELETE /api/v1/api-keys/:id/delete
 * Permanently delete an API key record
 */
apiKeyRoutes.delete('/:id/delete', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const keyId = req.params.id;
    if (!keyId) {
      res.status(400).json({ success: false, error: 'Missing API key ID' });
      return;
    }
    const success = await deleteApiKey(req.user!.id, keyId);

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'API key not found'
      });
      return;
    }

    await addLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'API Key Deleted',
      details: `Deleted API key with ID ${keyId}`
    });

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete API key'
    });
  }
});
