# Admin — System Configuration

> **Route:** `/admin` → tab **System Configuration**
> **Module:** Administration
> **Access:** Read requires any authenticated account; write is admin only
> **Source:** `public/admin.html`, `src/server/routes/config-routes.ts`, `src/server/config-store.ts`

## Overview

One shared setting: the **sample flow** that every user gets when they click *Load Sample Flow* in the
Scenario Builder. An administrator uses this tab to give new users a working, house-specific starting
point instead of a blank form — typically a login flow against the organisation's own staging
environment.

Despite the tab's broad name, this is the only configuration it manages. Everything else — ports,
timeouts, concurrency limits, credentials, the usage-reset window — lives in environment variables and
is not editable from any screen.

## Layout

A single card headed *System Configuration* with a **Save** button in the top-right, and one section
below the divider titled *Sample Flow Configuration* holding three stacked fields.

## Fields

| Field | Type | Required | Validation | Business description |
| :-- | :-- | :-: | :-- | :-- |
| Test Suite Name | Text (max width 600 px) | Yes | Non-empty, server-side | Pre-fills the builder's suite name |
| Target URL | Text (max width 600 px) | Yes | Non-empty, server-side | Pre-fills the builder's target URL |
| Execution Steps (JSON Array) | Textarea, 12 rows, monospace | Yes | Must parse as a JSON **array** | Pre-fills the builder's step list |

The steps field carries the helper text *"Format must be a valid JSON array of step objects"* and a
placeholder showing the expected shape — an array of objects with `action`, `targetLabel`, `value`,
and `description`.

| Button | Behaviour |
| :-- | :-- |
| **Save** | Validates the JSON locally, then writes the configuration |

## Interactions

### Opening the tab

`GET /api/v1/config` is called every time the tab is selected (unlike the other tabs, which cache),
and the three fields are populated. The steps array is rendered as pretty-printed JSON with two-space
indentation. An unconfigured system returns empty strings and an empty array.

### Saving

- **Trigger:** **Save**.
- **Client validation:** the steps textarea must parse as JSON *and* be an array; otherwise an error
  toast reads *"Execution Steps must be a valid JSON array."* and nothing is sent.
- **Behaviour:** `POST /api/v1/config` with the suite name, target URL, and parsed steps.
- **Server validation:** all three must be present and the steps must be an array, otherwise 400 with
  *"Missing or invalid configuration fields"*.
- **On success:** a *"Configuration saved successfully."* toast and the in-page cache is refreshed.
- **On failure:** an error toast with the server message.

### Effect on users

The configuration is a single shared row — there is no per-user or per-team variant. The next time any
user opens the workspace, their session picks up the new sample; users already signed in keep the
previously loaded copy until they reload the page.

## API Dependencies

| API | Method | Path | Trigger | Auth | Notes |
| :-- | :-: | :-- | :-- | :-- | :-- |
| Read config | GET | `/api/v1/config` | Tab open; also on every workspace sign-in | Any authenticated caller | Notably **not** gated on approved status |
| Write config | POST | `/api/v1/config` | Save | Admin only | Upserts the single configuration row |

## Page Relationships

- **From:** the Admin Console tab bar.
- **To:** nowhere directly.
- **Data coupling:** what is saved here is exactly what *Load Sample Flow* produces in the
  [Scenario Builder](./02-workspace-scenario-builder.md). If the sample is empty, that button shows a
  warning telling the user to contact an administrator.

## Business Rules

- **The steps are stored verbatim and never validated as a DSL.** Nothing checks that the actions are
  real, that required values are present, or that the target URL is reachable. A malformed sample will
  load into the builder and only fail later, at generation time, with DSL validation errors. Running
  the sample through the DSL validator on save would be a cheap improvement.
- **Configuration is global and single-row.** The table is constrained to exactly one row, so there is
  no history, no versioning, and no way to keep more than one sample.
- **Reading configuration is unusually permissive.** The GET endpoint only requires authentication,
  not approval, so a pending account holding a token could read it — though pending accounts cannot
  obtain a token through login in the first place.
- **No other setting is exposed.** Changing timeouts, concurrency, the API-key usage window, or
  credentials requires editing the environment and restarting the server.
