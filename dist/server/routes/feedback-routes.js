"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackRoutes = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const express_1 = require("express");
exports.feedbackRoutes = (0, express_1.Router)();
/**
 * POST /api/v1/feedback
 * Submit user feedback with optional file attachment
 */
exports.feedbackRoutes.post('/', (req, res) => {
    try {
        const { type, details, fileBase64, filename } = req.body;
        if (!type || !details) {
            res.status(400).json({ success: false, error: 'Type and details are required' });
            return;
        }
        const feedbackDir = path_1.default.join(process.cwd(), 'data', 'feedbacks');
        const attachmentsDir = path_1.default.join(feedbackDir, 'attachments');
        if (!fs_1.default.existsSync(attachmentsDir)) {
            fs_1.default.mkdirSync(attachmentsDir, { recursive: true });
        }
        const feedbackId = crypto_1.default.randomUUID();
        let savedFilename = null;
        if (fileBase64 && filename) {
            // Validate file extension
            const ext = path_1.default.extname(filename).toLowerCase();
            if (!['.png', '.jpg', '.jpeg', '.bmp'].includes(ext)) {
                res.status(400).json({ success: false, error: 'Invalid file extension. Only png, jpg, jpeg, bmp are allowed.' });
                return;
            }
            // Decode base64
            const base64Data = fileBase64.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            const maxSize = parseInt(process.env.MAX_FEEDBACK_FILE_SIZE || '5242880', 10);
            if (buffer.length > maxSize) {
                res.status(400).json({ success: false, error: `File size exceeds the limit of ${Math.round(maxSize / 1024 / 1024)}MB` });
                return;
            }
            savedFilename = `${feedbackId}${ext}`;
            const filePath = path_1.default.join(attachmentsDir, savedFilename);
            fs_1.default.writeFileSync(filePath, buffer);
        }
        const feedbackData = {
            id: feedbackId,
            timestamp: new Date().toISOString(),
            type,
            details,
            attachment: savedFilename
        };
        const logFile = path_1.default.join(feedbackDir, 'feedbacks.json');
        let feedbacks = [];
        if (fs_1.default.existsSync(logFile)) {
            feedbacks = JSON.parse(fs_1.default.readFileSync(logFile, 'utf-8'));
        }
        feedbacks.push(feedbackData);
        fs_1.default.writeFileSync(logFile, JSON.stringify(feedbacks, null, 2));
        res.json({ success: true, message: 'Feedback submitted successfully' });
    }
    catch (err) {
        const error = err;
        console.error('Feedback API Error:', error);
        res.status(500).json({ success: false, error: error.message || 'Server error' });
    }
});
