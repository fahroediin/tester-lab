"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRoutes = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = require("express");
const auth_middleware_js_1 = require("../auth-middleware.js");
const auth_store_js_1 = require("../auth-store.js");
const activity_log_store_js_1 = require("../activity-log-store.js");
exports.adminRoutes = (0, express_1.Router)();
/**
 * GET /api/v1/admin/users
 * List all registration requests (Admin only)
 */
exports.adminRoutes.get('/users', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, (req, res) => {
    const users = (0, auth_store_js_1.loadUsers)().map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt
    }));
    res.json({
        success: true,
        users
    });
});
/**
 * GET /api/v1/admin/logs
 * List all activity logs (Admin only)
 */
exports.adminRoutes.get('/logs', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, (req, res) => {
    const limit = parseInt(req.query.limit) || 200;
    const logs = (0, activity_log_store_js_1.getLogs)(limit);
    res.json({
        success: true,
        logs
    });
});
/**
 * GET /api/v1/admin/feedbacks
 * List all user feedbacks (Admin only)
 */
exports.adminRoutes.get('/feedbacks', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const feedbackDir = path_1.default.join(process.cwd(), 'data', 'feedbacks');
        const logFile = path_1.default.join(feedbackDir, 'feedbacks.json');
        let feedbacks = [];
        if (fs_1.default.existsSync(logFile)) {
            feedbacks = JSON.parse(fs_1.default.readFileSync(logFile, 'utf-8'));
        }
        // Sort newest first
        feedbacks.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const total = feedbacks.length;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedFeedbacks = feedbacks.slice(startIndex, endIndex);
        res.json({
            success: true,
            feedbacks: paginatedFeedbacks,
            total,
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
exports.adminRoutes.delete('/feedbacks/:id', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, (req, res) => {
    try {
        const id = req.params.id;
        const feedbackDir = path_1.default.join(process.cwd(), 'data', 'feedbacks');
        const logFile = path_1.default.join(feedbackDir, 'feedbacks.json');
        if (!fs_1.default.existsSync(logFile)) {
            res.status(404).json({ success: false, error: 'Feedbacks not found' });
            return;
        }
        const feedbacks = JSON.parse(fs_1.default.readFileSync(logFile, 'utf-8'));
        const index = feedbacks.findIndex(f => f.id === id);
        if (index === -1) {
            res.status(404).json({ success: false, error: 'Feedback not found' });
            return;
        }
        const feedback = feedbacks[index];
        // Delete attachment if it exists
        if (feedback.attachment) {
            const attachmentPath = path_1.default.join(feedbackDir, 'attachments', feedback.attachment);
            if (fs_1.default.existsSync(attachmentPath)) {
                fs_1.default.unlinkSync(attachmentPath);
            }
        }
        // Remove from array and save
        feedbacks.splice(index, 1);
        fs_1.default.writeFileSync(logFile, JSON.stringify(feedbacks, null, 2));
        (0, activity_log_store_js_1.addLog)({
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
exports.adminRoutes.post('/users/:id/approve', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, (req, res) => {
    const id = req.params.id;
    const updated = (0, auth_store_js_1.updateUserStatus)(id, 'approved');
    if (!updated) {
        res.status(404).json({ success: false, error: 'User not found.' });
        return;
    }
    (0, activity_log_store_js_1.addLog)({
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
exports.adminRoutes.post('/users/:id/reject', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, (req, res) => {
    const id = req.params.id;
    const updated = (0, auth_store_js_1.updateUserStatus)(id, 'rejected');
    if (!updated) {
        res.status(404).json({ success: false, error: 'User not found.' });
        return;
    }
    (0, activity_log_store_js_1.addLog)({
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
exports.adminRoutes.delete('/users/:id', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, (req, res) => {
    const id = req.params.id;
    const deleted = (0, auth_store_js_1.deleteUser)(id);
    if (!deleted) {
        res.status(404).json({ success: false, error: 'User not found.' });
        return;
    }
    (0, activity_log_store_js_1.addLog)({
        userId: req.user.id,
        username: req.user.username,
        action: 'Admin Delete',
        details: `Deleted user ID '${id}'`
    });
    res.json({
        success: true,
        message: 'User deleted successfully.'
    });
});
