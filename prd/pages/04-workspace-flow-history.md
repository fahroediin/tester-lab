# Flow History

> **Route:** `/` → navigation tab **Flow History**
> **Module:** Scenario Library
> **Access:** Authenticated, approved account (own records only)
> **Source:** `public/index.html` (`#tabHistory`), `public/js/app.js`, `src/server/routes/history-routes.ts`, `src/server/routes/folder-routes.ts`

## Overview

Every script the user generates, and every time one is run, is recorded here. The tab is both an
archive and a re-entry point: scenarios are grouped into project folders, searchable and sortable, and
any record can be opened to inspect its code, its per-step matching scores, and the video of its last
execution — or loaded straight back into the builder to be re-run.

## Layout

Single full-width card:

1. **Header** — title, a free-text search box, and a **Refresh** button.
2. **Folder tree** — a bordered, collapsible list: *All scenarios*, then each of the user's folders,
   then *Uncategorized* if any records lack a folder.
3. **Scenario table** — five columns with sortable headers.
4. **Pagination footer** — a "Showing X to Y of Z entries" counter and Previous / Next.

Opening a record raises the **Flow History Details** modal.

## Fields

### Region: Folder tree

| Row | Count badge | Expandable | Row actions |
| :-- | :-- | :-- | :-- |
| **All scenarios** | Total records | No | — |
| *Each folder* | Records in that folder | Yes, when the count is above zero | **Rename**, **Delete** |
| **Uncategorized** (italic, only shown when non-empty) | Records with no folder | Yes | — |

Expanding a folder lists its scenarios inline, each row showing the suite name, the date, a
**Move to…** dropdown, and a **View** button.

### Region: Scenario table

| Column | Format | Sortable | Notes |
| :-- | :-- | :-: | :-- |
| Date & Time | Locale date-time, monospace | Yes | Default sort, descending |
| Test Suite | Plain text | Yes | |
| Target URL | Monospace, wraps on long URLs | Yes | |
| Status | Coloured pill | Yes | `GENERATED` · `RUNNING` · `SUCCESS` · `FAILED` |
| Action | Buttons | No | **View**, **Delete** (delete is styled in the warning colour) |

### Region: Search and pagination

| Control | Behaviour |
| :-- | :-- |
| Search box | Case-insensitive substring match across suite name, target URL, and status; filters as you type and resets to page 1 |
| Column header | First click sorts (descending for date, ascending for the others), second click reverses; an arrow marks the active column |
| Previous / Next | Steps through pages of **10 records**; disabled at the ends |

### Region: Flow History Details modal

| Section | Content |
| :-- | :-- |
| Execution Recording | HTML5 video player; the whole section is hidden when the record has no video |
| Details grid | Test Suite · Target URL · Date · Status pill, plus a **Load to Builder** button |
| Generated Playwright Code | Read-only console showing the stored code |
| Resolved Steps & Matching Scores | Table of Step / Action / Matched Selector / Score, scores at 80 or above in green, below in red |

## Interactions

### Opening the tab

Fetches the full history list for the current user, resets to page 1, then refreshes the folder list
and renders both the tree and the table. The list endpoint deliberately strips the heavy fields —
code, resolved steps, and logs — and returns only a summary plus a `hasVideo` flag, so a large archive
loads quickly.

**Note:** filtering, sorting, and pagination all happen in the browser over the full list. This is
fine for hundreds of records and will need revisiting for thousands.

### Selecting a folder

Clicking any tree row sets the filter — *All scenarios* clears it, a folder restricts to that folder,
*Uncategorized* restricts to records with no folder — resets to page 1, and re-renders both the tree
(to highlight the active row) and the table. The caret toggles the inline scenario list independently
of the filter.

### Creating a folder

Folders are created from the [Scenario Builder](./02-workspace-scenario-builder.md) via **+ New
Folder** (name up to 120 characters, optional description up to 500). A duplicate name for the same
user is rejected with *"A folder with this name already exists"*.

### Renaming a folder

- **Trigger:** **Rename** on a folder row.
- **Behaviour:** an input dialog pre-filled with the current name; an empty name is rejected inline.
- **On confirm:** `PATCH /api/v1/folders/:id`, then the folder list, tree, and table refresh.
- **Duplicate name:** an error toast with the server message.

