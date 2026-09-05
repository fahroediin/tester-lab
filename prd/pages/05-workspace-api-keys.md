# API Keys (Workspace)

> **Route:** `/` → navigation tab **API Keys**
> **Module:** Developer Integration
> **Access:** Authenticated, approved, **non-admin** account, and only over a web session (JWT), never via an API key
> **Source:** `public/index.html` (`#tabApiKeys`), `public/js/app.js`, `src/server/routes/api-key-routes.ts`

## Overview

Where a user mints the credentials that let a pipeline, script, or CLI drive Tester Lab without a
browser. Keys are listed with their masked token, their usage for the current period, and their
status; the full secret is shown exactly once, at creation. A second card carries copy-ready cURL
examples for the two endpoints that matter.

The tab is **hidden for administrators**, who manage their own keys in the
[Admin Console](./11-admin-api-keys.md) instead.

## Layout

Two stacked full-width cards:

1. **Developer API Keys** — header with a one-line explanation and **+ Generate New Key**; a
   green "new key" banner that appears only right after creation; the keys table.
2. **Quick Integration Guide** — a note about the accepted auth headers plus two copyable snippets.

## Fields

### Region: Keys table

| Column | Format | Notes |
| :-- | :-- | :-- |
| Key Name | Bold text | The user-supplied label |
| API Key Token | Monospace chip plus a copy button | Masked as `tl_live_xxxxxxx...abcd` |
| Usage (Monthly) | Total, then a breakdown | `N gen` (blue) · `N pass` (green) · `N fail` (red) |
| Created | Locale date | |
| Last Used | Locale date-time, or *Never* | Updated on every authenticated API-key request |
| Status | Pill | `ACTIVE` (green) or `REVOKED` (red) |
| Action | Button | **Revoke** while active; **Delete** once revoked |

Empty state: *"No API keys generated yet. Click '+ Generate New Key' above."*

### Region: New key banner

Appears only immediately after a key is created. Contains the warning *"Please copy this key now. For
your security, you will not be able to view it again."*, a read-only input holding the full secret,
and a copy button.

### Region: Quick Integration Guide

| Snippet | Endpoint | Contents |
| :-- | :-- | :-- |
| Generate Playwright Test Script | `POST /api/v1/generate-script` | A cURL call with an `X-API-Key` header and a three-step login DSL against a public practice site |
| Execute Test Script on Server | `POST /api/v1/run-test` | A cURL call posting inline Playwright code with `language` and `mode` |

Both have a copy button. The header note states that the key goes in either `X-API-Key` or
`Authorization: Bearer <key>`.

**Note:** the snippets hard-code a production hostname (`https://tester-lab.mibot.my.id`) rather than
deriving it from the current origin, so they are wrong for any other deployment.

## Interactions

### Opening the tab

Fetches the user's keys with their usage summaries and renders the table. Nothing is paginated — the
full list is shown.

### Generate a new key

- **Trigger:** **+ Generate New Key**.
- **Prompt:** an input dialog asking for a *API Key Name / Description* (placeholder *"e.g. CI/CD
  Pipeline, Staging Automation"*).
- **Client validation:** the name must not be blank, and must not duplicate an existing key's name
  (case-insensitive) — *"An API key named "X" already exists. Please choose a unique name."* The
  server enforces the same rule independently.
- **On success:** the full secret is written into the banner, cached in browser storage so the table's
  copy button can still reproduce it during this browser's lifetime, the table reloads, and a success
  toast appears. An `API Key Created` entry is written to the activity log.

### Copy a key

- **From the banner:** copies the full secret.
- **From the table:** copies the cached full secret if this browser created the key. If only the
  masked prefix is available — a key created on another device, in another browser, or before this
  caching existed — the masked value is copied and a warning explains: *"This older key only has the
  prefix saved. Please generate a new key to copy in full."*

### Revoke a key

- **Trigger:** **Revoke** on an active key.
- **Confirmation:** *"Any automation script or integration using this key will immediately stop
  working."*
- **On confirm:** the key's status becomes `REVOKED` with a revocation timestamp; it stops
  authenticating on the very next request. The row stays, now offering **Delete**. Logged as
  `API Key Revoked`.

### Delete a key record

- **Trigger:** **Delete** on a revoked key.
- **Confirmation:** *"Permanently remove this revoked key record?"*
- **On confirm:** the record is removed, but its **usage history is preserved** — before deletion the
  key's name is copied onto its usage-log rows and the foreign key is cleared, so the admin usage log
  still shows what that key did, labelled *"<name> (Deleted)"*. Logged as `API Key Deleted`.

## API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| List keys | GET | `/api/v1/api-keys` | Tab open, after any mutation | Returns each key with its usage summary for the current period |
| Create key | POST | `/api/v1/api-keys` | Generate New Key | Returns the raw key **once**; 201 Created |
| Revoke key | DELETE | `/api/v1/api-keys/:id` | Revoke | Sets status to revoked |
| Delete key | DELETE | `/api/v1/api-keys/:id/delete` | Delete | Hard delete, usage logs retained |

All four require a JWT session; an API key presented to these endpoints is rejected with *"This
operation requires a standard Web UI session token."*

## Page Relationships

- **From:** the workspace navigation bar (hidden for admins).
- **To:** nowhere — this tab is terminal. The generated key is used against
  [the generation and execution API](./12-api-generation-and-execution.md).
- **Data coupling:** every API-key-authenticated call to `generate-script` or `run-test` writes a
  usage row, which changes the Usage column here and feeds the
  [admin usage dashboard](./11-admin-api-keys.md).

## Business Rules

- **The secret is never stored.** Only a SHA-256 hash and a masked prefix
  (`tl_live_` + 8 characters + `...` + last 4) are persisted. There is no "show key again" path; a
  lost key must be replaced.
- **Keys are 32 random bytes** rendered as hex behind the `tl_live_` prefix.
- **A key inherits its owner's standing.** Validation refuses the key if the owning account is not
  `approved`, so suspending a user immediately disables every key they hold.
- **A key cannot mint keys.** Key management is JWT-only by design.
- **Usage is a rolling window, not a calendar month.** Counts cover the last N days (30 by default,
  configurable); the label says "Monthly" but the window slides.
- **Revoke and delete are different intents.** Revoking stops the key while keeping the record
  visible; deleting removes the record but never the audit trail of what it did.
