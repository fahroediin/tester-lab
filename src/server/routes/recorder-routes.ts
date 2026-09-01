import { Router, Response, Request } from 'express';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { handleRecorderProxy, handleAssetProxy } from '../services/recorder-proxy-service.js';

export const recorderRoutes = Router();

export interface RecordedStepPayload {
  action: string;
  targetLabel: string;
  value?: string;
  description?: string;
}

// In-memory buffer of recorded steps keyed by sessionId
const recordingSessions = new Map<string, RecordedStepPayload[]>();

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_STEPS_PER_SESSION = 1000;
const MAX_SESSIONS = 500;
const MAX_FIELD_LENGTH = 4096;

// Periodically bound total memory used by orphaned recording sessions.
setInterval(() => {
  if (recordingSessions.size > MAX_SESSIONS) {
    recordingSessions.clear();
  }
}, 7200000);

function clampField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.length > MAX_FIELD_LENGTH ? value.slice(0, MAX_FIELD_LENGTH) : value;
}

/**
 * POST /api/v1/recorder/ingest
 * Cross-origin ingestion endpoint used by the recorder agent (injected script).
 * Intentionally unauthenticated (runs inside the proxied third-party page), so it
 * is strictly validated and bounded to limit abuse of the shared in-memory buffer.
 */
recorderRoutes.options('/ingest', (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

recorderRoutes.post('/ingest', (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { sessionId, step } = req.body as { sessionId?: string; step?: RecordedStepPayload };

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    res.status(400).json({ success: false, error: 'Invalid or missing sessionId' });
    return;
  }
  if (!step || typeof step.action !== 'string' || !step.action) {
    res.status(400).json({ success: false, error: 'Invalid step payload' });
    return;
  }

  const cleanStep: RecordedStepPayload = {
    action: step.action.slice(0, 64),
    targetLabel: clampField(step.targetLabel) ?? '',
    value: clampField(step.value),
    description: clampField(step.description)
  };

  if (!recordingSessions.has(sessionId)) {
    if (recordingSessions.size >= MAX_SESSIONS) {
      res.status(429).json({ success: false, error: 'Too many active recording sessions' });
      return;
    }
    recordingSessions.set(sessionId, []);
  }

  const sessionSteps = recordingSessions.get(sessionId)!;
  if (sessionSteps.length >= MAX_STEPS_PER_SESSION) {
    res.status(429).json({ success: false, error: 'Recording session step limit reached' });
    return;
  }

  // Merge consecutive fill steps on the same field
  const lastStep = sessionSteps[sessionSteps.length - 1];
  if (lastStep && lastStep.action === 'fill' && cleanStep.action === 'fill' && lastStep.targetLabel === cleanStep.targetLabel) {
    lastStep.value = cleanStep.value || '';
    lastStep.description = cleanStep.description || `Type ${lastStep.value} into ${lastStep.targetLabel}`;
  } else {
    sessionSteps.push(cleanStep);
  }

  res.json({ success: true, count: sessionSteps.length });
});

/**
 * GET /api/v1/recorder/session/:sessionId/steps
 * Poll captured steps for an active recording session
 */
recorderRoutes.get('/session/:sessionId/steps', authenticateJWT, requireApprovedUser, (req: AuthenticatedRequest, res: Response) => {
  const sessionId = req.params.sessionId;
  if (!sessionId) {
    res.status(400).json({ success: false, error: 'Session ID required' });
    return;
  }
  const steps = recordingSessions.get(sessionId) || [];
  res.json({ success: true, steps });
});

recorderRoutes.delete('/session/:sessionId', authenticateJWT, requireApprovedUser, (req: AuthenticatedRequest, res: Response) => {
  const sessionId = req.params.sessionId;
  if (sessionId) {
    recordingSessions.delete(sessionId);
  }
  res.json({ success: true });
});

/**
 * GET /api/v1/recorder/proxy
 * Reverse-proxy endpoint to embed target websites inside the Recorder (SSRF-guarded).
 */
recorderRoutes.get('/proxy', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  await handleRecorderProxy(req, res);
});

// Fallback middleware for target application sub-resource assets (chunks, styles, images).
export const proxyAssetMiddleware = handleAssetProxy;
