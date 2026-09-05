# API Inventory

Every HTTP endpoint the server exposes, with its authentication requirement and behaviour.

**Authentication legend**

| Symbol | Meaning |
| :-- | :-- |
| **Public** | No credentials required |
| **Auth** | A valid JWT or API key |
| **Auth + Approved** | Valid credentials *and* account status `approved` |
| **JWT only** | A browser session token; API keys are explicitly rejected |
| **Admin** | Valid JWT and role `admin` |

All responses are JSON with a `success` boolean; failures carry an `error` string. A global handler
guarantees JSON for anything under `/api/`, and unmatched `/api/*` paths return 404 with the method
and URL echoed back.

---

## Authentication — `/api/v1/auth`

| Method | Path | Auth | Description |
| :-: | :-- | :-- | :-- |
| POST | `/register` | Public | Create an account. Always `user` / `pending`. 201 on success; 400 on missing fields or a password under 6 characters; 409 if the username is taken |
| POST | `/login` | Public | Exchange credentials for a 7-day JWT. 401 for bad credentials; 403 for a pending or rejected account |
| GET | `/me` | Auth | The current user's profile. Used to gate both the workspace and the admin console |

## Generation & Execution — `/api/v1`

| Method | Path | Auth | Description |
| :-: | :-- | :-- | :-- |
| POST | `/generate-script` | Auth + Approved | Run the full pipeline. Requires an owned `folderId`. 422 with `errors[]` on DSL failure. Writes history, an activity log, and (for key auth) a usage row |
| POST | `/inspect-dom` | Auth + Approved | Crawl a URL and return its interactive element candidates. No records written |
| POST | `/run-test` | Auth + Approved | Execute a script. 403 with `violations[]` if the sanitizer rejects it. Returns logs, duration, and a signed video URL |

## Scenario Library — `/api/v1/history`, `/api/v1/folders`

| Method | Path | Auth | Description |
| :-: | :-- | :-- | :-- |
| GET | `/history` | Auth + Approved | The caller's records as summaries. Optional `?folderId=<id>` or `?folderId=none` |
| GET | `/history/:id` | Auth + Approved, owner or admin | Full record; the video path is re-signed on read |
| PATCH | `/history/:id/folder` | Auth + Approved, owner or admin | Move to a folder, or `null` for uncategorized |
| DELETE | `/history/:id` | Auth + Approved, owner or admin | Delete the record and its video |
| GET | `/folders` | Auth + Approved | The caller's folders with scenario counts, plus an uncategorized count |
| POST | `/folders` | Auth + Approved | Create. 409 on a duplicate name |
| PATCH | `/folders/:id` | Auth + Approved, owner or admin | Rename or re-describe. 409 on a duplicate name |
| DELETE | `/folders/:id` | Auth + Approved, owner or admin | Delete; scenarios inside become uncategorized |

## API Keys — `/api/v1/api-keys`

Every endpoint here is **Auth + Approved + JWT only**.

| Method | Path | Description |
| :-: | :-- | :-- |
| GET | `/` | The caller's keys, each with a usage summary for the current window |
| POST | `/` | Create a key. Returns the raw secret **once**. 201. Duplicate names rejected |
| DELETE | `/:id` | Revoke — the key stops authenticating, the record remains |
| DELETE | `/:id/delete` | Hard delete; usage logs are relabelled and retained |

## Configuration — `/api/v1/config`

| Method | Path | Auth | Description |
| :-: | :-- | :-- | :-- |
| GET | `/` | **Auth** (approval *not* checked) | The shared sample-scenario configuration |
| POST | `/` | Admin | Replace it. 400 if the suite, URL, or steps array is missing or malformed |

## Feedback — `/api/v1/feedback`

| Method | Path | Auth | Description |
| :-: | :-- | :-- | :-- |
| POST | `/` | **Public** | Submit feedback with an optional base64 image. 400 on a bad extension or an oversized file |

