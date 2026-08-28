"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_SECRET = void 0;
exports.authenticateJWT = authenticateJWT;
exports.requireJwtOnly = requireJwtOnly;
exports.requireApprovedUser = requireApprovedUser;
exports.requireAdmin = requireAdmin;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const auth_store_js_1 = require("./auth-store.js");
const api_key_store_js_1 = require("./api-key-store.js");
exports.JWT_SECRET = process.env.JWT_SECRET || (() => {
    console.warn('[SECURITY WARNING] JWT_SECRET not set in environment. Using auto-generated secret (sessions will NOT persist across restarts).');
    return crypto_1.default.randomBytes(32).toString('hex');
})();
/**
 * Unified Authentication Middleware:
 * Supports both JWT Bearer tokens and API Keys (via `X-API-Key` or `Authorization: Bearer tl_live_...`)
 */
async function authenticateJWT(req, res, next) {
    const apiKeyHeader = req.headers['x-api-key'];
    const authHeader = req.headers.authorization;
    // 1. Check for API Key in X-API-Key header
    if (apiKeyHeader && apiKeyHeader.startsWith('tl_live_')) {
        try {
            const authResult = await (0, api_key_store_js_1.validateApiKey)(apiKeyHeader);
            if (!authResult) {
                res.status(401).json({ success: false, error: 'Invalid or revoked API Key.' });
                return;
            }
            req.user = authResult.user;
            req.apiKey = authResult.apiKey;
            req.authMethod = 'api_key';
            next();
            return;
        }
        catch (err) {
            res.status(401).json({ success: false, error: 'API Key validation failed.' });
            return;
        }
    }
    // 2. Check for Authorization header
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const tokenOrKey = authHeader.substring(7).trim();
        // 2a. API Key passed in Bearer header
        if (tokenOrKey.startsWith('tl_live_')) {
            try {
                const authResult = await (0, api_key_store_js_1.validateApiKey)(tokenOrKey);
                if (!authResult) {
                    res.status(401).json({ success: false, error: 'Invalid or revoked API Key.' });
                    return;
                }
                req.user = authResult.user;
                req.apiKey = authResult.apiKey;
                req.authMethod = 'api_key';
                next();
                return;
            }
            catch (err) {
                res.status(401).json({ success: false, error: 'API Key validation failed.' });
                return;
            }
        }
        // 2b. Standard JWT Token
        try {
            const decoded = jsonwebtoken_1.default.verify(tokenOrKey, exports.JWT_SECRET);
            const user = await (0, auth_store_js_1.findUserByIdAsync)(decoded.userId);
            if (!user) {
                res.status(401).json({ success: false, error: 'Invalid authentication token.' });
                return;
            }
            req.user = user;
            req.authMethod = 'jwt';
            next();
            return;
        }
        catch (err) {
            res.status(401).json({ success: false, error: 'Session expired or invalid token. Please log in again.' });
            return;
        }
    }
    res.status(401).json({
        success: false,
        error: 'Access denied. Please provide a valid Bearer JWT token or X-API-Key header.'
    });
}
/**
 * Enforce that the request is authenticated via a JWT session (used for API Key management and Web UI operations)
 */
function requireJwtOnly(req, res, next) {
    if (req.authMethod !== 'jwt') {
        res.status(403).json({
            success: false,
            error: 'This operation requires a standard Web UI session token.'
        });
        return;
    }
    next();
}
function requireApprovedUser(req, res, next) {
    if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required.' });
        return;
    }
    if (req.user.status !== 'approved') {
        res.status(403).json({
            success: false,
            error: `Account status is '${req.user.status}'. Access is restricted until admin approval.`
        });
        return;
    }
    next();
}
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        res.status(403).json({ success: false, error: 'Access denied. Admin privilege required.' });
        return;
    }
    next();
}
