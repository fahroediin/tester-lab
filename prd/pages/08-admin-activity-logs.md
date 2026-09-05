# Admin — Activity Logs

> **Route:** `/admin` → tab **Activity Logs**
> **Module:** Administration
> **Access:** Admin only
> **Source:** `public/admin.html`, `src/server/routes/admin-routes.ts`, `src/server/activity-log-store.ts`

## Overview

The system's audit trail. Every meaningful action — sign-in attempts, registrations, script
generations, test runs, blocked code, folder and API-key changes, and every administrative decision —
is recorded with who did it, what they did, and when. This tab is read-only: entries cannot be edited,
deleted, or exported from the UI.

## Layout

One card titled *Activity Logs*, subtitled *"Recent user activities and system events"*, containing
the log table and a pagination footer.

## Fields

| Column | Format | Notes |
| :-- | :-- | :-- |
| Timestamp | Locale date-time | Newest first |
| Username | Plain text | The actor. `System` when no user could be identified |
| Action | Short label | See the catalogue below |
| Details | Free text | Context: which URL, which user, which key, why it failed |

10 rows per page, Previous / Next, paged in the browser.

## Recorded actions

| Action | Written when | Typical detail |
| :-- | :-- | :-- |
| `Register` | A registration request is submitted | *Requested new account access (pending approval)* |
| `Register Failed` | Registration threw a server error | The error message |
| `Login Success` | Credentials accepted | *User authenticated successfully* |
| `Login Failed` | Credentials rejected | *Invalid username* · *Invalid password* · *Account is pending approval* · *Account was rejected* |
| `Generate Script` | A script was generated | *Generated script for target URL: …* |
| `Generate Script Failed` | Generation failed validation or the pipeline | *Failed due to validation or generation errors* |
| `Run Test` | A test finished executing | Mode, pass/fail, duration in milliseconds |
| `Run Test Blocked` | The sanitizer rejected submitted code | The list of violated rules |
| `Create Folder` / `Delete Folder` | Folder lifecycle | The folder name |
| `API Key Created` / `API Key Revoked` / `API Key Deleted` | Key lifecycle | Key name and masked prefix, or the key id |
| `Admin Approve` / `Admin Reject` / `Admin Delete` | Account decisions | The affected username or id |
| `Admin Delete Feedback` | A feedback record was removed | The feedback id |

## Interactions

### Opening the tab

Fetches `GET /api/v1/admin/logs` and renders page 1. The console requests no explicit limit, so the
server's default applies: **the most recent 200 entries**. Older history exists in the database but is
not reachable from this screen.

### Paging

Previous / Next move through the fetched 200 entries, 10 at a time. There is no search, no filter by
user or action, and no date range.

### Refreshing

There is no refresh button on this tab — the list reloads when the console is opened. Switching away
and back does *not* refetch, because the tab only fetches when its cached list is empty.

## API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| List logs | GET | `/api/v1/admin/logs?limit=` | Console load | Newest first; server default limit 200, capped only by what the caller asks for |

## Page Relationships

- **From:** the Admin Console tab bar.
- **To:** nowhere — this tab is terminal and read-only.
- **Data coupling:** almost every action in the product writes here, including actions taken in the
  other admin tabs.

## Business Rules

- **Logging never breaks the action.** If writing a log entry fails, the store returns a synthetic
  entry and the originating request still succeeds. Availability of the feature beats completeness of
  the audit trail.
- **Failed logins are logged with the attempted username**, even when no such account exists — useful
  for spotting credential-stuffing, and worth knowing when considering retention.
- **The trail is append-only from the product's perspective.** Nothing in the UI or the API deletes or
  edits log entries; pruning would have to happen in the database.
- **Actor identity is a snapshot.** The username is copied into the row at write time, so entries
  remain readable after the account is deleted, even though the user id reference is gone.