### Deleting a folder

- **Trigger:** **Delete** on a folder row.
- **Confirmation:** a warning dialog naming the folder and, when it is non-empty, stating explicitly
  that *"The N scenario(s) inside will become uncategorized, not deleted."*
- **On confirm:** `DELETE /api/v1/folders/:id`. The affected scenarios move to *Uncategorized* both in
  the database (the foreign key is cleared, not cascaded) and in the local view; if the deleted folder
  was the active filter, the filter resets to *All scenarios*.

### Moving a scenario between folders

- **Trigger:** the **Move to…** dropdown on an inline scenario row.
- **Options:** every folder the user owns (the current one disabled), plus *Uncategorized* when the
  scenario currently has a folder.
- **Behaviour:** `PATCH /api/v1/history/:id/folder`; on success the local record is updated, the tree
  and table re-render, and a *Moved* toast appears.

### Viewing a record

- **Trigger:** **View**, from either the table or an inline folder row.
- **Behaviour:** `GET /api/v1/history/:id` returns the full record. Any stored video path is re-signed
  into a fresh one-hour playback URL at read time, so links never expire in storage and are never
  persisted in a shareable form.
- **Display:** the modal populates the details grid, the code console, the resolved-steps table, and
  the video player (hidden when there is no recording).
- **Closing** pauses the video.

### Load to Builder

- **Trigger:** **Load to Builder** inside the details modal.
- **Behaviour:** copies suite name, target URL, framework, language, and steps back into the builder.
  Steps come from the stored raw DSL; for older records that predate DSL storage, the code is
  reverse-parsed instead. The scenario's folder is re-selected if it still exists. The code is loaded
  into the editable console, the status chip reads *Loaded from History*, and Copy / Download / Run
  are enabled.
- **Replay marking:** the scenario is flagged as a replay, so the next run is saved as a **new**
  history record rather than overwriting the loaded one — a re-run never destroys the evidence of the
  original run.
- **Then:** the modal closes, the app switches to the Builder tab, and a success toast confirms.

### Deleting a record

- **Trigger:** **Delete** in the table.
- **Confirmation:** *"Are you sure you want to delete this flow history? This will also delete any
  associated videos."*
- **On confirm:** `DELETE /api/v1/history/:id` removes the record and the stored video object (plus,
  for legacy records, any local video file), then the list reloads.

## API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| History list | GET | `/api/v1/history` | Tab open, Refresh, after delete | Summary fields only; optional `?folderId=` filter exists but the UI filters client-side |
| History detail | GET | `/api/v1/history/:id` | View | Owner or admin only; video URL re-signed |
| Move scenario | PATCH | `/api/v1/history/:id/folder` | Move to… | `null` moves it to uncategorized |
| Delete record | DELETE | `/api/v1/history/:id` | Delete | Also deletes the video object |
| Folder list | GET | `/api/v1/folders` | Tab open | Returns per-folder counts and an uncategorized count |
| Rename folder | PATCH | `/api/v1/folders/:id` | Rename | |
| Delete folder | DELETE | `/api/v1/folders/:id` | Delete | Scenarios survive as uncategorized |

## Page Relationships

- **From:** the navigation bar, from any workspace tab.
- **To:** [Scenario Builder](./02-workspace-scenario-builder.md) via **Load to Builder**, carrying the
  full scenario plus a replay flag.
- **Data coupling:** every successful generation and every run in the Builder writes here. Creating a
  folder in the Builder's modal adds a row to this tree.

## Business Rules

- **Records are private.** The list endpoint only ever returns the caller's own records; the detail,
  move, and delete endpoints additionally check ownership and refuse with 403 — except for admins,
  who may read and modify any record.
- **A run mutates the record it belongs to.** Starting a run sets the status to `RUNNING` and persists
  the exact code being executed; finishing sets `SUCCESS` or `FAILED` and records the duration, the
  logs, and the video path.
- **Deleting a folder never deletes work.** This is enforced at the database level, not just in the
  UI.
- **Videos are the only heavy artefact.** They are stored in a private bucket keyed by user id and are
  removed when their history record is deleted.
