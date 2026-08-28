"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const auth_routes_js_1 = require("./routes/auth-routes.js");
const admin_routes_js_1 = require("./routes/admin-routes.js");
const feedback_routes_js_1 = require("./routes/feedback-routes.js");
const test_routes_js_1 = require("./routes/test-routes.js");
const history_routes_js_1 = require("./routes/history-routes.js");
const config_routes_js_1 = require("./routes/config-routes.js");
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
app.use(express_1.default.json({ limit: '10mb' }));
// Serve static files from public directory
app.use(express_1.default.static(path_1.default.join(process.cwd(), 'public')));
app.use(express_1.default.static(path_1.default.join(process.cwd(), 'dist', 'public')));
app.use('/feedbacks/attachments', express_1.default.static(path_1.default.join(process.cwd(), 'data', 'feedbacks', 'attachments')));
/**
 * Root Route: Serve Interactive HTML Web UI
 */
app.get('/', (req, res) => {
    const indexPath = path_1.default.join(process.cwd(), 'public', 'index.html');
    res.sendFile(indexPath);
});
/**
 * Admin Route: Serve Dedicated Admin Console Page
 */
app.get('/admin', (req, res) => {
    const adminPath = path_1.default.join(process.cwd(), 'public', 'admin.html');
    res.sendFile(adminPath);
});
// Register routes
app.use('/api/v1/auth', auth_routes_js_1.authRoutes);
app.use('/api/v1/admin', admin_routes_js_1.adminRoutes);
app.use('/api/v1/feedback', feedback_routes_js_1.feedbackRoutes);
app.use('/api/v1/history', history_routes_js_1.historyRoutes);
app.use('/api/v1/config', config_routes_js_1.configRoutes);
app.use('/api/v1', test_routes_js_1.testRoutes); // testRoutes has endpoints like /generate-script, /inspect-dom, /run-test directly under /api/v1
// Global Error Handler to ensure JSON responses for API errors (e.g. malformed JSON in body-parser)
app.use((err, req, res, next) => {
    console.error('[Global Error Handler]', err.message || err);
    if (req.path.startsWith('/api/')) {
        res.status(err.status || 500).json({
            success: false,
            error: err.message || 'Internal Server Error'
        });
    }
    else {
        next(err);
    }
});
// API 404 Fallback
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
});
app.listen(port, () => {
    console.log(`Tester Lab backend listening on http://localhost:${port}`);
});
