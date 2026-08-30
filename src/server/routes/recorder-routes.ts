import fs from 'fs';
import path from 'path';
import { Router, Response, Request, NextFunction } from 'express';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';

export const recorderRoutes = Router();

export interface RecordedStepPayload {
  action: string;
  targetLabel: string;
  value?: string;
  description?: string;
}

// In-memory buffer of recorded steps keyed by sessionId
const recordingSessions = new Map<string, RecordedStepPayload[]>();

// Cleanup stale sessions older than 2 hours periodically
setInterval(() => {
  if (recordingSessions.size > 200) {
    recordingSessions.clear();
  }
}, 7200000);

/**
 * Extract a cookie by name from cookie header string
 */
function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Validate that a URL string is a valid HTTP/HTTPS URL
 */
function isValidHttpUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Get inlined recorder agent script tag to inject directly into target page HTML
 */
function getInlinedRecorderScript(): string {
  try {
    const candidatePaths = [
      path.join(process.cwd(), 'public', 'js', 'recorder-agent.js'),
      path.join(process.cwd(), 'dist', 'public', 'js', 'recorder-agent.js')
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        const code = fs.readFileSync(p, 'utf-8');
        return `<script id="__tester_lab_recorder_injected__">\n${code}\n</script>`;
      }
    }
  } catch (err) {
    console.warn('[Recorder Proxy] Failed to read recorder-agent.js from disk:', err);
  }
  return '<script src="/js/recorder-agent.js"></script>';
}

/**
 * Strip meta tags that could instruct the browser to block iframe rendering
 */
