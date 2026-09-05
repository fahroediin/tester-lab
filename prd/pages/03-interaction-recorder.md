# Interaction Recorder

> **Surface:** Full-screen modal launched from the [Scenario Builder](./02-workspace-scenario-builder.md)
> **Module:** Scenario Authoring
> **Access:** Authenticated, approved account
> **Source:** `public/index.html` (`#recorderModal`), `public/js/app.js`, `public/js/recorder-agent.js`, `src/server/services/recorder-proxy-service.ts`

## Overview

Lets a tester build a scenario by *doing* it rather than describing it. The target website is loaded
inside the workspace through a server-side reverse proxy; a small recorder script is injected into the
proxied page, watches the tester's clicks and typing, and streams each action back to the builder as a
draft DSL step. When the tester is finished, the captured steps are appended to the Execution Steps
list, ready to be generated like any hand-written scenario.

This exists because writing target-element labels by hand is the slowest and most error-prone part of
authoring a scenario, especially on unfamiliar or deeply nested applications.

## Layout

A near-full-screen modal (1200 px wide, 90% of viewport height):

- **Header:** title, a *Recording Active* chip, a live *"N steps recorded"* counter, **Cancel**, and
  **Apply Recorded Steps**.
- **Live feed bar:** the most recently captured step in monospace, plus a **Clear** link.
- **Body:** a sandboxed iframe filling the remaining space, showing the proxied target site.

The injected agent also draws its own floating badge inside the target page — *"Tester Lab Recording:
N step(s) captured"* — pinned to the bottom-right of the iframe.

## Fields

The recorder has no form fields of its own. It reads one value from the builder and writes a list back.

| Control | Behaviour |
| :-- | :-- |
| **Cancel** | Closes the modal and blanks the iframe; the captured buffer is discarded |
| **Apply Recorded Steps** | Appends every buffered step to the builder's Execution Steps and closes |
| **Clear** (feed bar) | Empties the buffer without closing; the feed resets to the "Cleared…" prompt |

Each captured step carries: action, target label, value, and a generated description.

## Interactions

### Opening the recorder

- **Trigger:** *Record Steps*, from either the Execution Steps header or below the step list.
- **Pre-checks:** the builder's Target Web Application URL must be filled (*"Please enter a Target Web
  Application URL before starting the recorder"*) and must parse as an `http`/`https` URL
  (*"Please enter a valid HTTP or HTTPS URL"*). Either failure shows a warning toast and the modal
  does not open.
- **Behaviour:** the buffer is emptied, the counter resets to zero, and the iframe is pointed at
  `/api/v1/recorder/proxy?url=<target>&token=<jwt>`. The session token is passed in the query string
  because a browser cannot attach an `Authorization` header to an iframe navigation.

### What the injected agent captures

| Tester action | Recorded step | Value | Description template |
| :-- | :-- | :-- | :-- |
| Click a button, link, or element with a button role | `click` | — | *Click <label>* |
| Click a checkbox that becomes checked | `check` | — | *Check <label>* |
| Click a checkbox/radio that becomes unchecked | `uncheck` | — | *Uncheck <label>* |
| Type into a text input or textarea | `fill` | final field value | *Type <value> into <label>* |
| Change a dropdown | `select` | the option's visible text | *Select <value> from <label>* |

Behavioural details:

- **Clicks on text-like inputs are ignored** (`text`, `password`, `email`, `number`, `tel`, `search`)
  so focusing a field does not produce a spurious click step.
- **Typing is debounced by 400 ms** and also flushed on blur, on change, on form submit, and whenever
  the tester clicks something else — so one step is recorded per field, holding its final value, not
  one per keystroke.
- **Consecutive fills on the same field collapse.** If the previous captured step was a `fill` on the
  same target label, its value is overwritten rather than a new step appended.

### How an element gets its label

The agent walks a fixed priority list and stops at the first hit — this is what makes the recorded
labels human-readable and what the heuristic matcher later has to re-find on the real page:

