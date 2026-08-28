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
const crypto_1 = __importDefault(require("crypto"));
const auth_store_js_1 = require("./auth-store.js");
exports.JWT_SECRET = process.env.JWT_SECRET || (() => {
    console.warn('[SECURITY WARNING] JWT_SECRET not set in environment. Using auto-generated secret (sessions will NOT persist across restarts).');
    return crypto_1.default.randomBytes(32).toString('hex');
})();
function authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Access denied. No authentication token provided.' });
        return;
    }
    const token = authHeader.substring(7);
    try {
        const decoded = jsonwebtoken_1.default.verify(token, exports.JWT_SECRET);
        (0, auth_store_js_1.findUserByIdAsync)(decoded.userId).then(user => {
            if (!user) {
                res.status(401).json({ success: false, error: 'Invalid authentication token.' });
                return;
            }
            req.user = user;
            next();
        }).catch(() => {
            res.status(401).json({ success: false, error: 'Authentication error.' });
        });
    }
    catch (err) {
        res.status(401).json({ success: false, error: 'Session expired or invalid token. Please log in again.' });
    }
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