function sanitizeHtmlForIframe(html: string): string {
  return html
    .replace(/<meta[^>]*http-equiv=["']?(content-security-policy|x-frame-options|frame-ancestors)["']?[^>]*>/gi, '')
    .replace(/<meta[^>]*content=["'][^"']*(frame-ancestors|deny|sameorigin)[^"']*["'][^>]*http-equiv=["']?[^"'>]+["']?[^>]*>/gi, '');
}

/**
 * POST /api/v1/recorder/ingest
 * Cross-origin ingestion endpoint used by recorder agent (bookmarklet or injected script)
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

  if (!sessionId || !step || !step.action) {
    res.status(400).json({ success: false, error: 'Invalid step payload or missing sessionId' });
    return;
  }

  if (!recordingSessions.has(sessionId)) {
    recordingSessions.set(sessionId, []);
  }

  const sessionSteps = recordingSessions.get(sessionId)!;

  // Merge consecutive fill steps on the same field
  const lastStep = sessionSteps[sessionSteps.length - 1];
  if (lastStep && lastStep.action === 'fill' && step.action === 'fill' && lastStep.targetLabel === step.targetLabel) {
    lastStep.value = step.value || '';
    lastStep.description = step.description || `Type ${lastStep.value} into ${lastStep.targetLabel}`;
  } else {
    sessionSteps.push(step);
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

let lastActiveProxyOrigin: string | null = null;

/**
 * Middleware: Intercept sub-resource requests (Next.js chunks, OutSystems assets, scripts, CSS)
 */
export async function proxyAssetMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (
    req.path.startsWith('/api/') ||
    req.path === '/' ||
    req.path === '/admin' ||
    req.path.startsWith('/css/') ||
    req.path.startsWith('/js/')
  ) {
    next();
    return;
  }

  let proxyOrigin: string | null = null;
  const referer = req.headers.referer || (req.headers.referrer as string | undefined);
  if (referer && referer.includes('/recorder/proxy?url=')) {
    try {
      const refUrl = new URL(referer);
      const rawTarget = refUrl.searchParams.get('url');
      if (rawTarget) {
        proxyOrigin = new URL(rawTarget).origin;
      }
    } catch {}
  }

  if (!proxyOrigin) {
    proxyOrigin = getCookieValue(req.headers.cookie, '__tl_proxy_origin');
  }

  if (!proxyOrigin && lastActiveProxyOrigin) {
    proxyOrigin = lastActiveProxyOrigin;
  }

  if (!proxyOrigin || !proxyOrigin.startsWith('http')) {
    next();
    return;
  }

  try {
    const upstreamAssetUrl = `${proxyOrigin.replace(/\/$/, '')}${req.originalUrl}`;
    const upstreamResponse = await fetch(upstreamAssetUrl, {
      method: req.method,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': req.headers['accept'] || '*/*',
        'Accept-Language': (req.headers['accept-language'] as string) || 'en-US,en;q=0.9'
      }
    });

    const contentType = upstreamResponse.headers.get('content-type') || 'application/octet-stream';
    res.status(upstreamResponse.status);
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);

    if (contentType.includes('text/html')) {
      const rawHtml = await upstreamResponse.text();
      const sanitizedHtml = sanitizeHtmlForIframe(rawHtml);
      const baseTag = `<base href="${upstreamAssetUrl}">`;
      const antiFrameBuster = `<script>try { if (window.top !== window.self) { Object.defineProperty(window, 'top', { get: function() { return window.self; } }); } } catch(e) {}</script>`;
      const injectedScript = getInlinedRecorderScript();
      const injectionBlock = `${baseTag}\n${antiFrameBuster}\n${injectedScript}`;

      let injectedHtml = sanitizedHtml;
      if (injectedHtml.includes('<head>')) {
        injectedHtml = injectedHtml.replace('<head>', `<head>\n  ${injectionBlock}`);
      } else if (injectedHtml.includes('<html>')) {
        injectedHtml = injectedHtml.replace('<html>', `<html>\n<head>${injectionBlock}</head>`);
      } else {
        injectedHtml = `${injectionBlock}\n${injectedHtml}`;
      }
      res.send(injectedHtml);
      return;
    }

    const arrayBuffer = await upstreamResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch {
    next();
  }
}

/**
 * GET /api/v1/recorder/proxy
 * Reverse-proxy endpoint to embed target websites inside the Recorder.
 */
recorderRoutes.get('/proxy', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const targetUrl = req.query.url as string | undefined;

  if (!targetUrl || !isValidHttpUrl(targetUrl)) {
    res.status(400).send('Invalid or missing target URL. Must be a valid HTTP or HTTPS URL.');
    return;
  }

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': (req.headers['accept-language'] as string) || 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site'
      },
      redirect: 'follow'
    });

    const contentType = upstreamResponse.headers.get('content-type') || '';
    const finalUrl = upstreamResponse.url || targetUrl;
    const origin = new URL(finalUrl).origin;
    lastActiveProxyOrigin = origin;

    // Forward status code
    res.status(upstreamResponse.status);

    // Set cookie so sub-resources are routed properly
    res.setHeader('Set-Cookie', `__tl_proxy_origin=${encodeURIComponent(origin)}; Path=/; SameSite=Lax`);

    // Strip all frame-blocking security response headers
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Cross-Origin-Resource-Policy');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (contentType.includes('text/html')) {
      const rawHtml = await upstreamResponse.text();
      const sanitizedHtml = sanitizeHtmlForIframe(rawHtml);

      // Ensure relative links, stylesheets, and images resolve to target origin
      const baseTag = `<base href="${finalUrl}">`;
      const antiFrameBuster = `<script>try { if (window.top !== window.self) { Object.defineProperty(window, 'top', { get: function() { return window.self; } }); } } catch(e) {}</script>`;
      const injectedScript = getInlinedRecorderScript();
      const injectionBlock = `${baseTag}\n${antiFrameBuster}\n${injectedScript}`;

      let injectedHtml = sanitizedHtml;
      if (injectedHtml.includes('<head>')) {
        injectedHtml = injectedHtml.replace('<head>', `<head>\n  ${injectionBlock}`);
      } else if (injectedHtml.includes('<html>')) {
        injectedHtml = injectedHtml.replace('<html>', `<html>\n<head>${injectionBlock}</head>`);
      } else {
        injectedHtml = `${injectionBlock}\n${injectedHtml}`;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(injectedHtml);
      return;
    }

    // For non-HTML assets (CSS, JS, images, fonts, etc.), stream buffer directly
    res.setHeader('Content-Type', contentType);
    const arrayBuffer = await upstreamResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: unknown) {
    const error = err as Error;
    res.status(502).send(`Failed to proxy target URL (${targetUrl}): ${error.message || 'Network error'}`);
  }
});
