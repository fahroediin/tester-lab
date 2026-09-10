import { Router, Response } from 'express';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { getUserHistory, getHistoryById, deleteHistory, updateHistory } from '../flow-history-store.js';
import { getProjectById } from '../folder-store.js';
import { getSuiteById } from '../suite-store.js';
import { signVideoUrl } from '../lib/storage-url.js';

export const historyRoutes = Router();

/**
 * GET /api/v1/history
 * Get all history records for the current user
 */
historyRoutes.get('/', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const history = await getUserHistory(userId);

    // Optional filter by project/folder: ?projectId=<id> or ?folderId=<id>
    const projectFilter = typeof req.query.projectId === 'string'
      ? req.query.projectId
      : (typeof req.query.folderId === 'string' ? req.query.folderId : undefined);

    // Optional filter by suite: ?suiteId=<id> or ?suiteId=none
    const suiteFilter = typeof req.query.suiteId === 'string' ? req.query.suiteId : undefined;

    let filtered = history;

    if (projectFilter) {
      filtered = filtered.filter(h => (projectFilter === 'none' ? !h.folderId : h.folderId === projectFilter));
    }

    if (suiteFilter) {
      filtered = filtered.filter(h => (suiteFilter === 'none' ? !h.suiteId : h.suiteId === suiteFilter));
    }

    // Map to strip out heavy fields (like generatedCode, resolvedSteps, logs) for the list view
    const summary = filtered.map(h => ({
      id: h.id,
      folderId: h.folderId || null,
      projectId: h.folderId || null,
      suiteId: h.suiteId || null,
      timestamp: h.timestamp,
      testSuite: h.testSuite,
      targetUrl: h.targetUrl,
      status: h.status,
      durationMs: h.durationMs,
      hasVideo: !!h.videoUrl
    }));

    res.json({ success: true, history: summary });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch history' });
  }
});

/**
 * GET /api/v1/history/:id
 * Get details for a specific history record
 */
historyRoutes.get('/:id', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const record = await getHistoryById(id || '');
    if (!record) {
      res.status(404).json({ success: false, error: 'History record not found' });
      return;
    }

    if (record.userId !== userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Unauthorized to view this record' });
      return;
    }

    // Re-sign the durable video path into a short-lived playback URL for the client
    const responseRecord = record.videoUrl
      ? { ...record, videoUrl: (await signVideoUrl(record.videoUrl)) || undefined }
      : record;

    res.json({ success: true, data: responseRecord });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch history details' });
  }
});

/**
 * PATCH /api/v1/history/:id/folder or /api/v1/history/:id/project
 * Move a scenario into a different project (or out to uncategorized with folderId=null).
 */
historyRoutes.patch(['/:id/folder', '/:id/project'], authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const record = await getHistoryById(req.params.id || '');
    if (!record) {
      res.status(404).json({ success: false, error: 'History record not found' });
      return;
    }
    if (record.userId !== userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Unauthorized to modify this record' });
      return;
    }

    const folderId = req.body?.projectId !== undefined ? req.body.projectId : req.body?.folderId;
    if (folderId !== null && typeof folderId !== 'string') {
      res.status(400).json({ success: false, error: 'projectId/folderId must be a string or null' });
      return;
    }
    if (folderId) {
      const project = await getProjectById(folderId);
      if (!project || (project.userId !== userId && req.user!.role !== 'admin')) {
        res.status(400).json({ success: false, error: 'Invalid project' });
        return;
      }
    }

    // If moved to a different project or uncategorized, reset suiteId if current suite doesn't belong
    let suiteId = record.suiteId;
    if (suiteId && (!folderId || folderId !== record.folderId)) {
      suiteId = null;
    }

    const updated = await updateHistory(record.id, {
      folderId: folderId ?? null,
      suiteId: suiteId ?? null
    });

    if (!updated) {
      res.status(500).json({ success: false, error: 'Failed to move scenario' });
      return;
    }
    res.json({ success: true, message: 'Scenario moved successfully' });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to move scenario' });
  }
});

/**
 * PATCH /api/v1/history/:id/suite
 * Move a scenario into a different suite (or out to uncategorized in project with suiteId=null).
 */
historyRoutes.patch('/:id/suite', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const record = await getHistoryById(req.params.id || '');
    if (!record) {
      res.status(404).json({ success: false, error: 'History record not found' });
      return;
    }
    if (record.userId !== userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Unauthorized to modify this record' });
      return;
    }

    const suiteId = req.body?.suiteId;
    if (suiteId !== null && typeof suiteId !== 'string') {
      res.status(400).json({ success: false, error: 'suiteId must be a string or null' });
      return;
    }

    let targetProjectId = record.folderId;
    if (suiteId) {
      const suite = await getSuiteById(suiteId);
      if (!suite) {
        res.status(400).json({ success: false, error: 'Invalid suite' });
        return;
      }
      const project = await getProjectById(suite.projectId);
      if (!project || (project.userId !== userId && req.user!.role !== 'admin')) {
        res.status(400).json({ success: false, error: 'Unauthorized to assign to this suite' });
        return;
      }
      targetProjectId = suite.projectId;
    }

    const updated = await updateHistory(record.id, {
      suiteId: suiteId ?? null,
      folderId: targetProjectId ?? null
    });

    if (!updated) {
      res.status(500).json({ success: false, error: 'Failed to move scenario to suite' });
      return;
    }
    res.json({ success: true, message: 'Scenario suite updated successfully' });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to update scenario suite' });
  }
});

/**
 * DELETE /api/v1/history/:id
 * Delete a specific history record
 */
historyRoutes.delete('/:id', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const record = await getHistoryById(id || '');
    if (!record) {
      res.status(404).json({ success: false, error: 'History record not found' });
      return;
    }

    if (record.userId !== userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Unauthorized to delete this record' });
      return;
    }

    const deleted = await deleteHistory(record.id);
    if (!deleted) {
      res.status(500).json({ success: false, error: 'Failed to delete record' });
      return;
    }

    res.json({ success: true, message: 'History record deleted successfully' });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to delete history' });
  }
});
