"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_SECRET = void 0;
exports.authenticateJWT = authenticateJWT;
exports.requireApprovedUser = requireApprovedUser;
exports.requireAdmin = requireAdmin;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authStore_js_1 = require("./authStore.js");
exports.JWT_SECRET = process.env.JWT_SECRET || (() => {
    console.warn('[SECURITY WARNING] JWT_SECRET not set in environment. Using auto-generated secret (sessions will NOT persist across restarts).');
    return require('crypto').randomBytes(32).toString('hex');
})();
function authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Access denied. No authentication token provided.' });
    }
    const token = authHeader.substring(7);
    try {
        const decoded = jsonwebtoken_1.default.verify(token, exports.JWT_SECRET);
        const user = (0, authStore_js_1.findUserById)(decoded.userId);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid authentication token.' });
        }
        req.user = user;
        next();
    }
    catch (err) {
        return res.status(401).json({ success: false, error: 'Session expired or invalid token. Please log in again.' });
    }
}
function requireApprovedUser(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    if (req.user.status !== 'approved') {
        return res.status(403).json({
            success: false,
            error: `Account status is '${req.user.status}'. Access is restricted until admin approval.`
        });
    }
    next();
}
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied. Admin privilege required.' });
    }
    next();
}
