"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRoutes = void 0;
const express_1 = require("express");
const auth_middleware_js_1 = require("../auth-middleware.js");
const auth_store_js_1 = require("../auth-store.js");
const activity_log_store_js_1 = require("../activity-log-store.js");
const api_key_usage_store_js_1 = require("../api-key-usage-store.js");
const supabase_client_js_1 = require("../supabase-client.js");
exports.adminRoutes = (0, express_1.Router)();
/**
 * GET /api/v1/admin/users
 * List all registration requests (Admin only)
 */
exports.adminRoutes.get('/users', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, async (req, res) => {
    const users = (await (0, auth_store_js_1.loadUsersAsync)()).map((u) => ({
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
exports.adminRoutes.get('/logs', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 200;
    const logs = await (0, activity_log_store_js_1.getLogs)(limit);
    res.json({ success: true, logs });
});
async function resolveAttachmentUrl(attachment) {
    try {
        const { data, error } = await supabase_client_js_1.supabase.storage
            .from('feedback-attachments')
            .createSignedUrl(attachment, 3600);
        if (!error && data?.signedUrl)
            return data.signedUrl;
    }
    catch {
        // fallback to public url if signed url fails
    }
    const { data: urlData } = supabase_client_js_1.supabase.storage
        .from('feedback-attachments')
        .getPublicUrl(attachment);
    return urlData?.publicUrl || null;
}
/**
 * GET /api/v1/admin/feedbacks
 * List all user feedbacks (Admin only)
 */
exports.adminRoutes.get('/feedbacks', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const { count: total } = await supabase_client_js_1.supabase
            .from('feedbacks')
            .select('*', { count: 'exact', head: true });
        const startIndex = (page - 1) * limit;
        const { data: feedbacks, error } = await supabase_client_js_1.supabase
            .from('feedbacks')
            .select('*')
            .order('timestamp', { ascending: false })
            .range(startIndex, startIndex + limit - 1);
        if (error) {
            res.status(500).json({ success: false, error: error.message });
            return;
        }
        const mappedFeedbacks = await Promise.all((feedbacks || []).map(async (f) => ({
            ...f,
            attachmentUrl: typeof f.attachment === 'string' ? await resolveAttachmentUrl(f.attachment) : null
        })));
        res.json({
            success: true,
            feedbacks: mappedFeedbacks,
            total: total || 0,
            page,
            limit
        });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message || 'Server error' });
    }
});
/**
 * DELETE /api/v1/admin/feedbacks/:id
 * Delete user feedback (Admin only)
 */
exports.adminRoutes.delete('/feedbacks/:id', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const { data: feedback, error: fetchError } = await supabase_client_js_1.supabase
            .from('feedbacks')
            .select('*')
            .eq('id', id)
            .single();
        if (fetchError || !feedback) {
            res.status(404).json({ success: false, error: 'Feedback not found' });
            return;
        }
        if (feedback.attachment) {
            await supabase_client_js_1.supabase.storage
                .from('feedback-attachments')
                .remove([feedback.attachment]);
        }
        const { error: deleteError } = await supabase_client_js_1.supabase
            .from('feedbacks')
            .delete()
            .eq('id', id);
        if (deleteError) {
            res.status(500).json({ success: false, error: deleteError.message });
            return;
        }
        await (0, activity_log_store_js_1.addLog)({
            userId: req.user.id,
            username: req.user.username,
            action: 'Admin Delete Feedback',
            details: `Deleted feedback ID '${id}'`
        });
        res.json({ success: true, message: 'Feedback deleted successfully' });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message || 'Server error' });
    }
});
/**
 * POST /api/v1/admin/users/:id/approve
 * Approve user registration request (Admin only)
 */
exports.adminRoutes.post('/users/:id/approve', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, async (req, res) => {
    const id = req.params.id;
    const updated = await (0, auth_store_js_1.updateUserStatus)(id, 'approved');
    if (!updated) {
        res.status(404).json({ success: false, error: 'User not found.' });
        return;
    }
    await (0, activity_log_store_js_1.addLog)({
        userId: req.user.id,
        username: req.user.username,
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
exports.adminRoutes.post('/users/:id/reject', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, async (req, res) => {
    const id = req.params.id;
    const updated = await (0, auth_store_js_1.updateUserStatus)(id, 'rejected');
    if (!updated) {
        res.status(404).json({ success: false, error: 'User not found.' });
        return;
    }
    await (0, activity_log_store_js_1.addLog)({
        userId: req.user.id,
        username: req.user.username,
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
exports.adminRoutes.delete('/users/:id', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, async (req, res) => {
    const id = req.params.id;
    const deleted = await (0, auth_store_js_1.deleteUser)(id);
    if (!deleted) {
        res.status(404).json({ success: false, error: 'User not found.' });
        return;
    }
    await (0, activity_log_store_js_1.addLog)({
        userId: req.user.id,
        username: req.user.username,
        action: 'Admin Delete',
        details: `Deleted user ID '${id}'`
    });
    res.json({ success: true, message: 'User deleted successfully.' });
});
/**
 * GET /api/v1/admin/api-keys/stats
 * Aggregate hit stats across all API keys
 */
exports.adminRoutes.get('/api-keys/stats', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, async (req, res) => {
    try {
        const stats = await (0, api_key_usage_store_js_1.getAdminApiKeyStats)();
        res.json({ success: true, data: stats });
    }
    catch (err) {
        const error = err;
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
exports.adminRoutes.get('/api-keys/logs', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 15;
        const result = await (0, api_key_usage_store_js_1.getAdminApiKeyLogs)(page, limit);
        res.json({
            success: true,
            logs: result.logs,
            total: result.total,
            page,
            limit
        });
    }
    catch (err) {
        const error = err;
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch API key logs'
        });
    }
});
