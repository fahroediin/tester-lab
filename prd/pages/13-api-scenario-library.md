# Scenario Library API

> **Endpoints:** `/api/v1/history` · `/api/v1/history/:id` · `/api/v1/history/:id/folder` · `/api/v1/folders` · `/api/v1/folders/:id`
> **Module:** Scenario Library
> **Access:** Authenticated (JWT or API key) **and** approved; ownership-checked per record
> **Source:** `src/server/routes/history-routes.ts`, `src/server/routes/folder-routes.ts`, `src/server/flow-history-store.ts`, `src/server/folder-store.ts`

## Overview

The persistence layer behind [Flow History](./04-workspace-flow-history.md): the record of every
generated scenario and every execution, plus the per-user folders that organise them. Records are
written by the generation and execution endpoints and read, moved, or deleted here.

## Resource: Flow History

A history record is created when a script is generated, and updated as it is run.

| Field | Type | Written when |
| :-- | :-- | :-- |
| `id` | UUID | Generation |
| `userId`, `username` | string | Generation — username is denormalised so it survives account deletion |
| `folderId` | UUID or null | Generation; changed by a move; cleared when the folder is deleted |
| `timestamp` | ISO date-time | Generation |
| `testSuite`, `targetUrl` | string | Generation |
| `status` | enum | `GENERATED` → `RUNNING` → `SUCCESS` or `FAILED` |
| `generatedCode` | string | Generation, then overwritten with the exact code each run executes |
| `resolvedSteps` | JSON array | Generation |
| `rawDsl` | JSON | Generation — enables structural re-editing later |
| `videoUrl` | string | After a run that produced a recording: a durable bucket path, never a signed URL |
| `runLogs`, `durationMs` | string / integer | After a run |

### GET /api/v1/history

Returns the caller's records, newest first, as **summaries only** — id, folder, timestamp, suite,
target URL, status, duration, and a `hasVideo` boolean. Code, steps, and logs are deliberately
omitted so the list stays light.

Optional `?folderId=<id>` filters to one folder, and `?folderId=none` to uncategorized records. The
web UI does not use this parameter, filtering client-side instead.

### GET /api/v1/history/:id

Returns the full record. The stored video path is exchanged for a fresh one-hour signed URL at read
time, so playback links are always valid and never durable.

| Condition | HTTP |
| :-- | :-: |
| No such record | 404 |
| Record belongs to someone else (and the caller is not an admin) | 403 |

### PATCH /api/v1/history/:id/folder

Body: `folderId` — a string to move the scenario into that folder, or `null` to make it
uncategorized. The target folder must exist and belong to the caller (admins are exempt). Returns
*"Scenario moved successfully"*.

| Condition | HTTP | Message |
| :-- | :-: | :-- |
| Record not found | 404 | *History record not found* |
| Not the owner | 403 | *Unauthorized to modify this record* |
| `folderId` is neither a string nor null | 400 | *folderId must be a string or null* |
| Folder unknown or not the caller's | 400 | *Invalid folder* |

### DELETE /api/v1/history/:id

Deletes the record **and** its video object from storage (with a legacy fallback that removes an old
local file if one exists). Ownership is checked exactly as for reads. A storage failure is logged as a
warning and does not block the database deletion.

## Resource: Folders

A folder is a per-user project grouping. Fields: `id`, `userId`, `name`, `description`, `createdAt`.

### GET /api/v1/folders

Returns the caller's folders, oldest first, each carrying a `scenarioCount`, plus a top-level
`uncategorizedCount`. Counts are computed by reading the caller's full history and tallying in
application code rather than by a grouped query — correct, but it does read every record on each call.

### POST /api/v1/folders

| Field | Type | Required | Validation |
| :-- | :-- | :-: | :-- |
| `name` | string | Yes | Trimmed; must be non-empty and at most 120 characters |
| `description` | string | No | Trimmed and truncated to 500 characters |

| Condition | HTTP | Message |
| :-- | :-: | :-- |
| Name missing, blank, or too long | 400 | *Folder name is required (max 120 characters)* |
| Name already used by this user | 409 | *A folder with this name already exists* |

Writes a `Create Folder` activity-log entry.

### PATCH /api/v1/folders/:id

Updates `name` and/or `description` with the same validation and the same duplicate rule. Ownership is
checked (404 if unknown, 403 if someone else's; admins exempt).

### DELETE /api/v1/folders/:id

Deletes the folder. **Scenarios inside are not deleted** — the database clears their folder reference,
so they become uncategorized. The response says so explicitly: *"Folder deleted. Scenarios inside are
now uncategorized."* Writes a `Delete Folder` activity-log entry.

## Business Rules

- **Ownership is enforced on every single-record operation**, and admins are the only exception —
  they may read, move, and delete any user's scenarios and folders.
- **The list endpoint is scoped, not filtered.** It queries by user id, so an admin calling it sees
  only their own records; there is no "all users' scenarios" view anywhere in the product.
- **Deleting work requires deleting the record, never the container.** This is a database-level
  guarantee, not a UI convention.
- **Video references are stored as durable paths, not URLs.** Signed URLs are minted on read and
  expire in an hour, so a leaked API response cannot be replayed indefinitely and stored links never
  go stale.
- **Re-running a scenario from history forks it.** The execution endpoint creates a new record in the
  same folder rather than overwriting the original, preserving the evidence of every run. A
  freshly-generated scenario, by contrast, is updated in place as it runs.
- **Duplicate folder names are rejected case-sensitively.** The unique constraint is on the raw name
  despite a schema comment claiming case-insensitivity, so *Project Alpha* and *project alpha* can
  coexist. See the [Data Model](../appendix/data-model.md).
- **Deleting a user removes their folders and history**, by database cascade — but not their stored
  videos, which are only removed when a history record is deleted individually.

## Consumers

| Consumer | Usage |
| :-- | :-- |
| [Flow History](./04-workspace-flow-history.md) | Every operation on this page |
| [Scenario Builder](./02-workspace-scenario-builder.md) | Folder list and folder creation |
| [Generation API](./12-api-generation-and-execution.md) | Validates the folder, then writes and updates records |
