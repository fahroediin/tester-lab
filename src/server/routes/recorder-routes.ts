import { Router, Response } from 'express';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';

export const recorderRoutes = Router();

const INJECTED_AGENT_TAG = '<script src="/js/recorder-agent.js"></script>';

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
 * GET /api/v1/recorder/proxy
 * Reverse-proxy endpoint to embed target websites inside the Recorder iframe.
 * Strips frame-blocking security headers and injects the recorder client script.
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
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': (req.headers['accept-language'] as string) || 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });

    const contentType = upstreamResponse.headers.get('content-type') || '';
    const finalUrl = upstreamResponse.url || targetUrl;

    // Forward status code
    res.status(upstreamResponse.status);

    // Set permissive frame headers so iframe embedding works cleanly
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    res.setHeader('X-Frame-Options', 'ALLOWALL');

    if (contentType.includes('text/html')) {
      const htmlText = await upstreamResponse.text();

      // Ensure relative links, stylesheets, and images resolve to target origin
      const baseTag = `<base href="${finalUrl}">`;
      let injectedHtml = htmlText;

      if (injectedHtml.includes('<head>')) {
        injectedHtml = injectedHtml.replace('<head>', `<head>\n  ${baseTag}\n  ${INJECTED_AGENT_TAG}`);
      } else if (injectedHtml.includes('<html>')) {
        injectedHtml = injectedHtml.replace('<html>', `<html>\n<head>${baseTag}${INJECTED_AGENT_TAG}</head>`);
      } else {
        injectedHtml = `${baseTag}${INJECTED_AGENT_TAG}\n${injectedHtml}`;
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
