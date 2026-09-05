# Generation & Execution API

> **Endpoints:** `POST /api/v1/generate-script` · `POST /api/v1/inspect-dom` · `POST /api/v1/run-test`
> **Module:** Generation Engine
> **Access:** Authenticated (JWT or API key) **and** approved
> **Source:** `src/server/routes/test-routes.ts`, `src/index.ts`, `src/crawler/`, `src/matcher/`, `src/generator/`, `src/validator/`, `src/server/services/test-runner-service.ts`

## Overview

The product's core capability, exposed as three endpoints that the web workspace and any external
integration use identically. `generate-script` runs the whole pipeline from business description to
finished test file; `inspect-dom` exposes just the crawler for debugging what the engine can see; and
`run-test` executes a script and returns its logs and a video.

## The pipeline

A single `generate-script` call performs six stages in order:

| # | Stage | What it does |
| :-: | :-- | :-- |
| 1 | **Validate & normalise** | Checks the DSL against a schema. Also repairs common variants: missing step numbers are filled in sequentially, the actions `type` and `input` are rewritten to `fill`, and a `target` key is accepted as an alias for `targetLabel`. |
| 2 | **Crawl with state transitions** | Launches headless Chromium, opens the target URL, and then walks the steps *one at a time* — extracting the candidate elements visible right now, matching the current step, then actually performing that action so the next step sees the page as it will really be. |
| 3 | **Score & match** | Every candidate on the current page is scored against the step's target label using the deterministic matrix; the highest score wins, ties break toward the top-left element. |
| 4 | **Resolve a selector** | The winning element is turned into the most stable locator strategy it supports. |
| 5 | **Transpile** | The resolved steps are rendered through the framework's template and, for Playwright and Cypress, formatted. |
| 6 | **Dry-run & self-heal** *(optional)* | The script is executed headlessly. If it fails, the failing step is retried with its runner-up candidate; if that passes, the healed script replaces the original. |

Stage 2 is what makes multi-page flows work: a login form's second page simply does not exist in the
DOM until the first page has been submitted, so a single-snapshot crawler could never match it.

## Scoring matrix

| Priority | Rule | Score | Resulting locator |
| :-: | :-- | :-: | :-- |
| 1 | Exact test-id match (`data-testid`, `data-test`, `data-qa`, `data-cy`, `data-testing`) | 100 (short-circuits) | `getByTestId` |
| 2 | Associated label — exact / partial | 90 / 75 | `getByLabel` |
| 3 | ARIA role plus accessible name — exact / partial | 88 / 70 | `getByRole` |
| 4 | Visible text — exact / partial | 85 / 60 | `getByText` |
| 5 | Placeholder or aria-label — exact / partial | 80 / 65 | `getByPlaceholder` |
| — | Exact `id` / `name` attribute (only when nothing above scored 60) | 60 / 55 | CSS locator |
| — | Bag-of-words token match (only below 50) | 65 / 60 / 45 | varies |
| 6 | Fuzzy Levenshtein, 60% similarity or better (only when nothing else scored) | up to 50 | text locator |

Only the single best attribute contributes — scores do not accumulate across rules — which keeps the
numbers comparable between steps and pages. Small action-appropriateness bonuses are then added
(+5 clicking a real button or link, +5 filling a real input, +15 uploading to a file input, +15
asserting against a pure text node).

Hard filters run first: hidden elements and `input[type=hidden]` score zero for any interaction, a
`fill` or `select` against a non-fillable element scores zero outright, and a `click` on a bare
`div`/`span`/`p`/`label` with no role, id, or test-id is penalised 20 points.

## Endpoint: POST /api/v1/generate-script

**Request**

| Field | Type | Required | Description |
| :-- | :-- | :-: | :-- |
| `dsl` | object | Yes | The scenario — see the [DSL schema](../appendix/enum-dictionary.md) |
| `dsl.testSuite` | string | Yes | Non-empty; names the test |
| `dsl.targetUrl` | string | Yes | Must parse as an `http`/`https` URL |
| `dsl.framework` | enum | No | `playwright` (default) · `cypress` · `selenium` · `robotframework` |
| `dsl.language` | enum | No | `typescript` (default) · `javascript` · `python` · `robot` |
| `dsl.viewport` | `{width, height}` | No | Defaults to 1280 × 720 |
| `dsl.steps[]` | array | Yes | At least one step |
| `dryRun` | boolean | No | Run headless verification after generating |
| `outPath` | string | No | Server-side path to also write the file to |
| `folderId` | string | **Yes** | Must be a folder the caller owns (admins may use any) |

**Response (200)** — `historyId`, `code`, `resolvedSteps[]`, `warnings[]`, `logs[]`, and when a dry run
ran, `dryRunPassed` and `dryRunError`.

Each resolved step reports its action, target, the chosen `selectorType` and `selectorValue`, the
match score, a human-readable match reason, the top five ranked candidates, and any warning.

**Errors**

| Condition | HTTP | Body |
| :-- | :-: | :-- |
| `dsl` missing | 400 | *Missing required field: dsl* |
| `folderId` missing or not a string | 400 | *Please select or create a folder before generating a script.* |
| Folder does not exist or is not the caller's | 400 | *Invalid folder. Select one of your own folders.* |
| DSL validation or generation failed | 422 | `errors[]` — one message per schema violation |
| Unexpected failure | 500 | `error` |

