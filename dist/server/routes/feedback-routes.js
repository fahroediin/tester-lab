"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackRoutes = void 0;
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const express_1 = require("express");
const supabase_client_js_1 = require("../supabase-client.js");
exports.feedbackRoutes = (0, express_1.Router)();
/**
 * POST /api/v1/feedback
 * Submit user feedback with optional file attachment (stored in Supabase Storage)
 */
exports.feedbackRoutes.post('/', async (req, res) => {
    try {
        const { type, details, fileBase64, filename } = req.body;
        if (!type || !details) {
            res.status(400).json({ success: false, error: 'Type and details are required' });
            return;
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
            // Upload to Supabase Storage
            const { error: uploadError } = await supabase_client_js_1.supabase.storage
                .from('feedback-attachments')
                .upload(savedFilename, buffer, {
                contentType: `image/${ext.replace('.', '')}`,
                upsert: false
            });
            if (uploadError) {
                console.error('Failed to upload feedback attachment to Supabase Storage:', uploadError);
                res.status(500).json({ success: false, error: 'Failed to upload attachment' });
                return;
            }
        }
        // Save feedback metadata to Supabase table
        const { error: insertError } = await supabase_client_js_1.supabase
            .from('feedbacks')
            .insert({
            id: feedbackId,
            type,
            details,
            attachment: savedFilename
        });
        if (insertError) {
            console.error('Failed to save feedback to Supabase:', insertError);
            res.status(500).json({ success: false, error: 'Failed to save feedback' });
            return;
        }
        res.json({ success: true, message: 'Feedback submitted successfully' });
    }
    catch (err) {
        const error = err;
        console.error('Feedback API Error:', error);
        res.status(500).json({ success: false, error: error.message || 'Server error' });
    }
});
