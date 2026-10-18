/*
 * tester-lab - Non-LLM Automated Test Script Generator
 * Copyright (c) 2026 Imam Fahrudin
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU Affero General Public License v3.0.
 * See the LICENSE file in the project root for full license text.
 */
/**
 * Client event reporting (POC observability).
 *
 * Some actions happen entirely in the browser (e.g. importing a Katalon/JSON/
 * YAML scenario is parsed client-side), so the server never sees them. This
 * endpoint lets the authenticated client report such a meaningful event, which
 * is then written to the structured server log (PM2), NOT to Supabase.
 *
 * Strictly bounded so it cannot be used to flood the log: an allow-list of
 * actions, a short result, and a handful of clamped string/number fields only.
 */
import { Router, Response } from 'express';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { logEvent } from '../lib/event-logger.js';

export const eventRoutes = Router();

/** Only these client-reported actions are accepted (prevents arbitrary spam). */
const ALLOWED_ACTIONS = new Set(['import', 'export']);
const MAX_FIELD_LEN = 200;

function clampStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, MAX_FIELD_LEN) : undefined;
}

/**
 * POST /api/v1/events — report a client-side event for the server log.
 * Body: { action, result?, format?, steps?, msg? }
 */
eventRoutes.post('/', authenticateJWT, requireApprovedUser, (req: AuthenticatedRequest, res: Response) => {
  const b = req.body || {};
  const action = clampStr(b.action);
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    res.status(400).json({ success: false, error: 'Invalid or unsupported event action.' });
    return;
  }
  const result = b.result === 'error' ? 'error' : 'ok';
  const steps = typeof b.steps === 'number' && Number.isFinite(b.steps) ? Math.max(0, Math.floor(b.steps)) : undefined;

  logEvent({
    action,
    user: req.user?.username,
    result,
    source: 'client',
    format: clampStr(b.format),
    steps,
    msg: clampStr(b.msg)
  });

  res.json({ success: true });
});
