import { Router, Request, Response } from 'express';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { getUserHistory, getHistoryById, deleteHistory, updateHistory } from '../flow-history-store.js';
import { getFolderById } from '../folder-store.js';
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

    // Optional filter by folder: ?folderId=<id> or ?folderId=none for uncategorized
    const folderFilter = typeof req.query.folderId === 'string' ? req.query.folderId : undefined;
    const filtered = folderFilter
      ? history.filter(h => (folderFilter === 'none' ? !h.folderId : h.folderId === folderFilter))
      : history;

    // Map to strip out heavy fields (like generatedCode, resolvedSteps, logs) for the list view
    const summary = filtered.map(h => ({
      id: h.id,
      folderId: h.folderId || null,
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
 * PATCH /api/v1/history/:id/folder
 * Move a scenario into a different folder (or out to uncategorized with folderId=null).
 */
historyRoutes.patch('/:id/folder', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
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

    const folderId = req.body?.folderId;
    if (folderId !== null && typeof folderId !== 'string') {
      res.status(400).json({ success: false, error: 'folderId must be a string or null' });
      return;
    }
    if (folderId) {
      const folder = await getFolderById(folderId);
      if (!folder || (folder.userId !== userId && req.user!.role !== 'admin')) {
        res.status(400).json({ success: false, error: 'Invalid folder' });
        return;
      }
    }

    const updated = await updateHistory(record.id, { folderId: folderId ?? null });
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
