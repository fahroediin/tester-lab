# Feedback

> **Surface:** Floating button (bottom-right) on the workspace, opening a modal
> **Module:** Feedback
> **Access:** The button is rendered on the workspace page; the submit endpoint itself is **unauthenticated**
> **Source:** `public/index.html` (`#feedbackModal`), `public/js/app.js`, `src/server/routes/feedback-routes.ts`

## Overview

A always-available channel for users to report a bug or suggest an improvement, with an optional
screenshot. Submissions land in the [Admin Feedbacks](./09-admin-feedbacks.md) console.

## Layout

A compact modal (520 px) with a header, three stacked form controls, and a right-aligned
Cancel / Submit pair.

## Fields

| Field | Type | Required | Default | Options / Validation | Notes |
| :-- | :-- | :-: | :-- | :-- | :-- |
| Feedback Type | Dropdown | Yes | `Functional (Bug / Logic Error)` | `Functional` · `Defect` · `Cosmetic` | Stored as the bare word (`Functional`, `Defect`, `Cosmetic`) |
| Information Details | Textarea, 4 rows | Yes | — | Must be non-empty after trimming | Free-text description |
| Attach File | File input | No | — | `.png` `.jpg` `.jpeg` `.bmp`, maximum 5 MB | Helper text states the accepted formats and the limit |

The three type options read in full as: *Functional (Bug / Logic Error)*, *Defect (Crash / Error
Page)*, *Cosmetic (UI / Design Issue)*.

| Button | Behaviour |
| :-- | :-- |
| **Cancel** | Closes the modal; nothing is kept |
| **Submit** | Validates, uploads, and posts; shows a spinner and disables itself while in flight |

## Interactions

### Opening

Clicking the floating **Feedback** button shows the modal and clears both the details textarea and the
file input, so each report starts blank.

### Submitting

- **Client validation, in order:**
  1. Details must be non-empty — *"Please provide feedback details."*
  2. If a file is attached, it must be under 5 MB — *"Attachment exceeds 5MB limit."*
  3. The extension must be one of the four allowed — *"Only PNG, JPG, JPEG, and BMP are allowed."*
- **Behaviour:** the file is read as a base64 data URL in the browser and posted inline with the type
  and details to `POST /api/v1/feedback`.
- **Server validation:** the extension is re-checked, the decoded size is re-checked against the
  configured limit (5 MB by default), and the image is uploaded to a private storage bucket under a
  generated record id before the metadata row is written.
- **On success:** the modal closes and a success toast reads *"Thank you for your feedback!"*
- **On failure:** an error toast carries the server message; the modal stays open so the text is not
  lost.
- **Always:** the Submit button and its spinner are restored.

## API Dependencies

| API | Method | Path | Trigger | Auth | Notes |
| :-- | :-: | :-- | :-- | :-- | :-- |
| Submit feedback | POST | `/api/v1/feedback` | Submit | **None** | Accepts type, details, and an optional base64 image |

## Page Relationships

- **From:** the floating button on the workspace.
- **To:** nowhere for the user. Administrators read submissions in
  [Admin — Feedbacks](./09-admin-feedbacks.md).

## Business Rules

- **Feedback is anonymous.** No user id, username, or session is attached to the record — only the
  type, the text, the optional attachment, and a timestamp. An administrator therefore cannot reply to
  or follow up with the reporter, and cannot tell two reporters apart. If attribution is wanted, this
  is the change to make.
- **The endpoint is open to the internet.** It requires no authentication and has no rate limiting, so
  it is exposed to spam and to storage abuse bounded only by the per-file size limit.
- **Attachments are images only, and private.** They live in a private bucket and are surfaced to
  admins exclusively through short-lived signed URLs.
- **Deleting a feedback record deletes its attachment**, performed by the admin console.
