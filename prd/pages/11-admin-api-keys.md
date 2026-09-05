# Admin — API Keys & Usage

> **Route:** `/admin` → tab **API Keys**, with two sub-tabs
> **Module:** Administration
> **Access:** Admin only (the page); the key list itself is scoped to the signed-in admin
> **Source:** `public/admin.html`, `src/server/routes/api-key-routes.ts`, `src/server/api-key-admin-store.ts`

## Overview

Two jobs share this tab. **API Keys Management** is the administrator's own key wallet — identical in
behaviour to the [workspace API Keys tab](./05-workspace-api-keys.md), which is hidden for admins.
**Hit & Usage Activity Logs** is the genuinely administrative half: a system-wide dashboard of how the
API is being used, across every key and every user.

## Layout

A sub-tab bar with two pill buttons, then one of two panes:

**Sub-tab 1 — API Keys Management**
- *Admin Developer API Keys* card: **+ Generate New Key**, the one-time new-key banner, and the keys
  table.
- *Quick Integration Guide* card: the same two copyable cURL snippets as the workspace tab.

**Sub-tab 2 — Hit & Usage Activity Logs**
- Four aggregate stat cards.
- *API Key Hit & Usage Activity Logs* card with a **Refresh Logs** button, the log table, and
  server-side pagination.

## Fields

### Sub-tab 1: Keys table

Identical columns and actions to the workspace tab — Key Name, API Key Token (masked, copyable),
Usage (Monthly), Created, Last Used, Status, Action (**Revoke** while active, **Delete** once
revoked). See [Page 5](./05-workspace-api-keys.md) for the full field and interaction detail.

### Sub-tab 2: Aggregate stat cards

| Card | Value | Subtext |
| :-- | :-- | :-- |
| Total Hits (Monthly) | All usage events in the current window | *"N-day reset window"*, filled from the server |
| Code Generated (blue) | Events with status `generated` | `/api/v1/generate-script` |
| Successful Runs (green) | Events with status `success` | Passed test executions |
| Failed Hits (red) | Events with status `failed` | Errors and test failures |

Numbers are locale-formatted with thousands separators.

### Sub-tab 2: Usage log table

| Column | Format | Notes |
| :-- | :-- | :-- |
| Timestamp | Locale date-time | Newest first |
| API Key Name | Bold text | Resolved live; see the naming rules below |
| User | Monospace username | Falls back to the raw user id if the account is gone |
| Endpoint | Monospace chip | `generate-script` or `run-test` |
| Status | Badge | `GENERATED` (blue) · `SUCCESS` (green) · `FAILED` (red) |
| Details | Wrapping text, up to 320 px | The reason or outcome recorded with the event |

**How a key name is resolved:**

| Situation | Displayed as |
| :-- | :-- |
| The key still exists | Its current name |
| The key was deleted but its name was preserved on the row | *"<name> (Deleted)"* |
| A key reference with no recoverable name | *Deleted API Key* |
| The event has no key at all | *Direct API* |

15 rows per page, paginated **server-side**, with Previous / Next and a *"Page X of Y"* label.

## Interactions

### Opening the tab

Selecting **API Keys** loads the admin's own keys and shows sub-tab 1. Sub-tab 2 is not loaded until
it is selected.

### Switching to Hit & Usage Activity Logs

Fetches the aggregate stats and the first page of logs together. **Refresh Logs** re-fetches both, so
the stat cards never drift from the rows beneath them. Paging also re-queries the server.

### Key lifecycle (sub-tab 1)

Generate, copy, revoke, and delete behave exactly as on the
[workspace API Keys page](./05-workspace-api-keys.md), including the create-time uniqueness check on
the key name, the show-once secret, and the preservation of usage history when a key record is
deleted.

## API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| List own keys | GET | `/api/v1/api-keys` | Tab open | **Scoped to the admin's own keys** |
| Create / revoke / delete key | POST, DELETE | `/api/v1/api-keys[...]` | Key actions | JWT-only |
| Aggregate stats | GET | `/api/v1/admin/api-keys/stats` | Sub-tab 2 open, Refresh | System-wide, current window |
| Usage logs | GET | `/api/v1/admin/api-keys/logs?page=&limit=` | Sub-tab 2 open, Refresh, paging | System-wide, newest first, 15 per page |

## Page Relationships

- **From:** the Admin Console tab bar.
- **To:** nowhere; both sub-tabs are terminal.
- **Data coupling:** every API-key-authenticated call to `generate-script` or `run-test` writes a
  usage row that appears here and in that key owner's Usage column.

## Business Rules

- **The stat cards and the log table cover different spans.** The stats are limited to the current
  rolling window (30 days by default); the log table is **not** — it pages through the entire usage
  history, oldest rows included. A "no logs in the current period" empty state is shown when the table
  comes back empty, which slightly misstates what the table actually queries.
- **Usage is recorded only for API-key traffic.** Requests authenticated with a browser session write
  activity-log entries but no usage rows, so this dashboard measures programmatic integration only —
  by design, since it exists to watch API consumers.
- **Three statuses, two endpoints.** `generate-script` records `generated` on success and `failed`
  otherwise; `run-test` records `success` or `failed`, and `failed` also covers code rejected by the
  sanitizer.
- **Persistence degrades gracefully.** If the database write for a usage event fails, the event is
  still held in a capped in-memory buffer (5000 entries) and the stats and log queries fall back to it,
  so a database hiccup does not blank the dashboard — but the buffer does not survive a restart.
- **The tab does not manage other users' keys.** Despite sitting in the admin console, sub-tab 1 lists
  only the signed-in admin's keys. There is no screen anywhere for revoking another user's key; the
  only lever is deleting or rejecting the user, which invalidates their keys indirectly.
