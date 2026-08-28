"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const auth_store_js_1 = require("../auth-store.js");
const activity_log_store_js_1 = require("../activity-log-store.js");
const auth_middleware_js_1 = require("../auth-middleware.js");
exports.authRoutes = (0, express_1.Router)();
/**
 * POST /api/v1/auth/register
 * Register new user account (defaults to status 'pending' for admin approval)
 */
exports.authRoutes.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            res.status(400).json({
                success: false,
                error: 'Username, email, and password are required.'
            });
            return;
        }
        if (password.length < 6) {
            res.status(400).json({
                success: false,
                error: 'Password must be at least 6 characters long.'
            });
            return;
        }
        const existingUser = (0, auth_store_js_1.findUserByUsername)(username);
        if (existingUser) {
            res.status(409).json({
                success: false,
                error: 'Username is already taken. Please choose another username.'
            });
            return;
        }
        const passwordHash = bcryptjs_1.default.hashSync(password, 10);
        const newUser = (0, auth_store_js_1.addUser)({
            username,
            email,
            passwordHash,
            role: 'user',
            status: 'pending'
        });
        (0, activity_log_store_js_1.addLog)({
            userId: newUser.id,
            username: newUser.username,
            action: 'Register',
            details: 'Requested new account access (pending approval)'
        });
        res.status(201).json({
            success: true,
            message: 'Registration request submitted successfully. Account is pending admin approval.',
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                role: newUser.role,
                status: newUser.status
            }
        });
    }
    catch (err) {
        const error = err;
        (0, activity_log_store_js_1.addLog)({
            username: req.body.username || 'System',
            action: 'Register Failed',
            details: error.message || 'Internal Server Error'
        });
        res.status(500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
});
/**
 * POST /api/v1/auth/login
 * Log in with username and password, returns JWT token
 */
exports.authRoutes.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({
                success: false,
                error: 'Username and password are required.'
            });
            return;
        }
        const user = (0, auth_store_js_1.findUserByUsername)(username);
        if (!user) {
            (0, activity_log_store_js_1.addLog)({
                username: username,
                action: 'Login Failed',
                details: 'Invalid username'
            });
            res.status(401).json({
                success: false,
                error: 'Invalid username or password.'
            });
            return;
        }
        const isMatch = bcryptjs_1.default.compareSync(password, user.passwordHash);
        if (!isMatch) {
            (0, activity_log_store_js_1.addLog)({
                userId: user.id,
                username: user.username,
                action: 'Login Failed',
                details: 'Invalid password'
            });
            res.status(401).json({
                success: false,
                error: 'Invalid username or password.'
            });
            return;
        }
        if (user.status === 'pending') {
            (0, activity_log_store_js_1.addLog)({
                userId: user.id,
                username: user.username,
                action: 'Login Failed',
                details: 'Account is pending approval'
            });
            res.status(403).json({
                success: false,
                error: 'Your account registration is pending admin approval. Please wait for admin confirmation.'
            });
            return;
        }
        if (user.status === 'rejected') {
            (0, activity_log_store_js_1.addLog)({
                userId: user.id,
                username: user.username,
                action: 'Login Failed',
                details: 'Account was rejected'
            });
            res.status(403).json({
                success: false,
                error: 'Your account registration request was rejected by the admin.'
            });
            return;
        }
        const token = jsonwebtoken_1.default.sign({
            userId: user.id,
            username: user.username,
            role: user.role,
            status: user.status
        }, auth_middleware_js_1.JWT_SECRET, { expiresIn: '7d' });
        (0, activity_log_store_js_1.addLog)({
            userId: user.id,
            username: user.username,
            action: 'Login Success',
            details: 'User authenticated successfully'
        });
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                status: user.status
            }
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
 * GET /api/v1/auth/me
 * Get current authenticated user profile
 */
exports.authRoutes.get('/me', auth_middleware_js_1.authenticateJWT, (req, res) => {
    const user = req.user;
    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            status: user.status
        }
    });
});
