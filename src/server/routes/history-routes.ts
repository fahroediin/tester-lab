import { Router, Request, Response } from 'express';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { getUserHistory, getHistoryById, deleteHistory } from '../flow-history-store.js';

export const historyRoutes = Router();

/**
 * GET /api/v1/history
 * Get all history records for the current user
 */
historyRoutes.get('/', authenticateJWT, requireApprovedUser, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const history = getUserHistory(userId);
    
    // Map to strip out heavy fields (like generatedCode, resolvedSteps, logs) for the list view
    const summary = history.map(h => ({
      id: h.id,
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
historyRoutes.get('/:id', authenticateJWT, requireApprovedUser, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const record = getHistoryById(id || '');
    if (!record) {
      res.status(404).json({ success: false, error: 'History record not found' });
      return;
    }
    
    if (record.userId !== userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Unauthorized to view this record' });
      return;
    }
    
    res.json({ success: true, data: record });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch history details' });
  }
});

/**
 * DELETE /api/v1/history/:id
 * Delete a specific history record
 */
historyRoutes.delete('/:id', authenticateJWT, requireApprovedUser, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const record = getHistoryById(id || '');
    if (!record) {
      res.status(404).json({ success: false, error: 'History record not found' });
      return;
    }
    
    if (record.userId !== userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Unauthorized to delete this record' });
      return;
    }
    
    const deleted = deleteHistory(record.id);
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
