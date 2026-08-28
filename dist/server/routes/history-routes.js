"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.historyRoutes = void 0;
const express_1 = require("express");
const auth_middleware_js_1 = require("../auth-middleware.js");
const flow_history_store_js_1 = require("../flow-history-store.js");
exports.historyRoutes = (0, express_1.Router)();
/**
 * GET /api/v1/history
 * Get all history records for the current user
 */
exports.historyRoutes.get('/', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireApprovedUser, (req, res) => {
    try {
        const userId = req.user.id;
        const history = (0, flow_history_store_js_1.getUserHistory)(userId);
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
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message || 'Failed to fetch history' });
    }
});
/**
 * GET /api/v1/history/:id
 * Get details for a specific history record
 */
exports.historyRoutes.get('/:id', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireApprovedUser, (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const record = (0, flow_history_store_js_1.getHistoryById)(id || '');
        if (!record) {
            res.status(404).json({ success: false, error: 'History record not found' });
            return;
        }
        if (record.userId !== userId && req.user.role !== 'admin') {
            res.status(403).json({ success: false, error: 'Unauthorized to view this record' });
            return;
        }
        res.json({ success: true, data: record });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message || 'Failed to fetch history details' });
    }
});
/**
 * DELETE /api/v1/history/:id
 * Delete a specific history record
 */
exports.historyRoutes.delete('/:id', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireApprovedUser, (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const record = (0, flow_history_store_js_1.getHistoryById)(id || '');
        if (!record) {
            res.status(404).json({ success: false, error: 'History record not found' });
            return;
        }
        if (record.userId !== userId && req.user.role !== 'admin') {
            res.status(403).json({ success: false, error: 'Unauthorized to delete this record' });
            return;
        }
        const deleted = (0, flow_history_store_js_1.deleteHistory)(record.id);
        if (!deleted) {
            res.status(500).json({ success: false, error: 'Failed to delete record' });
            return;
        }
        res.json({ success: true, message: 'History record deleted successfully' });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message || 'Failed to delete history' });
    }
});
