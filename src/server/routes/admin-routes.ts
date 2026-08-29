import { Router, Response } from 'express';
import { authenticateJWT, requireAdmin } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { loadUsersAsync, updateUserStatus, deleteUser } from '../auth-store.js';
import { getLogs, addLog } from '../activity-log-store.js';
import { getAdminApiKeyStats, getAdminApiKeyLogs } from '../api-key-usage-store.js';
import { supabase } from '../supabase-client.js';

export const adminRoutes = Router();

/**
 * GET /api/v1/admin/users
 * List all registration requests (Admin only)
 */
adminRoutes.get('/users', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const users = (await loadUsersAsync()).map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt
  }));

  res.json({ success: true, users });
});

/**
 * GET /api/v1/admin/logs
 * List all activity logs (Admin only)
 */
adminRoutes.get('/logs', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string, 10) || 200;
  const logs = await getLogs(limit);
  res.json({ success: true, logs });
});

async function resolveAttachmentUrl(attachment: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('feedback-attachments')
      .createSignedUrl(attachment, 3600);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch {
    // fallback to public url if signed url fails
  }
  const { data: urlData } = supabase.storage
    .from('feedback-attachments')
    .getPublicUrl(attachment);
  return urlData?.publicUrl || null;
}

/**
 * GET /api/v1/admin/feedbacks
 * List all user feedbacks (Admin only)
 */
adminRoutes.get('/feedbacks', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    
    const { count: total } = await supabase
      .from('feedbacks')
      .select('*', { count: 'exact', head: true });
    
    const startIndex = (page - 1) * limit;
    const { data: feedbacks, error } = await supabase
      .from('feedbacks')
      .select('*')
      .order('timestamp', { ascending: false })
      .range(startIndex, startIndex + limit - 1);
    
    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }
    
    const mappedFeedbacks = await Promise.all(
      (feedbacks || []).map(async (f: Record<string, unknown>) => ({
        ...f,
        attachmentUrl: typeof f.attachment === 'string' ? await resolveAttachmentUrl(f.attachment) : null
      }))
    );
    
    res.json({
      success: true,
      feedbacks: mappedFeedbacks,
      total: total || 0,
      page,
      limit
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
});

/**
 * DELETE /api/v1/admin/feedbacks/:id
 * Delete user feedback (Admin only)
 */
adminRoutes.delete('/feedbacks/:id', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    
    const { data: feedback, error: fetchError } = await supabase
      .from('feedbacks')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !feedback) {
      res.status(404).json({ success: false, error: 'Feedback not found' });
      return;
    }
    
    if (feedback.attachment) {
      await supabase.storage
        .from('feedback-attachments')
        .remove([feedback.attachment]);
    }
    
    const { error: deleteError } = await supabase
      .from('feedbacks')
      .delete()
      .eq('id', id);
    
    if (deleteError) {
      res.status(500).json({ success: false, error: deleteError.message });
      return;
    }
    
    await addLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'Admin Delete Feedback',
      details: `Deleted feedback ID '${id}'`
    });

    res.json({ success: true, message: 'Feedback deleted successfully' });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
});

/**
 * POST /api/v1/admin/users/:id/approve
 * Approve user registration request (Admin only)
 */
adminRoutes.post('/users/:id/approve', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string;
  const updated = await updateUserStatus(id, 'approved');

  if (!updated) {
    res.status(404).json({ success: false, error: 'User not found.' });
    return;
  }

  await addLog({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'Admin Approve',
    details: `Approved user '${updated.username}'`
  });

  res.json({
    success: true,
    message: `Account '${updated.username}' approved successfully.`,
    user: updated
  });
});

/**
 * POST /api/v1/admin/users/:id/reject
 * Reject user registration request (Admin only)
 */
adminRoutes.post('/users/:id/reject', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string;
  const updated = await updateUserStatus(id, 'rejected');

  if (!updated) {
    res.status(404).json({ success: false, error: 'User not found.' });
    return;
  }

  await addLog({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'Admin Reject',
    details: `Rejected user '${updated.username}'`
  });

  res.json({
    success: true,
    message: `Account '${updated.username}' rejected.`,
    user: updated
  });
});

/**
 * DELETE /api/v1/admin/users/:id
 * Delete user account (Admin only)
 */
adminRoutes.delete('/users/:id', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string;
  const deleted = await deleteUser(id);

  if (!deleted) {
    res.status(404).json({ success: false, error: 'User not found.' });
    return;
  }

  await addLog({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'Admin Delete',
    details: `Deleted user ID '${id}'`
  });

  res.json({ success: true, message: 'User deleted successfully.' });
});

/**
 * GET /api/v1/admin/api-keys/stats
 * Aggregate hit stats across all API keys
 */
adminRoutes.get('/api-keys/stats', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await getAdminApiKeyStats();
    res.json({ success: true, data: stats });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch API key stats'
    });
  }
});

/**
 * GET /api/v1/admin/api-keys/logs
 * List all API Key hit / activity logs with pagination
 */
adminRoutes.get('/api-keys/logs', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 15;
    const result = await getAdminApiKeyLogs(page, limit);

    res.json({
      success: true,
      logs: result.logs,
      total: result.total,
      page,
      limit
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch API key logs'
    });
  }
});
