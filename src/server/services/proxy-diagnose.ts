/*
 * tester-lab - Non-LLM Automated Test Script Generator
 * Copyright (c) 2026 Imam Fahrudin
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU Affero General Public License v3.0.
 * See the LICENSE file in the project root for full license text.
 */
/**
 * Recorder proxy page diagnosis.
 *
 * Many target apps require authentication: hitting them 30x-redirects to a
 * login page. The proxied iframe then shows a confusing raw browser error.
 * diagnoseProxyPage() detects the common "redirected to login" case from the
 * final URL and the returned HTML, so the proxy can inject a clear, actionable
 * banner explaining WHY the page didn't load and what to do.
 *
 * Deliberately conservative: a page that merely links to "/login" from a nav
 * bar is NOT flagged — we require either a login-looking final URL (after a
 * redirect) or strong in-page login signals (a password field, or a login
 * title/heading on a short page). Pure; never throws.
 */

export type ProxyDiagnosisKind = 'ok' | 'login_required';

export interface ProxyDiagnosis {
  kind: ProxyDiagnosisKind;
  /** Human-readable, actionable message (present when kind !== 'ok'). */
  message?: string;
}

const LOGIN_MESSAGE =
  'Situs target mengarahkan ke halaman login. Recorder membuka situs lewat ' +
  'server (reverse-proxy) tanpa membawa sesi login Anda, sehingga aplikasi yang ' +
  'butuh autentikasi tidak dapat direkam langsung. Rekam alur pada halaman ' +
  'publik/tanpa login, atau susun langkah secara manual di Scenario Builder.';

/** True when a URL path looks like a login/sign-in/auth endpoint. */
function pathLooksLikeLogin(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return /(^|\/)(login|signin|sign-in|masuk|auth|sso|oauth|account\/login)(\/|$)/.test(p);
  } catch {
    return false;
  }
}

/** Host of a URL, or '' when unparseable. */
function hostOf(url: string): string {
  try { return new URL(url).host.toLowerCase(); } catch { return ''; }
}

/**
 * Diagnose a proxied page. Pure; never throws.
 *
 * @param targetUrl  what the user asked to open
 * @param finalUrl   where the fetch actually ended up (after redirects)
 * @param html       the returned HTML (may be partial)
 */
export function diagnoseProxyPage(
  targetUrl: string,
  finalUrl: string,
  html: string | null | undefined
): ProxyDiagnosis {
  const body = typeof html === 'string' ? html : '';
  const lower = body.toLowerCase();

  // Signal 1: a redirect took us to a login-looking URL (path or different host
  // that itself looks like an auth endpoint). This is the strongest signal.
  const redirected = !!finalUrl && !!targetUrl && finalUrl !== targetUrl;
  const finalIsLoginUrl = pathLooksLikeLogin(finalUrl);
  const hostChanged = hostOf(finalUrl) !== hostOf(targetUrl) && !!hostOf(finalUrl);
  if ((redirected && finalIsLoginUrl) || (hostChanged && finalIsLoginUrl)) {
    return { kind: 'login_required', message: LOGIN_MESSAGE };
  }

  // Signal 2: strong in-page login markers — a password input is the clearest.
  const hasPasswordField = /<input[^>]*type\s*=\s*["']?password["']?/i.test(lower);
  if (hasPasswordField) {
    return { kind: 'login_required', message: LOGIN_MESSAGE };
  }

  // Signal 3: a login-y <title> on a short page (login screens are small). This
  // avoids flagging a big content page that merely has a "Login" nav link.
  const titleMatch = lower.match(/<title[^>]*>([^<]*)<\/title>/);
  const title = titleMatch && titleMatch[1] ? titleMatch[1] : '';
  const titleLooksLogin = /\b(login|sign in|sign-in|masuk)\b/.test(title);
  if (titleLooksLogin && body.length < 4000) {
    return { kind: 'login_required', message: LOGIN_MESSAGE };
  }

  return { kind: 'ok' };
}