## Recorder — `/api/v1/recorder`

| Method | Path | Auth | Description |
| :-: | :-- | :-- | :-- |
| GET | `/proxy?url=` | Auth + Approved (accepts `?token=`) | SSRF-guarded reverse proxy that injects the recorder agent |
| OPTIONS | `/ingest` | Public | CORS preflight |
| POST | `/ingest` | **Public** | Buffer a captured step. Strict validation and hard caps. *Unreachable from the current UI* |
| GET | `/session/:sessionId/steps` | Auth + Approved | Poll a session's buffer. *Unused by the current UI* |
| DELETE | `/session/:sessionId` | Auth + Approved | Discard a session's buffer. *Unused by the current UI* |

## Administration — `/api/v1/admin`

Every endpoint here is **Admin**.

| Method | Path | Description |
| :-: | :-- | :-- |
| GET | `/users` | Every account, oldest first, without password hashes |
| POST | `/users/:id/approve` | Set status `approved`. 404 if unknown |
| POST | `/users/:id/reject` | Set status `rejected`. 404 if unknown |
| DELETE | `/users/:id` | Delete the account, cascading to folders, history, and keys |
| GET | `/logs?limit=` | Activity log, newest first. Default limit 200 |
| GET | `/feedbacks?page=&limit=` | Paginated feedback with signed attachment URLs and a total count. Defaults page 1, limit 10 |
| DELETE | `/feedbacks/:id` | Delete the record and its attachment |
| GET | `/api-keys/stats` | System-wide usage totals for the current window |
| GET | `/api-keys/logs?page=&limit=` | System-wide usage log, newest first. Default limit 15 |

## Non-API routes

| Method | Path | Auth | Description |
| :-: | :-- | :-- | :-- |
| GET | `/` | Public | The workspace single-page application |
| GET | `/admin` | Public (the page); the client immediately enforces admin | The admin console page |
| GET | `/feedbacks/attachments/:filename` | Admin (accepts `?token=`) | Signs and redirects to a feedback attachment; falls back to a public URL if signing fails |
| GET | `/css/*`, `/js/*`, `/favicon.jpg` | Public | Static assets |
| *any* | *(unmatched)* | Public | Asset-proxy middleware — forwards to the origin currently being recorded, when one can be attributed; otherwise falls through to 404 |

---

## Cross-cutting behaviour

| Concern | Behaviour |
| :-- | :-- |
| Request size | 10 MB JSON limit |
| Error shape | `{ success: false, error: "…" }`; DSL failures add `errors[]`, sanitizer rejections add `violations[]` |
| Rate limiting | **None anywhere** — including on login, registration, feedback, and the recorder ingest endpoint |
| CORS | Not configured globally; opened to `*` only on the recorder ingest and proxy responses |
| Concurrency | Generation and execution pass through separate in-memory queues (5 and 3 by default) |
| Logging | Every meaningful action writes an activity-log row; API-key-authenticated generation and execution additionally write a usage row |
| Auth failures | Always 401 with a message distinguishing an invalid key, an expired session, and a missing credential |
| Ownership failures | 403 with an explicit message; admins bypass ownership on history and folders |

### Observations worth acting on

- **No rate limiting exists.** Login and registration are brute-forceable, and the public feedback and
  recorder-ingest endpoints are open to abuse bounded only by their size caps.
- **`GET /api/v1/config` does not check approval status**, unlike every other authenticated endpoint.
  Currently harmless — a pending account cannot obtain a token — but it is an inconsistency in the
  gate.
- **The attachment redirect falls back to a public URL** if signing fails. Since the bucket is
  private that fallback yields a non-working link rather than a leak, but the intent reads as though a
  public URL were expected — worth removing.
- **The recorder ingest and session endpoints are unreachable** from the product; see
  [Page 14](../pages/14-api-recorder-and-proxy.md).
