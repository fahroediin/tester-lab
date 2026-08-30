import fs from 'fs';
import path from 'path';
import { Router, Response } from 'express';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';

export const recorderRoutes = Router();

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
 * GET /api/v1/recorder/proxy
 * Reverse-proxy endpoint to embed target websites inside the Recorder iframe.
 * Strips frame-blocking security headers and meta tags, and inlines the recorder client script.
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

    // Forward status code
    res.status(upstreamResponse.status);

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
