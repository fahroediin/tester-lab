import { Router, Response } from 'express';
import { authenticateJWT, requireAdmin } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { loadEmailConfigPublic, saveEmailConfig } from '../email-config-store.js';
import { testConnection, type SmtpCreds } from '../services/email-service.js';

export const emailConfigRoutes = Router();

/** GET /api/v1/email-config — current config without the SMTP password (US-B / AC-B.02). */
emailConfigRoutes.get('/', authenticateJWT, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ success: true, data: await loadEmailConfigPublic() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** POST /api/v1/email-config — save SMTP + templates (US-B / AC-B.01/03/06/07). */
emailConfigRoutes.post('/', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const b = req.body || {};
    if (!b.smtpHost || !b.smtpUser) {
      res.status(400).json({ success: false, error: 'SMTP Host and SMTP User are required.' });
      return;
    }
    await saveEmailConfig({
      smtpHost: b.smtpHost,
      smtpPort: parseInt(b.smtpPort, 10) || 587,
      smtpUser: b.smtpUser,
      smtpPass: b.smtpPass,
      smtpFromName: b.smtpFromName || 'Tester Lab',
      approveSubject: b.approveSubject || '',
      approveBody: b.approveBody || '',
      rejectSubject: b.rejectSubject || '',
      rejectBody: b.rejectBody || '',
      resetSubject: b.resetSubject || '',
      resetBody: b.resetBody || ''
    });
    res.json({ success: true, message: 'Email configuration saved successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** POST /api/v1/email-config/test — verify SMTP connectivity (US-B / AC-B.04/05). */
emailConfigRoutes.post('/test', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const b = req.body || {};
  const creds: SmtpCreds = {
    host: b.smtpHost,
    port: parseInt(b.smtpPort, 10) || 587,
    user: b.smtpUser,
    pass: b.smtpPass
  };
  const r = await testConnection(creds);
  if (r.ok) {
    res.json({ success: true, message: 'SMTP connection successful.' });
  } else {
    res.status(400).json({ success: false, error: `SMTP connection failed: ${r.error || 'could not connect to host.'}` });
  }
});