1. A `<label for=…>` pointing at the element
2. An enclosing `<label>`
3. `aria-label`, then `title`
4. `placeholder`
5. Visible text, for buttons, links, and button-role elements (truncated at 40 characters)
6. The `name` attribute, then `#id`, then the element's own value if short
7. Finally, the tag name

### Live feedback while recording

Every captured step increments the header counter, replaces the feed bar text with
*"Captured: <description>"*, and updates the floating badge inside the target page.

### Applying the steps

- **Trigger:** *Apply Recorded Steps*.
- **Empty buffer:** a warning toast (*"No actions have been captured yet…"*) and nothing happens.
- **Otherwise:** each buffered step is appended to the end of the existing Execution Steps (recording
  augments, it never replaces), the step list re-renders — which also resets any previously generated
  output — the modal closes, and a success toast reports how many steps were added.

## API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| Recorder proxy | GET | `/api/v1/recorder/proxy?url=&token=` | Opening the modal | SSRF-guarded; injects the recorder agent |
| Asset fallback proxy | GET | any unmatched path | Sub-resources of the proxied page | Resolves the origin from the referer or a cookie |
| Step ingest | POST | `/api/v1/recorder/ingest` | *(not reached from this UI)* | See the gap note below |
| Poll session steps | GET | `/api/v1/recorder/session/:sessionId/steps` | *(not reached from this UI)* | |

Steps actually reach the builder **in-browser**, not over HTTP: the injected agent posts each payload
to the parent window (`postMessage`) and broadcasts it on a `BroadcastChannel`, and the workspace
listens on both.

## Page Relationships

- **From:** [Scenario Builder](./02-workspace-scenario-builder.md) — the target URL is read from it and
  the captured steps are written back to it.
- **To:** Nowhere. The recorder is a modal; closing it returns to the builder.
- **Data coupling:** Applying steps mutates the builder's step list, which in turn invalidates any
  previously generated script.

## Business Rules

- **The target site is fetched by the server, never by the browser directly.** This is what makes
  cross-origin recording possible at all, and it is why the proxy is SSRF-guarded: an authenticated
  user must not be able to make the server fetch internal hosts, loopback addresses, private IP
  ranges, or cloud metadata endpoints. The guard runs before the request *and* again on the final URL
  after redirects.
- **Frame-blocking defences on the target are deliberately stripped** so the page renders inside the
  iframe: `X-Frame-Options`, CSP, and cross-origin isolation headers are removed from the response,
  equivalent `<meta>` tags are stripped from the HTML, and a small shim neutralises frame-buster
  scripts. A `<base>` tag is injected so relative URLs resolve against the real origin.
- **Recorded steps are drafts, not selectors.** The recorder captures a human-readable *label*; the
  actual selector is decided later by the heuristic matcher against a freshly crawled DOM. A recorded
  scenario is therefore still portable across cosmetic UI changes.
- **Buffers are bounded.** The server-side buffer, if it were reached, caps at 1000 steps per session
  and 500 concurrent sessions, clamps every field to 4096 characters, and clears wholesale every two
  hours when the session count is exceeded.

## Known Gap

The recorder agent only POSTs to `/api/v1/recorder/ingest` when it can find a `session` identifier —
either in its own script `src` or in the page URL. The proxy injects the agent **inline**, with no
`src` and no session parameter, and the workspace never adds one to the proxy URL. In the current
build `currentSessionId` is therefore always empty, the HTTP ingest call never fires, and the
`ingest` / `session/:id/steps` / `session/:id` endpoints are unreachable from the product.

Consequences worth deciding on:

- Recording only works while the workspace tab stays open and the iframe stays same-page — there is no
  server-side buffer to recover from a reload.
- The unauthenticated `ingest` endpoint is live but unused: it is either dead code to remove, or the
  session wiring is unfinished and should be completed.
