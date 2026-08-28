import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Router, Request, Response } from 'express';

export const feedbackRoutes = Router();

/**
 * POST /api/v1/feedback
 * Submit user feedback with optional file attachment
 */
feedbackRoutes.post('/', (req: Request, res: Response) => {
  try {
    const { type, details, fileBase64, filename } = req.body;
    
    if (!type || !details) {
      res.status(400).json({ success: false, error: 'Type and details are required' });
      return;
    }
    
    const feedbackDir = path.join(process.cwd(), 'data', 'feedbacks');
    const attachmentsDir = path.join(feedbackDir, 'attachments');
    
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true });
    }
    
    const feedbackId = crypto.randomUUID();
    let savedFilename = null;
    
    if (fileBase64 && filename) {
      // Validate file extension
      const ext = path.extname(filename).toLowerCase();
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
      const filePath = path.join(attachmentsDir, savedFilename);
      fs.writeFileSync(filePath, buffer);
    }
    
    const feedbackData = {
      id: feedbackId,
      timestamp: new Date().toISOString(),
      type,
      details,
      attachment: savedFilename
    };
    
    const logFile = path.join(feedbackDir, 'feedbacks.json');
    let feedbacks: unknown[] = [];
    if (fs.existsSync(logFile)) {
      feedbacks = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
    }
    feedbacks.push(feedbackData);
    fs.writeFileSync(logFile, JSON.stringify(feedbacks, null, 2));
    
    res.json({ success: true, message: 'Feedback submitted successfully' });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Feedback API Error:', error);
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
});
