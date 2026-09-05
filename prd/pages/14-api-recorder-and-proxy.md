# Recorder API & Reverse Proxy

> **Endpoints:** `GET /api/v1/recorder/proxy` · `POST /api/v1/recorder/ingest` · `GET /api/v1/recorder/session/:sessionId/steps` · `DELETE /api/v1/recorder/session/:sessionId` · plus a catch-all asset proxy
> **Module:** Scenario Authoring
> **Access:** Mixed — see the table below
> **Source:** `src/server/routes/recorder-routes.ts`, `src/server/services/recorder-proxy-service.ts`, `src/security/url-guard.ts`

## Overview

The server-side half of the [Interaction Recorder](./03-interaction-recorder.md). Its job is to make a
third-party website render inside the Tester Lab workspace and report what the tester does to it. That
requires fetching the site server-side, neutralising the defences that stop pages being framed, and
injecting a small capture agent — each of which carries a security consequence the design has to
answer for.

## Endpoints

| Endpoint | Method | Auth | Purpose |
| :-- | :-: | :-- | :-- |
| `/api/v1/recorder/proxy?url=` | GET | JWT or API key, approved (accepts `?token=` because iframes cannot send headers) | Fetch and serve the target page with the agent injected |
| *(catch-all middleware)* | any | None | Proxy sub-resources — scripts, styles, chunks, images — for the page currently being recorded |
| `/api/v1/recorder/ingest` | POST | **None** | Receive a captured step from the injected agent |
| `/api/v1/recorder/session/:sessionId/steps` | GET | JWT or API key, approved | Poll the buffered steps for a session |
| `/api/v1/recorder/session/:sessionId` | DELETE | JWT or API key, approved | End a session and discard its buffer |

## GET /api/v1/recorder/proxy

**Request:** `url` — the target page. **Response:** the target's HTML, rewritten.

Processing order:

1. Reject anything that is not a syntactically valid `http`/`https` URL.
2. Run the SSRF guard (below); reject with 400 and a reason if it fails.
3. Fetch the target, following redirects, forwarding the caller's user agent, accept, and language
   headers and presenting itself as a top-level navigation.
4. **Re-run the SSRF guard on the final URL** — a redirect must not be able to land on an internal
   address.
5. Set a cookie recording the resolved origin, so sub-resource requests can be attributed.
6. Strip `X-Frame-Options`, both CSP headers, and the three cross-origin isolation headers from the
   response; explicitly allow framing.
7. For HTML: strip equivalent `<meta>` tags, then inject a `<base>` tag pointing at the final URL, a
   shim that neutralises frame-buster scripts, and the recorder agent inlined into a `<script>` tag.
   Non-HTML responses are passed through with their content type intact.
8. On any network failure, return 502 with the underlying message.

### SSRF guard

Rejected before any request is made:

| Rejected | Examples |
| :-- | :-- |
| Non-HTTP schemes | `file:`, `gopher:`, `ftp:` |
| Internal hostnames | `localhost`, `*.localhost`, `*.local`, `*.internal` |
| Private and reserved IPv4 | `0.0.0.0/8`, `10/8`, `127/8`, `169.254/16` (including the cloud metadata address `169.254.169.254`), `172.16/12`, `192.168/16`, `100.64/10`, `192.0.0/24`, `198.18/15`, and everything from `224.0.0.0` up |
| Internal IPv6 | `::1`, `::`, `fe80::/10`, `fc00::/7`, and IPv4-mapped forms of the above |

**Documented residual risk:** the guard is hostname-based and performs no DNS resolution, so a
hostname that resolves to an internal address (DNS rebinding) is not caught. This is acknowledged in
the source. Resolving the host and validating the resolved addresses — and pinning the connection to
them — would close it.

## Asset fallback proxy

A catch-all middleware registered after all real routes. Any request it cannot attribute is passed
straight through to the normal 404 handling.

- **Skipped entirely** for `/api/*`, `/`, `/admin`, `/css/*`, and `/js/*` — the application's own
  surfaces are never proxied.
- **Origin resolution:** first from a referer that itself points at the proxy endpoint, otherwise from
  the origin cookie the proxy set. It is deliberately resolved **per request**, never from shared
  mutable server state, so two users recording different sites cannot cross over.
- **Re-validated** by the same SSRF guard before fetching.
- HTML responses fetched this way also get the recorder agent injected.

## POST /api/v1/recorder/ingest — unauthenticated by design

This endpoint is called from inside a third-party page, so it cannot carry the user's credentials.
It is therefore treated as hostile input and bounded on every axis:

| Guard | Limit |
| :-- | :-- |
| Session id format | Must match `[A-Za-z0-9_-]{8,128}` |
| Steps per session | 1000, then 429 |
| Concurrent sessions | 500, then 429 |
| Field length | Every string clamped to 4096 characters; the action name to 64 |
| Storage | An in-memory map only — it never touches the database or the filesystem |
| Reaping | The whole map is cleared every two hours if it has exceeded the session cap |

It also merges consecutive `fill` steps on the same target label, exactly as the browser-side buffer
does. CORS is opened (`*`) for this endpoint and its preflight, which it must be to work at all.

## Known gap: the ingest path is currently unreachable

The injected agent only calls `ingest` when it can find a `session` identifier — from its own script
`src` query string, or from the page URL. But the proxy injects the agent **inline**, so there is no
`src`, and the workspace never adds a `session` parameter to the proxy URL. The session id is
therefore always empty and the HTTP call never fires.

In the shipped product, captured steps travel only through the browser: the agent posts each payload
to the parent window and broadcasts it on a channel, and the workspace listens on both.

**Consequences to decide on:**

- The `ingest`, `session/:id/steps`, and `session/:id` endpoints are dead code paths — either remove
  them, or finish the wiring by generating a session id in the workspace and passing it through the
  proxy URL into the injected script.
- Without the server-side buffer there is no recovery: reloading the workspace tab loses everything
  captured so far.
- An unauthenticated, CORS-open endpoint is exposed with no product benefit today. Bounded as it is,
  the exposure is small, but it is non-zero.

## Business Rules

- **Recording is a deliberate weakening of the browser's protections, contained to one iframe.** The
  product exists to drive other people's applications, so frame protections must come off — but only
  for the specific page a signed-in, approved user asked to record, fetched through a guard that
  refuses internal targets.
- **The proxy carries no credentials of its own.** It forwards no cookies or authorization to the
  target, so it can only fetch what an anonymous visitor could — which also means sites behind a login
  cannot be recorded past their sign-in page unless that sign-in happens inside the recorder.
- **The session token appears in a URL.** The workspace passes the JWT as a query parameter because an
  iframe navigation cannot carry headers. That value can end up in server logs and browser history; a
  short-lived, single-purpose recorder token would be safer than the full session token.
