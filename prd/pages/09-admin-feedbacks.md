# Admin — Feedbacks

> **Route:** `/admin` → tab **Feedbacks**
> **Module:** Administration
> **Access:** Admin only
> **Source:** `public/admin.html`, `src/server/routes/admin-routes.ts`, `src/server/services/attachment-service.ts`

## Overview

The inbox for everything users report through the floating [Feedback](./06-feedback-modal.md) button.
Each row shows when it arrived, what kind of problem it is, the full description, and a link to the
attached screenshot if there is one. Administrators can read and delete; there is no triage state,
assignment, or reply.

## Layout

One card titled *User Feedbacks*, subtitled *"Review feedback and bug reports from users"*, containing
the table and a pagination footer.

## Fields

| Column | Format | Notes |
| :-- | :-- | :-- |
| Timestamp | Locale date-time | Newest first |
| Type | Chip | `Functional` · `Defect` · `Cosmetic` |
| Details | Wrapping text, up to 400 px wide | The reporter's full description |
| Attached File | **View File ↗** link, or italic *No File* | Opens the screenshot in a new tab |
| Actions | **Delete** button (warning colour) | |

10 rows per page, Previous / Next, paged in the browser.

## Interactions

### Opening the tab

Fetches `GET /api/v1/admin/feedbacks?limit=1000`. Each returned record is enriched server-side with a
freshly signed one-hour URL for its attachment, so the link works without exposing the bucket.

### Viewing an attachment

The link prefers the signed URL supplied with the record. If that is missing — signing failed, or the
record predates signed URLs — it falls back to `/feedbacks/attachments/<filename>?token=<jwt>`, a
server route that re-signs and redirects, and which is itself admin-gated. Links open in a new tab
with `noopener`.

### Deleting a feedback record

- **Trigger:** **Delete**.
- **Confirmation:** a warning dialog.
- **On confirm:** `DELETE /api/v1/admin/feedbacks/:id` removes the stored attachment from the bucket
  first, then the database row, and writes an `Admin Delete Feedback` entry to the activity log.
- **Not found:** 404 with *"Feedback not found"*.

## API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| List feedbacks | GET | `/api/v1/admin/feedbacks?page=&limit=` | Tab open | Server-side pagination available (defaults page 1, limit 10) plus a total count; the console asks for 1000 and pages in the browser |
| Delete feedback | DELETE | `/api/v1/admin/feedbacks/:id` | Delete | Removes the attachment then the row |
| Attachment redirect | GET | `/feedbacks/attachments/:filename` | Fallback link | Admin-gated; signs and redirects, falling back to a public URL if signing fails |

## Page Relationships

- **From:** the Admin Console tab bar.
- **To:** an external tab, when opening an attachment.
- **Data coupling:** rows originate from the [Feedback modal](./06-feedback-modal.md); deletions
  appear in [Activity Logs](./08-admin-activity-logs.md).

## Business Rules

- **Feedback is anonymous by design of the data model** — there is no reporter field to display, so
  administrators cannot follow up. See the [Feedback modal](./06-feedback-modal.md) business rules.
- **There is no workflow state.** No open/closed, no severity, no assignee, no comments. The only
  lifecycle transition available is deletion.
- **Attachments are always private.** Nothing in the product ever hands out a durable public URL for
  a screenshot; every link is a one-hour signature minted at read time.
- **The list is effectively capped at 1000 records.** Beyond that, older feedback exists in the
  database but cannot be reached from the console, because the browser paginates a single fixed-size
  fetch. Switching to the endpoint's real server-side pagination would fix this.
