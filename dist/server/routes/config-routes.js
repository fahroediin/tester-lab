"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configRoutes = void 0;
const express_1 = require("express");
const auth_middleware_js_1 = require("../auth-middleware.js");
const config_store_js_1 = require("../config-store.js");
exports.configRoutes = (0, express_1.Router)();
/**
 * GET /api/v1/config
 * Get application configuration
 */
exports.configRoutes.get('/', auth_middleware_js_1.authenticateJWT, async (req, res) => {
    try {
        const config = await (0, config_store_js_1.loadConfig)();
        res.json({
            success: true,
            data: config
        });
    }
    catch (err) {
        const error = err;
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
exports.configRoutes.post('/', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireAdmin, async (req, res) => {
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
        await (0, config_store_js_1.saveConfig)(newConfig);
        res.json({
            success: true,
            message: 'Configuration saved successfully',
            data: newConfig
        });
    }
    catch (err) {
        const error = err;
        res.status(500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
});
