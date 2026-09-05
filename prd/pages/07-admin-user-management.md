# Admin — User Management

> **Route:** `/admin` → tab **User Management** (default tab)
> **Module:** Administration
> **Access:** Admin only
> **Source:** `public/admin.html`, `src/server/routes/admin-routes.ts`

## Overview

The approval desk. Every registration request lands here as a `pending` row that an administrator
approves or rejects, and every existing account is listed with its role, status, and registration
date. This is the only place an account can be activated, so nobody reaches the product without
passing through this table.

## Layout

The Admin Console is a standalone page with its own header (brand link back to the workspace, theme
toggle, a badge showing the signed-in admin's username and role, and Sign Out) and a five-button tab
bar: **User Management** · Activity Logs · Feedbacks · System Configuration · API Keys.

This tab holds a single card: a title, the subtitle *"Review, approve, or reject pending account
requests for Tester Lab"*, the accounts table, and a pagination footer.

## Fields

### Region: Accounts table

| Column | Format | Notes |
| :-- | :-- | :-- |
| Username | Bold text | |
| Email | Plain text | As supplied at registration |
| Role | Monospace | `admin` or `user` |
| Status | Coloured chip | `PENDING` (amber) · `APPROVED` (green) · `REJECTED` (red) |
| Registered At | Locale date-time | |
| Actions | Buttons | Depends on status — see below |

### Region: Row actions

| Account status | Buttons offered |
| :-- | :-- |
| `pending` | **Approve** (green) · **Reject** (red) · **Delete** |
| `rejected` | **Approve** (green) · **Delete** |
| `approved` | *(the word "Approved")* · **Delete** |

The account literally named `admin` is exempt from **Delete**; every other account, including other
administrators, can be deleted from here.

### Region: Pagination

10 rows per page, with Previous / Next and a *"Page X of Y"* label. Paging happens in the browser over
the full list returned by the API, which is unpaginated.

## Interactions

### Opening the console

Before anything renders, the page verifies the session: without a token it redirects to the workspace
immediately; with a token it calls `GET /api/v1/auth/me` and, if the role is not `admin`, shows an
*Access Denied* toast and redirects after about a second. On success the admin badge is filled in and
users, activity logs, and feedbacks are all fetched up front.

### Approving an account

- **Trigger:** **Approve**.
- **Behaviour:** `POST /api/v1/admin/users/:id/approve` sets the status to `approved`.
- **On success:** a success toast (*"Account 'X' approved successfully."*) and the table reloads. An
  `Admin Approve` entry naming the affected user is written to the activity log.
- **Effect on the user:** they can sign in from that moment; if they already hold a valid token, their
  very next request succeeds, because status is re-read from the database on every call.
- **Not found:** 404 with *"User not found."*

### Rejecting an account

- **Trigger:** **Reject**.
- **Behaviour:** `POST /api/v1/admin/users/:id/reject` sets the status to `rejected`.
- **On success:** an informational toast and a table reload; logged as `Admin Reject`.
- **Effect on the user:** login is refused with an explanatory message, and any live session stops
  working on its next request. **Rejection is reversible** — a rejected row still offers Approve.

### Deleting an account

- **Trigger:** **Delete**.
- **Confirmation:** *"Are you sure you want to delete this user account? This action cannot be
  undone."*
- **On confirm:** `DELETE /api/v1/admin/users/:id`. Because of the database's cascade rules, deleting
  a user also removes their folders, their entire flow history, and their API keys. Logged as
  `Admin Delete` with the user id.
- **Not covered by the cascade:** the user's stored videos and their API-key usage log rows survive,
  since those references are cleared rather than cascaded.

## API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| List users | GET | `/api/v1/admin/users` | Console load, tab switch, after any action | Returns every account, oldest first; no pagination, no password hashes |
| Approve | POST | `/api/v1/admin/users/:id/approve` | Approve | |
| Reject | POST | `/api/v1/admin/users/:id/reject` | Reject | |
| Delete | DELETE | `/api/v1/admin/users/:id` | Delete | Cascades to folders, history, and API keys |
| Verify session | GET | `/api/v1/auth/me` | Console load | Gates the whole page |

## Page Relationships

- **From:** the *Admin Console* link in the workspace header, visible only to admins.
- **To:** the workspace, via the brand link or a failed authorisation check; the other four console
  tabs.
- **Data coupling:** approving or rejecting an account changes what
  [Sign In](./01-auth-sign-in-register.md) does for that person. Every action here appears in
  [Activity Logs](./08-admin-activity-logs.md).

## Business Rules

- **Approval is the only route in.** New accounts are always created `pending`; there is no
  self-service activation, invitation, or email verification.
- **There is no email notification.** Nothing tells the user their request was approved or rejected —
  they discover it by trying to sign in. A notification channel would be the obvious addition.
- **Roles cannot be changed from the UI.** There is no promote-to-admin control anywhere in the
  product; the only administrator is the one bootstrapped from environment variables, unless a role is
  changed directly in the database.
- **The bootstrap admin protects itself.** Deleting the account named `admin` is blocked in the UI,
  and even if it were removed, the next server start would recreate it from the environment.
- **Ordering is oldest-first**, which means the newest registration requests appear on the *last*
  page — an ergonomic wrinkle worth reconsidering.