**Side effects:** an activity-log entry (`Generate Script` or `Generate Script Failed`); a usage row
when the caller authenticated with an API key; and on success a Flow History record with status
`GENERATED` holding the code, the resolved steps, and the raw DSL.

**Warnings that do not fail the request** — these appear in `warnings[]` and as comments in the
generated code:

| Warning | Meaning |
| :-- | :-- |
| Low match score (0) for target | Nothing on the page matched; a bare text locator is emitted as a fallback |
| Ambiguous Element Detected | Several candidates tied on the top score; the top-left one was chosen |
| Auto-corrected action from `select` to `fill` | The resolved element is not a `<select>` |
| URL Assertion Failed (Score 0) | At crawl time the page was not at the expected URL, usually because an earlier step failed |
| Self-Healed: Fallback to Rank 2 candidate | The dry run repaired this step |

## Endpoint: POST /api/v1/inspect-dom

**Request:** `url` (required) and an optional `viewport`.

**Response (200):** the URL, a candidate count, and the full candidate list — for each element its
tag, id, name, test-id, placeholder, aria-label, inner text, associated label, role, type, href,
value, visibility, iframe context, and bounding box.

Useful for answering "why did it match that?" before writing a scenario. Note that this endpoint
launches a browser but writes **no** history, activity log, or usage row.

## Endpoint: POST /api/v1/run-test

**Request**

| Field | Type | Required | Description |
| :-- | :-- | :-: | :-- |
| `code` | string | Yes | The script to execute |
| `mode` | enum | No | `headless` (default) or `headed` |
| `language` | enum | No | `typescript` (default) or `javascript` — decides the temp file extension |
| `historyId` | string | No | Existing record to update |
| `saveAsNewHistory` | boolean | No | Create a new record instead of updating (the replay case) |
| `testSuite`, `targetUrl`, `rawDsl`, `resolvedSteps`, `folderId` | mixed | No | Used only when creating a new record |

**Response (200):** `success`, `logs`, `durationMs`, `videoUrl` (a one-hour signed URL) when a
recording was produced, and `historyId`.

**Errors**

| Condition | HTTP | Body |
| :-- | :-: | :-- |
| `code` missing or not a string | 400 | *Missing required field: code* |
| Code matched the sanitizer blocklist | 403 | *Submitted code contains blocked patterns…* plus `violations[]` |
| Unexpected failure | 500 | `error` |

**Execution environment:** a fresh temporary directory per run, holding the script and a generated
Playwright configuration with video recording always on, a 1280 × 720 viewport, and a timeout taken
from the environment (120 s by default). Headed mode adds a one-second slow-motion delay and, on
Linux without a display, wraps the command in a virtual framebuffer. The child process receives a
**stripped environment** — only the variables Playwright genuinely needs, never the JWT secret,
database credentials, or the admin password. The temporary directory is deleted afterwards, and any
recording is uploaded to a private bucket under the caller's user id.

## Security controls

| Control | Applies to | Behaviour |
| :-- | :-- | :-- |
| **Code sanitizer** | `run-test` and every dry run, including self-healed code | Rejects the script if it references process internals or `process.env`, `child_process` or any exec helper, synchronous filesystem calls, `eval` / `new Function` / `.constructor` / `Reflect` / `globalThis`, path-disclosure globals (`__dirname`, `__filename`, `process.cwd()`, `process.argv`, `import.meta`), or any import or `require` that is not from `@playwright/...` |
| **Environment allowlist** | Every child process | Only path, locale, display, temp, and Playwright-related variables are passed through |
| **Template literal escaping** | Code generation | Every interpolated value is escaped for its target language — JavaScript/TypeScript string literals, Python literals, and Robot Framework cells (line breaks and multi-space separators collapsed) — so a scenario value cannot break out of a string and inject code |
| **Concurrency limiter** | Generation and execution | Separate queues, 5 and 3 concurrent by default, so a burst waits instead of exhausting browser processes |

## Consumers

| Consumer | How it calls in |
| :-- | :-- |
| [Scenario Builder](./02-workspace-scenario-builder.md) | JWT session, from the browser |
| CI pipelines and scripts | API key in `X-API-Key` or as a bearer token |
| [CLI and library](./15-cli-and-library.md) | Not over HTTP — the same engine invoked in-process |

## Business Rules

- **Determinism is the product promise.** The same DSL against the same page always yields the same
  script: no model, no randomness, no network calls to a third party.
- **Generation is expensive and honest about it.** Every call launches a real browser and walks the
  real application, which is why it is queued and why the crawl performs the steps as it goes.
- **Folders are enforced at the API, not just the UI.** An integration cannot bypass the folder
  requirement, so no scenario is ever orphaned at creation.
- **A failed match never fails the request.** The engine emits a fallback text locator and a warning,
  so the user gets a script to inspect and fix rather than an error — deliberate, because a partially
  wrong script is more useful than nothing.
- **Assertions are checked twice.** URL assertions are evaluated during the crawl (producing a warning
  when the page did not transition as expected) and again in the emitted script at runtime.
- **The emitted Playwright script is defensive.** It wraps each interaction in a retry helper that
  waits for the element, scrolls the page, and retries up to 15 times — so a script survives lazy
  loading and slow single-page-app rendering without hand-tuning.
