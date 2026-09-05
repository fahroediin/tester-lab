# Tester Lab — Product Requirements Document

> **Source:** reverse-engineered from the `rotom-qa` repository (npm package `tester-lab`, v1.0.0)
> **Generated:** 2026-09-04
> **Stack:** Express 4 + TypeScript (backend) · Vanilla JS / HTML / CSS (frontend) · Supabase Postgres + Storage · Playwright (execution engine) · Commander CLI

---

## System Overview

Tester Lab turns a plain-language description of a business flow into a runnable end-to-end test
script — **without using an LLM**. A user describes what a tester would do ("fill Username with
`student`", "click Sign In", "check the URL becomes `/dashboard`"), and the system opens the target
website in a headless browser, looks at the real page, decides which on-screen element each described
step refers to, and emits a finished test file for Playwright, Cypress, Selenium (Python), or Robot
Framework.

The element-matching decision is made by a fixed, published scoring matrix rather than a model, so the
same business description against the same page always produces the same script. Nothing about the
customer's page — its structure, its field names, its data — is sent to a third party. Runs are fast
(local, in-memory matching) and cost nothing per generation.

Around that engine sits a small multi-user product: accounts require admin approval, scenarios are
organised into per-user project folders, every generation and execution is recorded in a history with
a video replay of the run, users can mint API keys to drive the same pipeline from CI, and an admin
console covers approvals, audit logs, user feedback, sample-scenario configuration, and API usage
statistics.

**Primary users**

| User | What they do |
| :-- | :-- |
| **QA engineer / manual tester** (`user`) | Builds scenarios in the web workspace or records them by clicking through the target site; generates, runs, reviews, and re-runs scripts. |
| **Automation / platform engineer** (`user`) | Uses API keys or the CLI to generate and execute scripts from a pipeline. |
| **Administrator** (`admin`) | Approves accounts, watches the audit log, triages feedback, configures the shared sample scenario, monitors API-key usage. |

---

## Module Overview

| Module | Pages / surfaces | Core functionality |
| :-- | :-- | :-- |
| **Access & Identity** | Sign In / Request Access | Registration (pending by default), login, JWT session, admin approval gate |
| **Scenario Authoring** | Scenario Builder, Interaction Recorder, Create Folder | Compose or record DSL steps, import/export flows, generate scripts, run them, watch the recording |
| **Scenario Library** | Flow History (folder tree + table + detail) | Browse, search, sort, paginate, re-open, move between folders, delete past scenarios and runs |
| **Developer Integration** | API Keys (workspace), Quick Integration Guide | Mint / revoke / delete API keys, see per-key monthly usage, copy ready-made cURL snippets |
| **Administration** | Admin Console (5 tabs) | User approvals, activity audit log, feedback triage, sample-scenario config, API-key usage stats & logs |
| **Feedback** | Floating Feedback modal | Report functional / defect / cosmetic issues with an optional screenshot |
| **Generation Engine (headless)** | REST API + CLI + library | Validate DSL → crawl DOM → score & match → transpile → dry-run & self-heal |

---

## Page Inventory

| # | Page / surface | Route | Module | Access | Doc |
| :-: | :-- | :-- | :-- | :-- | :-- |
| 1 | Sign In / Request Access | `/` (unauthenticated view) | Access & Identity | Public | [→](./pages/01-auth-sign-in-register.md) |
| 2 | Scenario Builder | `/` → tab `builder` | Scenario Authoring | Approved user | [→](./pages/02-workspace-scenario-builder.md) |
| 3 | Interaction Recorder | modal on Scenario Builder | Scenario Authoring | Approved user | [→](./pages/03-interaction-recorder.md) |
| 4 | Flow History | `/` → tab `history` | Scenario Library | Approved user | [→](./pages/04-workspace-flow-history.md) |
| 5 | API Keys (workspace) | `/` → tab `apikeys` | Developer Integration | Approved non-admin user | [→](./pages/05-workspace-api-keys.md) |
| 6 | Feedback | modal, workspace page | Feedback | Any visitor\* | [→](./pages/06-feedback-modal.md) |
| 7 | Admin — User Management | `/admin` → tab `users` | Administration | Admin | [→](./pages/07-admin-user-management.md) |
| 8 | Admin — Activity Logs | `/admin` → tab `logs` | Administration | Admin | [→](./pages/08-admin-activity-logs.md) |
| 9 | Admin — Feedbacks | `/admin` → tab `feedbacks` | Administration | Admin | [→](./pages/09-admin-feedbacks.md) |
| 10 | Admin — System Configuration | `/admin` → tab `config` | Administration | Admin | [→](./pages/10-admin-system-configuration.md) |
| 11 | Admin — API Keys & Usage | `/admin` → tab `apikeys` | Administration | Admin | [→](./pages/11-admin-api-keys.md) |
| 12 | Generation & Execution API | `/api/v1/generate-script`, `/inspect-dom`, `/run-test` | Engine | JWT or API key | [→](./pages/12-api-generation-and-execution.md) |
| 13 | Scenario Library API | `/api/v1/history`, `/api/v1/folders` | Scenario Library | JWT or API key | [→](./pages/13-api-scenario-library.md) |
| 14 | Recorder API & Proxy | `/api/v1/recorder/*` | Scenario Authoring | Mixed | [→](./pages/14-api-recorder-and-proxy.md) |
| 15 | CLI & Library API | `test-gen` binary, `TestScriptGenerator` | Engine | Local process | [→](./pages/15-cli-and-library.md) |

\* The feedback button is rendered on the workspace page; the submit endpoint itself is unauthenticated.

**Appendices**

- [Enum Dictionary](./appendix/enum-dictionary.md) — every status, action, framework, score, and limit
- [Data Model](./appendix/data-model.md) — tables, columns, constraints, storage buckets
- [API Inventory](./appendix/api-inventory.md) — complete endpoint reference with auth matrix
- [Page Relationships](./appendix/page-relationships.md) — navigation and data-coupling map

---

## Global Notes

### Permission model

Three gates stack on top of each other:

1. **Authenticated** — the caller presents a JWT bearer token (7-day life), an API key
   (`tl_live_…`, sent as `X-API-Key` or as a bearer token), or a `?token=` query parameter (used
   only for embedding video/iframe content that a browser fetches without headers).
2. **Approved** — the account's status must be `approved`. `pending` and `rejected` accounts get no
   further than login, which is refused with an explanatory message.
3. **Admin** — role must be `admin`.

A fourth, narrower gate exists: **JWT-only**. API-key management endpoints deliberately refuse
API-key authentication, so a leaked key cannot mint more keys.

The very first admin account is created from environment variables at server start-up and is
re-synced (username, email, password, `approved` status) on every boot.

### Common interaction patterns

- **Destructive actions always confirm.** Deleting a user, a scenario, a folder, a feedback record,
  or revoking/deleting an API key all raise a SweetAlert confirmation dialog first.
- **Feedback is a snackbar.** Success or failure of every action surfaces as a toast
  (`success` / `error` / `warning` / `info`), auto-dismissed after 3.5 seconds.
- **Lists default to newest first.** History, activity logs, feedbacks, API keys, and API-key usage
  logs are all ordered by timestamp descending.
- **Editing a scenario invalidates its output.** Changing any builder field or step clears the
  generated code, the matching table, the terminal output, and the video, and disables Copy /
  Download / Run. The user must generate again.
- **Long jobs are queued, not rejected.** Script generation and test execution each pass through an
  in-memory concurrency queue (5 and 3 slots respectively by default) so a burst of requests waits
  rather than exhausting the server's browser processes.
- **Media is never public.** Test videos and feedback attachments live in private storage buckets and
  are served only through short-lived (1 hour) signed URLs, re-signed each time they are read.
- **Submitted code is scanned before it runs.** Any script sent to `/run-test` — or produced for a
  dry run — is checked against a blocklist (filesystem, process, `eval`, non-Playwright imports) and
  rejected outright if it matches.
- **Theme is remembered per browser.** A light/dark toggle stores the choice in `localStorage`; the
  default follows the operating-system preference.

### Known gaps flagged during analysis

| Gap | Where | Detail |
| :-- | :-- | :-- |
| Recorder HTTP ingest path is unreachable from the UI | [Page 14](./pages/14-api-recorder-and-proxy.md) | The recorder agent only POSTs to `/recorder/ingest` when it receives a `session` id; the workspace never supplies one, so captured steps travel exclusively over `postMessage` / `BroadcastChannel`. The `ingest` and `session/:id/steps` endpoints are currently dead code paths. |
| Folder-name uniqueness is case-sensitive despite the comment | [Data Model](./appendix/data-model.md) | `uq_folders_user_name` is a plain `UNIQUE (user_id, name)`; the SQL comment claims case-insensitivity, which the constraint does not deliver. API-key names, by contrast, *are* compared case-insensitively in application code. |
| Workspace API Keys tab is hidden from admins | [Page 5](./pages/05-workspace-api-keys.md) | Admins manage their own keys in the Admin Console instead — but that console tab also shows only the admin's own keys, not everyone's. |
| Admin feedback list is capped at 1000 | [Page 9](./pages/09-admin-feedbacks.md) | The console requests `?limit=1000` and paginates in the browser; beyond 1000 records, older feedback becomes unreachable in the UI. |
| Mixed-language UI copy | [Page 2](./pages/02-workspace-scenario-builder.md) | The inline code-edit hint and the step drag-handle tooltip are in Indonesian; everything else is English. |
