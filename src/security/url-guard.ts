/*
 * tester-lab - Non-LLM Automated Test Script Generator
 * Copyright (c) 2026 Imam Fahrudin
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU Affero General Public License v3.0.
 * See the LICENSE file in the project root for full license text.
 */
/**
 * URL Guard — SSRF Defense
 *
 * Validates outbound target URLs for the recorder proxy so an authenticated
 * user cannot coerce the server into fetching internal/loopback/link-local
 * resources or cloud metadata endpoints.
 */

export function isValidHttpUrl(target: string): boolean {
  try {
    const parsed = new URL(target);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Parse a dotted-quad IPv4 string into its 4 octets, or null if not IPv4. */
function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/** True when the IPv4 octets fall inside a private / reserved / loopback range. */
function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && octets[2] === 0) return true; // 192.0.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true; // multicast + reserved + 255.255.255.255
  return false;
}

/** Basic checks for internal IPv6 literals (loopback, unique-local, link-local, mapped v4). */
function isPrivateIpv6(host: string): boolean {
  let h = host;
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  h = h.toLowerCase();
  if (h === '::1' || h === '::') return true;
  if (h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true;
  // IPv4-mapped / embedded (e.g. ::ffff:127.0.0.1)
  const v4 = h.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4 && v4[1]) {
    const octets = parseIpv4(v4[1]);
    if (octets && isPrivateIpv4(octets)) return true;
  }
  return false;
}

export interface UrlSafetyResult {
  ok: boolean;
  reason?: string;
}

/**
 * Reject non-http(s) URLs and any host that resolves to an internal name or a
 * private/reserved IP literal. Hostname-based (does not perform DNS resolution),
 * so DNS-rebinding to an internal address is a known residual risk.
 */
export function assertSafeProxyUrl(target: string): UrlSafetyResult {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only http and https protocols are allowed' };
  }

  const host = parsed.hostname.toLowerCase();

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return { ok: false, reason: 'Access to internal hostnames is not allowed' };
  }

  const ipv4 = parseIpv4(host);
  if (ipv4 && isPrivateIpv4(ipv4)) {
    return { ok: false, reason: 'Access to private / reserved IP ranges is not allowed' };
  }

  if (host.includes(':') && isPrivateIpv6(host)) {
    return { ok: false, reason: 'Access to internal IPv6 ranges is not allowed' };
  }

  return { ok: true };
}
