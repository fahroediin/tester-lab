import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { assertSafeProxyUrl, isValidHttpUrl } from '../lib/url-guard.js';

/** Extract a cookie by name from a raw cookie header string. */
function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

/** Inlined recorder agent script tag to inject into proxied target pages. */
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
  } catch (err: unknown) {
    console.warn('[Recorder Proxy] Failed to read recorder-agent.js from disk:', (err as Error).message || err);
  }
  return '<script src="/js/recorder-agent.js"></script>';
}

/** Strip meta tags that could instruct the browser to block iframe rendering. */
function sanitizeHtmlForIframe(html: string): string {
  return html
    .replace(/<meta[^>]*http-equiv=["']?(content-security-policy|x-frame-options|frame-ancestors)["']?[^>]*>/gi, '')
    .replace(/<meta[^>]*content=["'][^"']*(frame-ancestors|deny|sameorigin)[^"']*["'][^>]*http-equiv=["']?[^"'>]+["']?[^>]*>/gi, '');
}

/** Strip frame-blocking response headers so the target renders inside the recorder iframe. */
function stripFrameHeaders(res: Response): void {
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('Content-Security-Policy-Report-Only');
  res.removeHeader('Cross-Origin-Embedder-Policy');
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.removeHeader('Cross-Origin-Resource-Policy');
}

/** Inject the recorder agent + base tag + anti-frame-buster into an HTML document. */
function injectRecorder(html: string, finalUrl: string): string {
  const sanitized = sanitizeHtmlForIframe(html);
  const baseTag = `<base href="${finalUrl}">`;
  const antiFrameBuster =
    `<script>try { if (window.top !== window.self) { Object.defineProperty(window, 'top', { get: function() { return window.self; } }); } } catch(e) {}</script>`;
  const injectionBlock = `${baseTag}\n${antiFrameBuster}\n${getInlinedRecorderScript()}`;

  if (sanitized.includes('<head>')) {
    return sanitized.replace('<head>', `<head>\n  ${injectionBlock}`);
  }
  if (sanitized.includes('<html>')) {
    return sanitized.replace('<html>', `<html>\n<head>${injectionBlock}</head>`);
  }
  return `${injectionBlock}\n${sanitized}`;
}

const UPSTREAM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * GET /api/v1/recorder/proxy — reverse-proxy a target site into the recorder.
 * SSRF-guarded: rejects internal hosts and private/reserved IP ranges.
 */
export async function handleRecorderProxy(req: Request, res: Response): Promise<void> {
  const targetUrl = req.query.url as string | undefined;

  if (!targetUrl || !isValidHttpUrl(targetUrl)) {
    res.status(400).send('Invalid or missing target URL. Must be a valid HTTP or HTTPS URL.');
    return;
  }

  const safety = assertSafeProxyUrl(targetUrl);
  if (!safety.ok) {
    res.status(400).send(`Target URL rejected: ${safety.reason}`);
    return;
  }

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': req.headers['user-agent'] || UPSTREAM_UA,
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

    // A redirect must not land on an internal address either.
    const finalSafety = assertSafeProxyUrl(finalUrl);
    if (!finalSafety.ok) {
      res.status(400).send(`Target URL rejected after redirect: ${finalSafety.reason}`);
      return;
    }

    const origin = new URL(finalUrl).origin;
    res.status(upstreamResponse.status);
    res.setHeader('Set-Cookie', `__tl_proxy_origin=${encodeURIComponent(origin)}; Path=/; SameSite=Lax`);
    stripFrameHeaders(res);
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (contentType.includes('text/html')) {
      const rawHtml = await upstreamResponse.text();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(injectRecorder(rawHtml, finalUrl));
      return;
    }

    res.setHeader('Content-Type', contentType);
    const arrayBuffer = await upstreamResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: unknown) {
    const error = err as Error;
    res.status(502).send(`Failed to proxy target URL (${targetUrl}): ${error.message || 'Network error'}`);
  }
}

/**
 * Fallback middleware that proxies sub-resource requests (scripts, CSS, chunks)
 * for the currently-proxied origin. The origin is resolved per-request from the
 * Referer or the __tl_proxy_origin cookie — never from shared mutable state — and
 * is re-validated by the SSRF guard.
 */
export async function handleAssetProxy(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      const rawTarget = new URL(referer).searchParams.get('url');
      if (rawTarget) proxyOrigin = new URL(rawTarget).origin;
    } catch {
      /* ignore malformed referer */
    }
  }

  if (!proxyOrigin) {
    proxyOrigin = getCookieValue(req.headers.cookie, '__tl_proxy_origin');
  }

  if (!proxyOrigin || assertSafeProxyUrl(proxyOrigin).ok === false) {
    next();
    return;
  }

  try {
    const upstreamAssetUrl = `${proxyOrigin.replace(/\/$/, '')}${req.originalUrl}`;
    const upstreamResponse = await fetch(upstreamAssetUrl, {
      method: req.method,
      headers: {
        'User-Agent': req.headers['user-agent'] || UPSTREAM_UA,
        'Accept': req.headers['accept'] || '*/*',
        'Accept-Language': (req.headers['accept-language'] as string) || 'en-US,en;q=0.9'
      }
    });

    const contentType = upstreamResponse.headers.get('content-type') || 'application/octet-stream';
    res.status(upstreamResponse.status);
    stripFrameHeaders(res);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);

    if (contentType.includes('text/html')) {
      const rawHtml = await upstreamResponse.text();
      res.send(injectRecorder(rawHtml, upstreamAssetUrl));
      return;
    }

    const arrayBuffer = await upstreamResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch {
    next();
  }
}
