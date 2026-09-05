# Sign In / Request Access

> **Route:** `/` — shown instead of the workspace whenever no valid session exists
> **Module:** Access & Identity
> **Access:** Public
> **Source:** `public/index.html` (`#unauthLoginView`), `public/js/app.js`, `src/server/routes/auth-routes.ts`

## Overview

The single front door to Tester Lab. A centred card offers two mutually exclusive panels: signing in
with an existing account, or requesting a new one. New accounts are not usable immediately — every
registration lands in a queue that an administrator must approve, and the page says so before the
user submits.

A visitor arrives here by opening the application root without a stored session, by signing out, or
by having their stored token rejected (expired, revoked, or the account deleted).

## Layout

The application header, top announcement bar, navigation tabs, and workspace container are all
hidden while this view is showing. The card sits centred; the only other control is the theme toggle
pinned to the top-right corner.

A flash-prevention trick runs before paint: if a token exists in browser storage, the document gets a
`has-auth-token` class so the login card is not briefly visible to a returning, signed-in user.

## Fields

### Region: Sign In panel

| Field | Type | Required | Placeholder | Notes |
| :-- | :-- | :-- | :-- | :-- |
| Username | Text input | Yes | `Enter username (e.g. admin)` | Matched case-insensitively on the server |
| Password | Password input | Yes | `Enter password` | Eye button toggles plain-text visibility |

| Button | Behaviour |
| :-- | :-- |
| **Sign In** (primary, full width) | Submits the login form |
| **Request Account Access** (outline) | Swaps the card to the register panel |

### Region: Request Access panel

| Field | Type | Required | Placeholder | Validation |
| :-- | :-- | :-- | :-- | :-- |
| Username | Text input | Yes | `Choose a username` | Must not already exist (case-insensitive) |
| Email address | Email input | Yes | `user@example.com` | Browser `type=email` validation only; no server-side format check |
| Password | Password input | Yes | `Minimum 6 characters` | Minimum 6 characters, enforced server-side; eye toggle available |

Standing notice above the submit button: *"New registrations require Administrator approval before
accessing the platform."*

| Button | Behaviour |
| :-- | :-- |
| **Submit Request** (primary, full width) | Submits the registration form |
| **Back to Sign In** (outline) | Swaps the card back to the login panel |

## Interactions

### Page load

- The stored theme is applied (saved choice, otherwise the OS preference).
- If a token exists in browser storage, the app calls `GET /api/v1/auth/me`. A valid response reveals
  the workspace and this view is never seen; an invalid one clears the stored token and leaves the
  visitor here.
- The login panel is the default; the register panel is hidden.

### Sign in

- **Trigger:** Submitting the login form.
- **Behaviour:** `POST /api/v1/auth/login` with username and password.
- **On success:** The returned JWT is stored in browser storage under `tester_jwt_token`, the header
  user bar renders, the session check re-runs to reveal the workspace, and a success toast greets the
  user by name. The workspace also immediately loads the sample-scenario configuration and the user's
  folder list.
- **On failure:** An error toast shows the server's message:

| Condition | HTTP | Message shown |
| :-- | :-: | :-- |
| Missing username or password | 400 | *Username and password are required.* |
| Unknown username | 401 | *Invalid username or password.* |
| Wrong password | 401 | *Invalid username or password.* |
| Account still awaiting approval | 403 | *Your account registration is pending admin approval. Please wait for admin confirmation.* |
| Account was rejected | 403 | *Your account registration request was rejected by the admin.* |

Unknown username and wrong password deliberately return identical wording so the form does not reveal
which usernames exist. Every attempt is written to the activity log (`Login Failed` with the specific
reason, or `Login Success`).

### Request access

- **Trigger:** Submitting the register form.
- **Behaviour:** `POST /api/v1/auth/register`.
- **On success:** The form resets, the card flips back to the login panel, the chosen username is
  pre-filled into the login username box, and an informational toast explains that the request is
  awaiting admin approval. The new account is created with role `user` and status `pending`, and a
  `Register` entry is added to the activity log.
- **On failure:**

| Condition | HTTP | Message |
| :-- | :-: | :-- |
| Any of username / email / password missing | 400 | *Username, email, and password are required.* |
| Password shorter than 6 characters | 400 | *Password must be at least 6 characters long.* |
| Username already taken | 409 | *Username is already taken. Please choose another username.* |

### Sign out (from the workspace header)

Clears the token from memory and browser storage, re-runs the session check — which returns the
visitor to this page — and shows a *You have been signed out successfully* toast.

### Toggle password visibility

The eye button on either password field swaps the input between masked and plain text and switches
the icon between "eye" and "eye with slash". Purely client-side, per field.

### Toggle theme

Flips the document between light and dark and persists the choice under `tester_lab_theme`.
Available on this page and on every authenticated page.

## API Dependencies

| API | Method | Path | Trigger | Auth | Notes |
| :-- | :-: | :-- | :-- | :-- | :-- |
| Register | POST | `/api/v1/auth/register` | Submit Request | Public | Always creates a `pending` `user` |
| Login | POST | `/api/v1/auth/login` | Sign In | Public | Returns a 7-day JWT plus the user profile |
| Current user | GET | `/api/v1/auth/me` | Page load with a stored token | JWT or API key | Decides whether to show this page or the workspace |

## Page Relationships

- **To:** [Scenario Builder](./02-workspace-scenario-builder.md) on successful sign-in (default tab).
  Admins additionally see an *Admin Console* link in the header once inside.
- **From:** Every authenticated page, via **Sign Out**; also reached automatically when a stored token
  fails validation. The Admin Console redirects here if the visitor is not an admin.

## Business Rules

- **The approval gate is absolute at login.** A pending or rejected account never receives a token,
  so no downstream endpoint has to defend against it — though the approved-user check still does, for
  accounts whose status changes mid-session.
- **Sessions last 7 days.** The JWT carries user id, username, role, and status. The role and status
  inside the token are *not* trusted for authorisation: every request re-reads the user record from
  the database, so an approval, rejection, or deletion takes effect on the very next request without
  the user having to sign in again.
- **The token is the only session artefact.** There is no refresh token, no server-side session store,
  and no logout endpoint — signing out simply discards the token in the browser.
- **The bootstrap admin cannot be locked out.** On every server start the account described by the
  admin environment variables is created if missing, or re-synced (including the password and an
  `approved` status) if it drifted.
- **Registration collects no other profile data.** No name, organisation, or role selection — an
  administrator sees only username, email, and timestamp when deciding.
