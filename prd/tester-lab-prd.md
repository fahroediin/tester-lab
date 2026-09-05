# Tester Lab — Product Requirements Document

> **Source:** reverse-engineered from the `rotom-qa` repository (npm package `tester-lab`, v1.0.0)
> **Generated:** 2026-09-04
> **Single-file edition** — the concatenation of the `prd/` tree. The same content is maintained as
> separate documents under `prd/README.md`, `prd/pages/`, and `prd/appendix/`.

## Contents

**Part I — Overview**

- [System overview, modules, page inventory, global rules](#overview)

**Part II — Product Surfaces**

| # | Page | Route | Access |
| :-: | :-- | :-- | :-- |
| 1 | [Sign In / Request Access](#p01) | `/` (unauthenticated view) | Public |
| 2 | [Scenario Builder](#p02) | `/` -> tab `builder` | Approved user |
| 3 | [Interaction Recorder](#p03) | modal on Scenario Builder | Approved user |
| 4 | [Flow History](#p04) | `/` -> tab `history` | Approved user |
| 5 | [API Keys (Workspace)](#p05) | `/` -> tab `apikeys` | Approved non-admin |
| 6 | [Feedback](#p06) | modal, workspace page | Any visitor |
| 7 | [Admin - User Management](#p07) | `/admin` -> tab `users` | Admin |
| 8 | [Admin - Activity Logs](#p08) | `/admin` -> tab `logs` | Admin |
| 9 | [Admin - Feedbacks](#p09) | `/admin` -> tab `feedbacks` | Admin |
| 10 | [Admin - System Configuration](#p10) | `/admin` -> tab `config` | Admin |
| 11 | [Admin - API Keys & Usage](#p11) | `/admin` -> tab `apikeys` | Admin |

**Part III — Backend, API & Tooling**

| # | Surface | Endpoints / entry point | Access |
| :-: | :-- | :-- | :-- |
| 12 | [Generation & Execution API](#p12) | `/api/v1/generate-script`, `/inspect-dom`, `/run-test` | JWT or API key |
| 13 | [Scenario Library API](#p13) | `/api/v1/history`, `/api/v1/folders` | JWT or API key |
| 14 | [Recorder API & Reverse Proxy](#p14) | `/api/v1/recorder/*` | Mixed |
| 15 | [CLI & Library API](#p15) | `test-gen`, `TestScriptGenerator` | Local process |

**Part IV — Appendices**

- [Enum Dictionary](#ax-enum) — every status, action, framework, score, and limit
- [Data Model](#ax-data) — tables, columns, constraints, storage buckets
- [API Inventory](#ax-api) — complete endpoint reference with auth matrix
- [Page Relationships](#ax-rel) — navigation and data-coupling map

---

<a id="overview"></a>

## Part I — Overview
### System Overview

Tester Lab turns a plain-language description of a business flow into a runnable end-to-end test
script — **without using an LLM**. A user describes what a tester would do ("fill Username with
`student`", "click Sign In", "check the URL becomes `/dashboard`"), and the system opens the target
website in a headless browser, looks at the real page, decides which on-screen element each described
step refers to, and emits a finished test file for Playwright, Cypress, Selenium (Python), or Robot
Framework.

The element-matching decision is made by a fixed, published scoring matrix rather than a model, so the
same business description against the same page always produces the same script. Nothing about the
customer's page — its structure, its field names, its data — is sent to a third party. Runs are fast
(local, in-memory matching) and cost nothing per generation.

Around that engine sits a small multi-user product: accounts require admin approval, scenarios are
organised into per-user project folders, every generation and execution is recorded in a history with
a video replay of the run, users can mint API keys to drive the same pipeline from CI, and an admin
console covers approvals, audit logs, user feedback, sample-scenario configuration, and API usage
statistics.

**Primary users**

| User | What they do |
| :-- | :-- |
| **QA engineer / manual tester** (`user`) | Builds scenarios in the web workspace or records them by clicking through the target site; generates, runs, reviews, and re-runs scripts. |
| **Automation / platform engineer** (`user`) | Uses API keys or the CLI to generate and execute scripts from a pipeline. |
| **Administrator** (`admin`) | Approves accounts, watches the audit log, triages feedback, configures the shared sample scenario, monitors API-key usage. |

---

### Module Overview

| Module | Pages / surfaces | Core functionality |
| :-- | :-- | :-- |
| **Access & Identity** | Sign In / Request Access | Registration (pending by default), login, JWT session, admin approval gate |
| **Scenario Authoring** | Scenario Builder, Interaction Recorder, Create Folder | Compose or record DSL steps, import/export flows, generate scripts, run them, watch the recording |
| **Scenario Library** | Flow History (folder tree + table + detail) | Browse, search, sort, paginate, re-open, move between folders, delete past scenarios and runs |
| **Developer Integration** | API Keys (workspace), Quick Integration Guide | Mint / revoke / delete API keys, see per-key monthly usage, copy ready-made cURL snippets |
| **Administration** | Admin Console (5 tabs) | User approvals, activity audit log, feedback triage, sample-scenario config, API-key usage stats & logs |
| **Feedback** | Floating Feedback modal | Report functional / defect / cosmetic issues with an optional screenshot |
| **Generation Engine (headless)** | REST API + CLI + library | Validate DSL → crawl DOM → score & match → transpile → dry-run & self-heal |

---

### Page Inventory

| # | Page / surface | Route | Module | Access | Doc |
| :-: | :-- | :-- | :-- | :-- | :-- |
| 1 | Sign In / Request Access | `/` (unauthenticated view) | Access & Identity | Public | [→](#p01) |
| 2 | Scenario Builder | `/` → tab `builder` | Scenario Authoring | Approved user | [→](#p02) |
| 3 | Interaction Recorder | modal on Scenario Builder | Scenario Authoring | Approved user | [→](#p03) |
| 4 | Flow History | `/` → tab `history` | Scenario Library | Approved user | [→](#p04) |
| 5 | API Keys (workspace) | `/` → tab `apikeys` | Developer Integration | Approved non-admin user | [→](#p05) |
| 6 | Feedback | modal, workspace page | Feedback | Any visitor\* | [→](#p06) |
| 7 | Admin — User Management | `/admin` → tab `users` | Administration | Admin | [→](#p07) |
| 8 | Admin — Activity Logs | `/admin` → tab `logs` | Administration | Admin | [→](#p08) |
| 9 | Admin — Feedbacks | `/admin` → tab `feedbacks` | Administration | Admin | [→](#p09) |
| 10 | Admin — System Configuration | `/admin` → tab `config` | Administration | Admin | [→](#p10) |
| 11 | Admin — API Keys & Usage | `/admin` → tab `apikeys` | Administration | Admin | [→](#p11) |
| 12 | Generation & Execution API | `/api/v1/generate-script`, `/inspect-dom`, `/run-test` | Engine | JWT or API key | [→](#p12) |
| 13 | Scenario Library API | `/api/v1/history`, `/api/v1/folders` | Scenario Library | JWT or API key | [→](#p13) |
| 14 | Recorder API & Proxy | `/api/v1/recorder/*` | Scenario Authoring | Mixed | [→](#p14) |
| 15 | CLI & Library API | `test-gen` binary, `TestScriptGenerator` | Engine | Local process | [→](#p15) |

\* The feedback button is rendered on the workspace page; the submit endpoint itself is unauthenticated.

**Appendices**

- [Enum Dictionary](#ax-enum) — every status, action, framework, score, and limit
- [Data Model](#ax-data) — tables, columns, constraints, storage buckets
- [API Inventory](#ax-api) — complete endpoint reference with auth matrix
- [Page Relationships](#ax-rel) — navigation and data-coupling map

---

### Global Notes

#### Permission model

Three gates stack on top of each other:

1. **Authenticated** — the caller presents a JWT bearer token (7-day life), an API key
   (`tl_live_…`, sent as `X-API-Key` or as a bearer token), or a `?token=` query parameter (used
   only for embedding video/iframe content that a browser fetches without headers).
2. **Approved** — the account's status must be `approved`. `pending` and `rejected` accounts get no
   further than login, which is refused with an explanatory message.
3. **Admin** — role must be `admin`.

A fourth, narrower gate exists: **JWT-only**. API-key management endpoints deliberately refuse
API-key authentication, so a leaked key cannot mint more keys.

The very first admin account is created from environment variables at server start-up and is
re-synced (username, email, password, `approved` status) on every boot.

#### Common interaction patterns

- **Destructive actions always confirm.** Deleting a user, a scenario, a folder, a feedback record,
  or revoking/deleting an API key all raise a SweetAlert confirmation dialog first.
- **Feedback is a snackbar.** Success or failure of every action surfaces as a toast
  (`success` / `error` / `warning` / `info`), auto-dismissed after 3.5 seconds.
- **Lists default to newest first.** History, activity logs, feedbacks, API keys, and API-key usage
  logs are all ordered by timestamp descending.
- **Editing a scenario invalidates its output.** Changing any builder field or step clears the
  generated code, the matching table, the terminal output, and the video, and disables Copy /
  Download / Run. The user must generate again.
- **Long jobs are queued, not rejected.** Script generation and test execution each pass through an
  in-memory concurrency queue (5 and 3 slots respectively by default) so a burst of requests waits
  rather than exhausting the server's browser processes.
- **Media is never public.** Test videos and feedback attachments live in private storage buckets and
  are served only through short-lived (1 hour) signed URLs, re-signed each time they are read.
- **Submitted code is scanned before it runs.** Any script sent to `/run-test` — or produced for a
  dry run — is checked against a blocklist (filesystem, process, `eval`, non-Playwright imports) and
  rejected outright if it matches.
- **Theme is remembered per browser.** A light/dark toggle stores the choice in `localStorage`; the
  default follows the operating-system preference.

#### Known gaps flagged during analysis

| Gap | Where | Detail |
| :-- | :-- | :-- |
| Recorder HTTP ingest path is unreachable from the UI | [Page 14](#p14) | The recorder agent only POSTs to `/recorder/ingest` when it receives a `session` id; the workspace never supplies one, so captured steps travel exclusively over `postMessage` / `BroadcastChannel`. The `ingest` and `session/:id/steps` endpoints are currently dead code paths. |
| Folder-name uniqueness is case-sensitive despite the comment | [Data Model](#ax-data) | `uq_folders_user_name` is a plain `UNIQUE (user_id, name)`; the SQL comment claims case-insensitivity, which the constraint does not deliver. API-key names, by contrast, *are* compared case-insensitively in application code. |
| Workspace API Keys tab is hidden from admins | [Page 5](#p05) | Admins manage their own keys in the Admin Console instead — but that console tab also shows only the admin's own keys, not everyone's. |
| Admin feedback list is capped at 1000 | [Page 9](#p09) | The console requests `?limit=1000` and paginates in the browser; beyond 1000 records, older feedback becomes unreachable in the UI. |
| Mixed-language UI copy | [Page 2](#p02) | The inline code-edit hint and the step drag-handle tooltip are in Indonesian; everything else is English. |

---

## Part II — Product Surfaces

<a id="p01"></a>

### Sign In / Request Access

> **Route:** `/` — shown instead of the workspace whenever no valid session exists
> **Module:** Access & Identity
> **Access:** Public
> **Source:** `public/index.html` (`#unauthLoginView`), `public/js/app.js`, `src/server/routes/auth-routes.ts`

#### Overview

The single front door to Tester Lab. A centred card offers two mutually exclusive panels: signing in
with an existing account, or requesting a new one. New accounts are not usable immediately — every
registration lands in a queue that an administrator must approve, and the page says so before the
user submits.

A visitor arrives here by opening the application root without a stored session, by signing out, or
by having their stored token rejected (expired, revoked, or the account deleted).

#### Layout

The application header, top announcement bar, navigation tabs, and workspace container are all
hidden while this view is showing. The card sits centred; the only other control is the theme toggle
pinned to the top-right corner.

A flash-prevention trick runs before paint: if a token exists in browser storage, the document gets a
`has-auth-token` class so the login card is not briefly visible to a returning, signed-in user.

#### Fields

##### Region: Sign In panel

| Field | Type | Required | Placeholder | Notes |
| :-- | :-- | :-- | :-- | :-- |
| Username | Text input | Yes | `Enter username (e.g. admin)` | Matched case-insensitively on the server |
| Password | Password input | Yes | `Enter password` | Eye button toggles plain-text visibility |

| Button | Behaviour |
| :-- | :-- |
| **Sign In** (primary, full width) | Submits the login form |
| **Request Account Access** (outline) | Swaps the card to the register panel |

##### Region: Request Access panel

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

#### Interactions

##### Page load

- The stored theme is applied (saved choice, otherwise the OS preference).
- If a token exists in browser storage, the app calls `GET /api/v1/auth/me`. A valid response reveals
  the workspace and this view is never seen; an invalid one clears the stored token and leaves the
  visitor here.
- The login panel is the default; the register panel is hidden.

##### Sign in

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

##### Request access

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

##### Sign out (from the workspace header)

Clears the token from memory and browser storage, re-runs the session check — which returns the
visitor to this page — and shows a *You have been signed out successfully* toast.

##### Toggle password visibility

The eye button on either password field swaps the input between masked and plain text and switches
the icon between "eye" and "eye with slash". Purely client-side, per field.

##### Toggle theme

Flips the document between light and dark and persists the choice under `tester_lab_theme`.
Available on this page and on every authenticated page.

#### API Dependencies

| API | Method | Path | Trigger | Auth | Notes |
| :-- | :-: | :-- | :-- | :-- | :-- |
| Register | POST | `/api/v1/auth/register` | Submit Request | Public | Always creates a `pending` `user` |
| Login | POST | `/api/v1/auth/login` | Sign In | Public | Returns a 7-day JWT plus the user profile |
| Current user | GET | `/api/v1/auth/me` | Page load with a stored token | JWT or API key | Decides whether to show this page or the workspace |

#### Page Relationships

- **To:** [Scenario Builder](#p02) on successful sign-in (default tab).
  Admins additionally see an *Admin Console* link in the header once inside.
- **From:** Every authenticated page, via **Sign Out**; also reached automatically when a stored token
  fails validation. The Admin Console redirects here if the visitor is not an admin.

#### Business Rules

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

---

<a id="p02"></a>

### Scenario Builder

> **Route:** `/` → navigation tab **Scenario Builder** (default tab after sign-in)
> **Module:** Scenario Authoring
> **Access:** Authenticated, approved account
> **Source:** `public/index.html` (`#tabBuilder`), `public/js/app.js`, `src/server/routes/test-routes.ts`

#### Overview

The heart of the product. On the left the user describes a business flow — which project folder it
belongs to, what it is called, which website it runs against, which test framework to emit, and an
ordered list of steps. On the right the system reports what it matched, shows the generated code, and
gives a terminal plus a video player for running the script on the spot.

A user comes here to author a new test, to adjust and re-run one loaded from history, or to import an
existing spec file and simply execute it.

#### Layout

Two columns that stack on narrow screens:

- **Left — Scenario Builder card:** import/sample buttons, project folder selector, four scenario
  fields, the step list, and the generate action bar.
- **Right — three stacked cards:**
  1. **Output Spec & Matching** — status chip plus the per-step matching table (collapsible).
  2. **Generated Code** — export-format selector, Copy / Download / Collapse, and an editable code
     console. Hidden until something has been generated or imported.
  3. **Built-in Terminal Console** — run-mode selector, *Run Script Now*, the terminal output pane,
     and (after a run) the execution recording video player.

A floating **Feedback** button sits at the bottom-right of the viewport on every workspace tab.

#### Fields

##### Region: Scenario header

| Field | Type | Required | Default | Options / Validation | Business description |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Project Folder | Dropdown | **Yes** | *(empty — "Select a folder first…")* | The user's own folders, each showing its scenario count | Test cases are organised per project; generation is refused without one |
| Test Suite Name | Text | **Yes** | — | Non-empty (client-side) | Names the generated test and the history record; also the download filename base |
| Target Framework | Dropdown | Yes | `Playwright` | Playwright · Cypress · Selenium WebDriver (Python) · Robot Framework | Chooses the output dialect |
| Target Web Application URL | Text | **Yes** | — | Non-empty client-side; must be a valid `http`/`https` URL server-side | The page the crawler opens and the script navigates to |
| Language / Syntax Format | Dropdown | Yes | `TypeScript (.spec.ts)` | Depends on framework — see below | Chooses the file extension and template |

**Language options are driven by the framework** (changing the framework rewrites this list and the
engine badge in the header):

| Framework | Language options | Header badge |
| :-- | :-- | :-- |
| Playwright | TypeScript (`.spec.ts`), JavaScript (`.spec.js`) | Playwright Engine |
| Cypress | JavaScript (`cy.js`) | Cypress Engine |
| Selenium | Python (`selenium.py`) | Selenium Engine |
| Robot Framework | Robot (`.robot`) | Robot Engine |

##### Region: Execution Steps

A counter badge reads *"N STEPS"*. Each step is a draggable card with an action selector and up to
three inputs, shown conditionally:

| Action (label in UI) | Target Element field | Value field label | Value required |
| :-- | :-: | :-- | :-: |
| Fill Input (`fill`) | shown | Input Value | Yes |
| Click Element (`click`) | shown | — | — |
| Select Option (`select`) | shown | Input Value | Yes |
| Upload File (`upload`) | shown (placeholder *e.g. Upload KTP / Document*) | File Path to Attach (*e.g. fixtures/ktp.pdf*) | Yes |
| Check (`check`) | shown | — | — |
| Uncheck (`uncheck`) | shown | — | — |
| Assert URL (`assert_url`) | **hidden** | Expected URL Path | Yes |
| Assert Text (`assert_text`) | shown | Expected Text | Yes |
| Assert Visible (`assert_visible`) | shown | — | — |
| Wait Delay (`wait`) | **hidden** | Delay (ms) | Yes |

Every step also has an optional **Description** free-text field, which becomes the comment above the
generated line and the label in the recorder feed.

| Per-step control | Behaviour |
| :-- | :-- |
| Drag handle (`⠿`) | Drag-and-drop reordering. *Tooltip is in Indonesian: "Klik & seret untuk memindahkan posisi step".* |
| ↑ / ↓ | Move the step one position; disabled at the ends |
| **Remove** | Deletes the step immediately, no confirmation |

##### Region: Action bar and toolbars

| Control | Location | Visibility / state | Behaviour |
| :-- | :-- | :-- | :-- |
| **Import File (.spec/.json/.yaml)** | Card header | Always | Opens a file picker accepting `.ts .js .spec.ts .spec.js .json .yaml .yml` |
| **Load Sample Flow** | Card header | Always | Loads the admin-configured sample scenario |
| **+ New Folder** | Beside the folder selector | Always | Opens the Create Folder modal |
| **Record Steps** | Steps header and below the list | Always | Opens the [Interaction Recorder](#p03) |
| **+ Add Step** | Below the list | Always | Appends an empty `fill` step |
| **Run Headless Dry-Run Verification** | Action footer | Checked by default | Whether to execute the script once headlessly right after generating |
| **Generate Script** | Action footer, primary | Always | Runs the whole pipeline |
| Export format | Generated Code header | After generation/import | `Code (.spec/.js)` · `Flow (.yaml)` · `Flow (.json)` |
| **Copy** / **Download** | Generated Code header | Disabled until code exists | Copies or downloads in the selected format |
| **Collapse / Expand** | Matching table and code card | Always | Show/hide that section |
| Run mode | Terminal header | Default `Headless Mode` | `Headless Mode` · `Headed Mode (Visual Browser)` |
| **Run Script Now** | Terminal header, primary | Disabled until code exists | Executes the code currently in the editor |

#### Interactions

##### Page load

The workspace renders with an empty step list, an empty matching table, the Generated Code card
hidden, and the terminal showing *"Terminal ready…"*. The sample configuration and the user's folder
list are fetched in the background so *Load Sample Flow* and the folder selector are ready.

##### Editing anything resets the output

Changing the folder, suite name, target URL, framework, language, or any step field — or adding,
removing, reordering, or re-typing a step — clears the generated code, hides the code card and the
matching table, clears the status chip, resets the terminal, hides the video, and disables Copy,
Download, and Run. This is deliberate: the displayed code must never be stale relative to the steps
above it.

##### Load Sample Flow

- **Trigger:** Clicking *Load Sample Flow*.
- **Behaviour:** Fills suite name, target URL, and the step list from the admin-configured sample.
- **Special rule:** If the administrator has not configured a sample yet, nothing is loaded and a
  warning toast says *"Admin has not configured the sample scenario yet. Please contact
  administrator."*

##### Import a file

Two distinct paths, chosen by file extension.

**Flow file (`.json`, `.yaml`, `.yml`)**
- Parses the document and fills suite name, target URL, framework, language, and the step list.
- For assertion steps, the `expected` value is mapped back into the UI's single Value field.
- Success toast: *"Successfully imported <filename>."*

**Spec file (`.ts`, `.js`, `.spec.ts`, `.spec.js`)**
- The file content is loaded straight into the code box, which becomes editable, and Copy / Download /
  Run are enabled — the script can be executed without generating anything.
- A best-effort reverse parse recovers UI steps from the `// Step N:` comments and the helper calls
  the generator emits, so the step list is populated where possible.
- The suite name is recovered from a `test(...)` or `describe(...)` title, and the target URL from a
  `page.goto(...)` or `cy.visit(...)` call.
- Language is set from the file extension. The status chip reads *Spec File Loaded*.
- **Empty file:** a warning toast, nothing loaded. **Unparseable file:** an error dialog with the
  parse message.

##### Generate Script

- **Trigger:** Clicking *Generate Script*.
- **Client-side validation, in order** — each failure shows a warning toast, focuses or scrolls to the
  offending control, and stops:
  1. Test Suite Name must not be empty.
  2. Target Web Application URL must not be empty.
  3. At least one step must exist.
  4. Per step: an action must be selected; `fill`, `click`, `select`, `upload`, `check`, `uncheck`,
     `assert_text`, and `assert_visible` require a Target Element Label; `fill`, `select`, and
     `upload` require a Value; `assert_url`, `assert_text`, and `wait` require their respective value.
     Invalid steps get a red border and an inline *"Action Required: …"* message; the view scrolls to
     the first one.
  5. A session must exist, and a project folder must be selected.
- **During generation:** the entire left column is disabled (inputs, selects, buttons, drag-and-drop),
  the builder card gets a green highlight, the output card a blue one and is scrolled into view, and
  the code console is repurposed as a live pipeline monitor that advances through four captioned
  stages — initialise, crawl, heuristic match, generate/dry-run — roughly every 1.2 seconds. This
  animation is cosmetic: it is a client-side timer, not real progress reported by the server.
- **API:** `POST /api/v1/generate-script` with the DSL payload, the dry-run flag, and the folder id.
- **On success:** the code replaces the monitor text and becomes editable; the matching table renders
  one row per resolved step (Step, Action, resolved selector, Score — green at 80 or above, red
  below); the code card is highlighted and scrolled into view; the status chip reads *Dry-Run Passed*,
  *Dry-Run Failed*, or *Script Generated* depending on the mode and result. A history record is
  created and its id retained for the subsequent run.
- **On validation failure from the server (422):** the status chip reads *Generation Failed*, an error
  toast lists the messages, and the code box shows them as comments.
- **On network failure:** status chip *Connection Error* plus an error toast.
- **Always:** the left column is re-enabled and the button label restored.

##### Edit the generated code in place

Once code exists the console is editable. A hint line below it — *currently written in Indonesian* —
explains that values and URLs can be changed directly and run without regenerating. *Run Script Now*
always executes what is currently in the box, and that exact text is persisted to the history record,
so history never disagrees with what actually ran.

##### Run Script Now

- **Trigger:** Clicking *Run Script Now*.
- **Guards:** requires a session; refuses while a generation is still in flight (*"Please wait until
  script generation finishes"*); refuses if the box is empty, still shows the placeholder comment, or
  still shows the pipeline monitor text.
- **During the run:** the terminal title becomes *CLI Terminal Output [Running HEADLESS/HEADED…]*, the
  terminal turns blue and prints an initiating banner, the terminal card gets a red highlight, the
  left column is disabled, and any previous video is cleared.
- **API:** `POST /api/v1/run-test` with the code, mode, language, and the current history id.
- **Replay case:** if the scenario was loaded from history, the request additionally carries a
  save-as-new flag plus the suite name, target URL, raw DSL, resolved steps, and folder id, so the
  re-run is stored as a **new** history record instead of overwriting the original. The client then
  adopts the returned id, so a second run updates that new record rather than forking again.
- **On success:** title *[PASS - <ms>ms]*, green terminal, full Playwright output.
- **On failure:** title *[FAIL - <ms>ms]*, red terminal, the logs or error message.
- **Video:** if the run produced a recording, the player is revealed below the terminal and scrolled
  into view; otherwise the terminal itself is scrolled into view.
- **Blocked code (403):** if the sanitizer rejects the script, the server returns the list of
  violations and refuses to execute; the attempt is written to the activity log as *Run Test Blocked*.

##### Copy / Download

Both honour the export-format selector:

| Format | Content | Filename |
| :-- | :-- | :-- |
| `Code (.spec/.js)` | Exactly what is in the code box, user edits included | `<Test_Suite_Name>.spec.ts` or `.spec.js` |
| `Flow (.yaml)` | The current builder state re-serialised as YAML DSL | `<Test_Suite_Name>.yaml` |
| `Flow (.json)` | The same state as JSON DSL | `<Test_Suite_Name>.json` |

Spaces in the suite name become underscores; an empty name falls back to `test-spec`.

#### API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| Folder list | GET | `/api/v1/folders` | Sign-in, tab switches, folder changes | Populates the selector with scenario counts |
| Create folder | POST | `/api/v1/folders` | Create Folder modal | |
| App config | GET | `/api/v1/config` | Sign-in | Supplies the sample scenario |
| Generate script | POST | `/api/v1/generate-script` | Generate Script | Requires a valid, owned folder id |
| Run test | POST | `/api/v1/run-test` | Run Script Now | Code is sanitised before execution |

#### Page Relationships

- **From:** [Sign In](#p01) (default landing tab);
  [Flow History](#p04) via *Load to Builder*, which brings the suite, URL,
  framework, language, steps, folder, and code across and marks the scenario as a replay.
- **To:** [Interaction Recorder](#p03) (modal), Create Folder (modal),
  [Feedback](#p06) (modal), and the other workspace tabs via the nav bar.
- **Data coupling:** A successful generation writes a Flow History record, so the History tab shows a
  new row on its next load. Creating a folder in the modal refreshes the selector *and* the History
  folder tree.

#### Business Rules

- **A folder is mandatory for generation but not for execution.** Generation is refused without a
  folder the caller owns; execution accepts a folder id only in the replay case and ignores an
  invalid one rather than failing.
- **Generated code is the contract, the DSL is the source.** The raw DSL is stored alongside the code
  so a scenario can be re-opened and edited structurally later; older records without it fall back to
  reverse-parsing the code.
- **A dry run can rewrite the code.** If the first headless verification fails, the self-healing
  engine retries with the runner-up element candidate for the failing step; if that passes, the
  *healed* script is what the user receives.
- **Headed mode is genuinely visual.** It launches a non-headless browser with a one-second
  slow-motion delay per action, and on a Linux server without a display it is wrapped in a virtual
  framebuffer.
- **Nothing is scheduled.** Every generation and every run is user-initiated; there is no queue the
  user can inspect, only the server-side concurrency limiter that makes requests wait their turn.
- **Language copy is mixed.** The inline code-edit hint and the drag-handle tooltip are Indonesian;
  the rest of the page is English. Worth normalising.

---

<a id="p03"></a>

### Interaction Recorder

> **Surface:** Full-screen modal launched from the [Scenario Builder](#p02)
> **Module:** Scenario Authoring
> **Access:** Authenticated, approved account
> **Source:** `public/index.html` (`#recorderModal`), `public/js/app.js`, `public/js/recorder-agent.js`, `src/server/services/recorder-proxy-service.ts`

#### Overview

Lets a tester build a scenario by *doing* it rather than describing it. The target website is loaded
inside the workspace through a server-side reverse proxy; a small recorder script is injected into the
proxied page, watches the tester's clicks and typing, and streams each action back to the builder as a
draft DSL step. When the tester is finished, the captured steps are appended to the Execution Steps
list, ready to be generated like any hand-written scenario.

This exists because writing target-element labels by hand is the slowest and most error-prone part of
authoring a scenario, especially on unfamiliar or deeply nested applications.

#### Layout

A near-full-screen modal (1200 px wide, 90% of viewport height):

- **Header:** title, a *Recording Active* chip, a live *"N steps recorded"* counter, **Cancel**, and
  **Apply Recorded Steps**.
- **Live feed bar:** the most recently captured step in monospace, plus a **Clear** link.
- **Body:** a sandboxed iframe filling the remaining space, showing the proxied target site.

The injected agent also draws its own floating badge inside the target page — *"Tester Lab Recording:
N step(s) captured"* — pinned to the bottom-right of the iframe.

#### Fields

The recorder has no form fields of its own. It reads one value from the builder and writes a list back.

| Control | Behaviour |
| :-- | :-- |
| **Cancel** | Closes the modal and blanks the iframe; the captured buffer is discarded |
| **Apply Recorded Steps** | Appends every buffered step to the builder's Execution Steps and closes |
| **Clear** (feed bar) | Empties the buffer without closing; the feed resets to the "Cleared…" prompt |

Each captured step carries: action, target label, value, and a generated description.

#### Interactions

##### Opening the recorder

- **Trigger:** *Record Steps*, from either the Execution Steps header or below the step list.
- **Pre-checks:** the builder's Target Web Application URL must be filled (*"Please enter a Target Web
  Application URL before starting the recorder"*) and must parse as an `http`/`https` URL
  (*"Please enter a valid HTTP or HTTPS URL"*). Either failure shows a warning toast and the modal
  does not open.
- **Behaviour:** the buffer is emptied, the counter resets to zero, and the iframe is pointed at
  `/api/v1/recorder/proxy?url=<target>&token=<jwt>`. The session token is passed in the query string
  because a browser cannot attach an `Authorization` header to an iframe navigation.

##### What the injected agent captures

| Tester action | Recorded step | Value | Description template |
| :-- | :-- | :-- | :-- |
| Click a button, link, or element with a button role | `click` | — | *Click <label>* |
| Click a checkbox that becomes checked | `check` | — | *Check <label>* |
| Click a checkbox/radio that becomes unchecked | `uncheck` | — | *Uncheck <label>* |
| Type into a text input or textarea | `fill` | final field value | *Type <value> into <label>* |
| Change a dropdown | `select` | the option's visible text | *Select <value> from <label>* |

Behavioural details:

- **Clicks on text-like inputs are ignored** (`text`, `password`, `email`, `number`, `tel`, `search`)
  so focusing a field does not produce a spurious click step.
- **Typing is debounced by 400 ms** and also flushed on blur, on change, on form submit, and whenever
  the tester clicks something else — so one step is recorded per field, holding its final value, not
  one per keystroke.
- **Consecutive fills on the same field collapse.** If the previous captured step was a `fill` on the
  same target label, its value is overwritten rather than a new step appended.

##### How an element gets its label

The agent walks a fixed priority list and stops at the first hit — this is what makes the recorded
labels human-readable and what the heuristic matcher later has to re-find on the real page:

1. A `<label for=…>` pointing at the element
2. An enclosing `<label>`
3. `aria-label`, then `title`
4. `placeholder`
5. Visible text, for buttons, links, and button-role elements (truncated at 40 characters)
6. The `name` attribute, then `#id`, then the element's own value if short
7. Finally, the tag name

##### Live feedback while recording

Every captured step increments the header counter, replaces the feed bar text with
*"Captured: <description>"*, and updates the floating badge inside the target page.

##### Applying the steps

- **Trigger:** *Apply Recorded Steps*.
- **Empty buffer:** a warning toast (*"No actions have been captured yet…"*) and nothing happens.
- **Otherwise:** each buffered step is appended to the end of the existing Execution Steps (recording
  augments, it never replaces), the step list re-renders — which also resets any previously generated
  output — the modal closes, and a success toast reports how many steps were added.

#### API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| Recorder proxy | GET | `/api/v1/recorder/proxy?url=&token=` | Opening the modal | SSRF-guarded; injects the recorder agent |
| Asset fallback proxy | GET | any unmatched path | Sub-resources of the proxied page | Resolves the origin from the referer or a cookie |
| Step ingest | POST | `/api/v1/recorder/ingest` | *(not reached from this UI)* | See the gap note below |
| Poll session steps | GET | `/api/v1/recorder/session/:sessionId/steps` | *(not reached from this UI)* | |

Steps actually reach the builder **in-browser**, not over HTTP: the injected agent posts each payload
to the parent window (`postMessage`) and broadcasts it on a `BroadcastChannel`, and the workspace
listens on both.

#### Page Relationships

- **From:** [Scenario Builder](#p02) — the target URL is read from it and
  the captured steps are written back to it.
- **To:** Nowhere. The recorder is a modal; closing it returns to the builder.
- **Data coupling:** Applying steps mutates the builder's step list, which in turn invalidates any
  previously generated script.

#### Business Rules

- **The target site is fetched by the server, never by the browser directly.** This is what makes
  cross-origin recording possible at all, and it is why the proxy is SSRF-guarded: an authenticated
  user must not be able to make the server fetch internal hosts, loopback addresses, private IP
  ranges, or cloud metadata endpoints. The guard runs before the request *and* again on the final URL
  after redirects.
- **Frame-blocking defences on the target are deliberately stripped** so the page renders inside the
  iframe: `X-Frame-Options`, CSP, and cross-origin isolation headers are removed from the response,
  equivalent `<meta>` tags are stripped from the HTML, and a small shim neutralises frame-buster
  scripts. A `<base>` tag is injected so relative URLs resolve against the real origin.
- **Recorded steps are drafts, not selectors.** The recorder captures a human-readable *label*; the
  actual selector is decided later by the heuristic matcher against a freshly crawled DOM. A recorded
  scenario is therefore still portable across cosmetic UI changes.
- **Buffers are bounded.** The server-side buffer, if it were reached, caps at 1000 steps per session
  and 500 concurrent sessions, clamps every field to 4096 characters, and clears wholesale every two
  hours when the session count is exceeded.

#### Known Gap

The recorder agent only POSTs to `/api/v1/recorder/ingest` when it can find a `session` identifier —
either in its own script `src` or in the page URL. The proxy injects the agent **inline**, with no
`src` and no session parameter, and the workspace never adds one to the proxy URL. In the current
build `currentSessionId` is therefore always empty, the HTTP ingest call never fires, and the
`ingest` / `session/:id/steps` / `session/:id` endpoints are unreachable from the product.

Consequences worth deciding on:

- Recording only works while the workspace tab stays open and the iframe stays same-page — there is no
  server-side buffer to recover from a reload.
- The unauthenticated `ingest` endpoint is live but unused: it is either dead code to remove, or the
  session wiring is unfinished and should be completed.

---

<a id="p04"></a>

### Flow History

> **Route:** `/` → navigation tab **Flow History**
> **Module:** Scenario Library
> **Access:** Authenticated, approved account (own records only)
> **Source:** `public/index.html` (`#tabHistory`), `public/js/app.js`, `src/server/routes/history-routes.ts`, `src/server/routes/folder-routes.ts`

#### Overview

Every script the user generates, and every time one is run, is recorded here. The tab is both an
archive and a re-entry point: scenarios are grouped into project folders, searchable and sortable, and
any record can be opened to inspect its code, its per-step matching scores, and the video of its last
execution — or loaded straight back into the builder to be re-run.

#### Layout

Single full-width card:

1. **Header** — title, a free-text search box, and a **Refresh** button.
2. **Folder tree** — a bordered, collapsible list: *All scenarios*, then each of the user's folders,
   then *Uncategorized* if any records lack a folder.
3. **Scenario table** — five columns with sortable headers.
4. **Pagination footer** — a "Showing X to Y of Z entries" counter and Previous / Next.

Opening a record raises the **Flow History Details** modal.

#### Fields

##### Region: Folder tree

| Row | Count badge | Expandable | Row actions |
| :-- | :-- | :-- | :-- |
| **All scenarios** | Total records | No | — |
| *Each folder* | Records in that folder | Yes, when the count is above zero | **Rename**, **Delete** |
| **Uncategorized** (italic, only shown when non-empty) | Records with no folder | Yes | — |

Expanding a folder lists its scenarios inline, each row showing the suite name, the date, a
**Move to…** dropdown, and a **View** button.

##### Region: Scenario table

| Column | Format | Sortable | Notes |
| :-- | :-- | :-: | :-- |
| Date & Time | Locale date-time, monospace | Yes | Default sort, descending |
| Test Suite | Plain text | Yes | |
| Target URL | Monospace, wraps on long URLs | Yes | |
| Status | Coloured pill | Yes | `GENERATED` · `RUNNING` · `SUCCESS` · `FAILED` |
| Action | Buttons | No | **View**, **Delete** (delete is styled in the warning colour) |

##### Region: Search and pagination

| Control | Behaviour |
| :-- | :-- |
| Search box | Case-insensitive substring match across suite name, target URL, and status; filters as you type and resets to page 1 |
| Column header | First click sorts (descending for date, ascending for the others), second click reverses; an arrow marks the active column |
| Previous / Next | Steps through pages of **10 records**; disabled at the ends |

##### Region: Flow History Details modal

| Section | Content |
| :-- | :-- |
| Execution Recording | HTML5 video player; the whole section is hidden when the record has no video |
| Details grid | Test Suite · Target URL · Date · Status pill, plus a **Load to Builder** button |
| Generated Playwright Code | Read-only console showing the stored code |
| Resolved Steps & Matching Scores | Table of Step / Action / Matched Selector / Score, scores at 80 or above in green, below in red |

#### Interactions

##### Opening the tab

Fetches the full history list for the current user, resets to page 1, then refreshes the folder list
and renders both the tree and the table. The list endpoint deliberately strips the heavy fields —
code, resolved steps, and logs — and returns only a summary plus a `hasVideo` flag, so a large archive
loads quickly.

**Note:** filtering, sorting, and pagination all happen in the browser over the full list. This is
fine for hundreds of records and will need revisiting for thousands.

##### Selecting a folder

Clicking any tree row sets the filter — *All scenarios* clears it, a folder restricts to that folder,
*Uncategorized* restricts to records with no folder — resets to page 1, and re-renders both the tree
(to highlight the active row) and the table. The caret toggles the inline scenario list independently
of the filter.

##### Creating a folder

Folders are created from the [Scenario Builder](#p02) via **+ New
Folder** (name up to 120 characters, optional description up to 500). A duplicate name for the same
user is rejected with *"A folder with this name already exists"*.

##### Renaming a folder

- **Trigger:** **Rename** on a folder row.
- **Behaviour:** an input dialog pre-filled with the current name; an empty name is rejected inline.
- **On confirm:** `PATCH /api/v1/folders/:id`, then the folder list, tree, and table refresh.
- **Duplicate name:** an error toast with the server message.

##### Deleting a folder

- **Trigger:** **Delete** on a folder row.
- **Confirmation:** a warning dialog naming the folder and, when it is non-empty, stating explicitly
  that *"The N scenario(s) inside will become uncategorized, not deleted."*
- **On confirm:** `DELETE /api/v1/folders/:id`. The affected scenarios move to *Uncategorized* both in
  the database (the foreign key is cleared, not cascaded) and in the local view; if the deleted folder
  was the active filter, the filter resets to *All scenarios*.

##### Moving a scenario between folders

- **Trigger:** the **Move to…** dropdown on an inline scenario row.
- **Options:** every folder the user owns (the current one disabled), plus *Uncategorized* when the
  scenario currently has a folder.
- **Behaviour:** `PATCH /api/v1/history/:id/folder`; on success the local record is updated, the tree
  and table re-render, and a *Moved* toast appears.

##### Viewing a record

- **Trigger:** **View**, from either the table or an inline folder row.
- **Behaviour:** `GET /api/v1/history/:id` returns the full record. Any stored video path is re-signed
  into a fresh one-hour playback URL at read time, so links never expire in storage and are never
  persisted in a shareable form.
- **Display:** the modal populates the details grid, the code console, the resolved-steps table, and
  the video player (hidden when there is no recording).
- **Closing** pauses the video.

##### Load to Builder

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

##### Deleting a record

- **Trigger:** **Delete** in the table.
- **Confirmation:** *"Are you sure you want to delete this flow history? This will also delete any
  associated videos."*
- **On confirm:** `DELETE /api/v1/history/:id` removes the record and the stored video object (plus,
  for legacy records, any local video file), then the list reloads.

#### API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| History list | GET | `/api/v1/history` | Tab open, Refresh, after delete | Summary fields only; optional `?folderId=` filter exists but the UI filters client-side |
| History detail | GET | `/api/v1/history/:id` | View | Owner or admin only; video URL re-signed |
| Move scenario | PATCH | `/api/v1/history/:id/folder` | Move to… | `null` moves it to uncategorized |
| Delete record | DELETE | `/api/v1/history/:id` | Delete | Also deletes the video object |
| Folder list | GET | `/api/v1/folders` | Tab open | Returns per-folder counts and an uncategorized count |
| Rename folder | PATCH | `/api/v1/folders/:id` | Rename | |
| Delete folder | DELETE | `/api/v1/folders/:id` | Delete | Scenarios survive as uncategorized |

#### Page Relationships

- **From:** the navigation bar, from any workspace tab.
- **To:** [Scenario Builder](#p02) via **Load to Builder**, carrying the
  full scenario plus a replay flag.
- **Data coupling:** every successful generation and every run in the Builder writes here. Creating a
  folder in the Builder's modal adds a row to this tree.

#### Business Rules

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

---

<a id="p05"></a>

### API Keys (Workspace)

> **Route:** `/` → navigation tab **API Keys**
> **Module:** Developer Integration
> **Access:** Authenticated, approved, **non-admin** account, and only over a web session (JWT), never via an API key
> **Source:** `public/index.html` (`#tabApiKeys`), `public/js/app.js`, `src/server/routes/api-key-routes.ts`

#### Overview

Where a user mints the credentials that let a pipeline, script, or CLI drive Tester Lab without a
browser. Keys are listed with their masked token, their usage for the current period, and their
status; the full secret is shown exactly once, at creation. A second card carries copy-ready cURL
examples for the two endpoints that matter.

The tab is **hidden for administrators**, who manage their own keys in the
[Admin Console](#p11) instead.

#### Layout

Two stacked full-width cards:

1. **Developer API Keys** — header with a one-line explanation and **+ Generate New Key**; a
   green "new key" banner that appears only right after creation; the keys table.
2. **Quick Integration Guide** — a note about the accepted auth headers plus two copyable snippets.

#### Fields

##### Region: Keys table

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

##### Region: New key banner

Appears only immediately after a key is created. Contains the warning *"Please copy this key now. For
your security, you will not be able to view it again."*, a read-only input holding the full secret,
and a copy button.

##### Region: Quick Integration Guide

| Snippet | Endpoint | Contents |
| :-- | :-- | :-- |
| Generate Playwright Test Script | `POST /api/v1/generate-script` | A cURL call with an `X-API-Key` header and a three-step login DSL against a public practice site |
| Execute Test Script on Server | `POST /api/v1/run-test` | A cURL call posting inline Playwright code with `language` and `mode` |

Both have a copy button. The header note states that the key goes in either `X-API-Key` or
`Authorization: Bearer <key>`.

**Note:** the snippets hard-code a production hostname (`https://tester-lab.mibot.my.id`) rather than
deriving it from the current origin, so they are wrong for any other deployment.

#### Interactions

##### Opening the tab

Fetches the user's keys with their usage summaries and renders the table. Nothing is paginated — the
full list is shown.

##### Generate a new key

- **Trigger:** **+ Generate New Key**.
- **Prompt:** an input dialog asking for a *API Key Name / Description* (placeholder *"e.g. CI/CD
  Pipeline, Staging Automation"*).
- **Client validation:** the name must not be blank, and must not duplicate an existing key's name
  (case-insensitive) — *"An API key named "X" already exists. Please choose a unique name."* The
  server enforces the same rule independently.
- **On success:** the full secret is written into the banner, cached in browser storage so the table's
  copy button can still reproduce it during this browser's lifetime, the table reloads, and a success
  toast appears. An `API Key Created` entry is written to the activity log.

##### Copy a key

- **From the banner:** copies the full secret.
- **From the table:** copies the cached full secret if this browser created the key. If only the
  masked prefix is available — a key created on another device, in another browser, or before this
  caching existed — the masked value is copied and a warning explains: *"This older key only has the
  prefix saved. Please generate a new key to copy in full."*

##### Revoke a key

- **Trigger:** **Revoke** on an active key.
- **Confirmation:** *"Any automation script or integration using this key will immediately stop
  working."*
- **On confirm:** the key's status becomes `REVOKED` with a revocation timestamp; it stops
  authenticating on the very next request. The row stays, now offering **Delete**. Logged as
  `API Key Revoked`.

##### Delete a key record

- **Trigger:** **Delete** on a revoked key.
- **Confirmation:** *"Permanently remove this revoked key record?"*
- **On confirm:** the record is removed, but its **usage history is preserved** — before deletion the
  key's name is copied onto its usage-log rows and the foreign key is cleared, so the admin usage log
  still shows what that key did, labelled *"<name> (Deleted)"*. Logged as `API Key Deleted`.

#### API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| List keys | GET | `/api/v1/api-keys` | Tab open, after any mutation | Returns each key with its usage summary for the current period |
| Create key | POST | `/api/v1/api-keys` | Generate New Key | Returns the raw key **once**; 201 Created |
| Revoke key | DELETE | `/api/v1/api-keys/:id` | Revoke | Sets status to revoked |
| Delete key | DELETE | `/api/v1/api-keys/:id/delete` | Delete | Hard delete, usage logs retained |

All four require a JWT session; an API key presented to these endpoints is rejected with *"This
operation requires a standard Web UI session token."*

#### Page Relationships

- **From:** the workspace navigation bar (hidden for admins).
- **To:** nowhere — this tab is terminal. The generated key is used against
  [the generation and execution API](#p12).
- **Data coupling:** every API-key-authenticated call to `generate-script` or `run-test` writes a
  usage row, which changes the Usage column here and feeds the
  [admin usage dashboard](#p11).

#### Business Rules

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

---

<a id="p06"></a>

### Feedback

> **Surface:** Floating button (bottom-right) on the workspace, opening a modal
> **Module:** Feedback
> **Access:** The button is rendered on the workspace page; the submit endpoint itself is **unauthenticated**
> **Source:** `public/index.html` (`#feedbackModal`), `public/js/app.js`, `src/server/routes/feedback-routes.ts`

#### Overview

A always-available channel for users to report a bug or suggest an improvement, with an optional
screenshot. Submissions land in the [Admin Feedbacks](#p09) console.

#### Layout

A compact modal (520 px) with a header, three stacked form controls, and a right-aligned
Cancel / Submit pair.

#### Fields

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

#### Interactions

##### Opening

Clicking the floating **Feedback** button shows the modal and clears both the details textarea and the
file input, so each report starts blank.

##### Submitting

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

#### API Dependencies

| API | Method | Path | Trigger | Auth | Notes |
| :-- | :-: | :-- | :-- | :-- | :-- |
| Submit feedback | POST | `/api/v1/feedback` | Submit | **None** | Accepts type, details, and an optional base64 image |

#### Page Relationships

- **From:** the floating button on the workspace.
- **To:** nowhere for the user. Administrators read submissions in
  [Admin — Feedbacks](#p09).

#### Business Rules

- **Feedback is anonymous.** No user id, username, or session is attached to the record — only the
  type, the text, the optional attachment, and a timestamp. An administrator therefore cannot reply to
  or follow up with the reporter, and cannot tell two reporters apart. If attribution is wanted, this
  is the change to make.
- **The endpoint is open to the internet.** It requires no authentication and has no rate limiting, so
  it is exposed to spam and to storage abuse bounded only by the per-file size limit.
- **Attachments are images only, and private.** They live in a private bucket and are surfaced to
  admins exclusively through short-lived signed URLs.
- **Deleting a feedback record deletes its attachment**, performed by the admin console.

---

<a id="p07"></a>

### Admin — User Management

> **Route:** `/admin` → tab **User Management** (default tab)
> **Module:** Administration
> **Access:** Admin only
> **Source:** `public/admin.html`, `src/server/routes/admin-routes.ts`

#### Overview

The approval desk. Every registration request lands here as a `pending` row that an administrator
approves or rejects, and every existing account is listed with its role, status, and registration
date. This is the only place an account can be activated, so nobody reaches the product without
passing through this table.

#### Layout

The Admin Console is a standalone page with its own header (brand link back to the workspace, theme
toggle, a badge showing the signed-in admin's username and role, and Sign Out) and a five-button tab
bar: **User Management** · Activity Logs · Feedbacks · System Configuration · API Keys.

This tab holds a single card: a title, the subtitle *"Review, approve, or reject pending account
requests for Tester Lab"*, the accounts table, and a pagination footer.

#### Fields

##### Region: Accounts table

| Column | Format | Notes |
| :-- | :-- | :-- |
| Username | Bold text | |
| Email | Plain text | As supplied at registration |
| Role | Monospace | `admin` or `user` |
| Status | Coloured chip | `PENDING` (amber) · `APPROVED` (green) · `REJECTED` (red) |
| Registered At | Locale date-time | |
| Actions | Buttons | Depends on status — see below |

##### Region: Row actions

| Account status | Buttons offered |
| :-- | :-- |
| `pending` | **Approve** (green) · **Reject** (red) · **Delete** |
| `rejected` | **Approve** (green) · **Delete** |
| `approved` | *(the word "Approved")* · **Delete** |

The account literally named `admin` is exempt from **Delete**; every other account, including other
administrators, can be deleted from here.

##### Region: Pagination

10 rows per page, with Previous / Next and a *"Page X of Y"* label. Paging happens in the browser over
the full list returned by the API, which is unpaginated.

#### Interactions

##### Opening the console

Before anything renders, the page verifies the session: without a token it redirects to the workspace
immediately; with a token it calls `GET /api/v1/auth/me` and, if the role is not `admin`, shows an
*Access Denied* toast and redirects after about a second. On success the admin badge is filled in and
users, activity logs, and feedbacks are all fetched up front.

##### Approving an account

- **Trigger:** **Approve**.
- **Behaviour:** `POST /api/v1/admin/users/:id/approve` sets the status to `approved`.
- **On success:** a success toast (*"Account 'X' approved successfully."*) and the table reloads. An
  `Admin Approve` entry naming the affected user is written to the activity log.
- **Effect on the user:** they can sign in from that moment; if they already hold a valid token, their
  very next request succeeds, because status is re-read from the database on every call.
- **Not found:** 404 with *"User not found."*

##### Rejecting an account

- **Trigger:** **Reject**.
- **Behaviour:** `POST /api/v1/admin/users/:id/reject` sets the status to `rejected`.
- **On success:** an informational toast and a table reload; logged as `Admin Reject`.
- **Effect on the user:** login is refused with an explanatory message, and any live session stops
  working on its next request. **Rejection is reversible** — a rejected row still offers Approve.

##### Deleting an account

- **Trigger:** **Delete**.
- **Confirmation:** *"Are you sure you want to delete this user account? This action cannot be
  undone."*
- **On confirm:** `DELETE /api/v1/admin/users/:id`. Because of the database's cascade rules, deleting
  a user also removes their folders, their entire flow history, and their API keys. Logged as
  `Admin Delete` with the user id.
- **Not covered by the cascade:** the user's stored videos and their API-key usage log rows survive,
  since those references are cleared rather than cascaded.

#### API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| List users | GET | `/api/v1/admin/users` | Console load, tab switch, after any action | Returns every account, oldest first; no pagination, no password hashes |
| Approve | POST | `/api/v1/admin/users/:id/approve` | Approve | |
| Reject | POST | `/api/v1/admin/users/:id/reject` | Reject | |
| Delete | DELETE | `/api/v1/admin/users/:id` | Delete | Cascades to folders, history, and API keys |
| Verify session | GET | `/api/v1/auth/me` | Console load | Gates the whole page |

#### Page Relationships

- **From:** the *Admin Console* link in the workspace header, visible only to admins.
- **To:** the workspace, via the brand link or a failed authorisation check; the other four console
  tabs.
- **Data coupling:** approving or rejecting an account changes what
  [Sign In](#p01) does for that person. Every action here appears in
  [Activity Logs](#p08).

#### Business Rules

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

---

<a id="p08"></a>

### Admin — Activity Logs

> **Route:** `/admin` → tab **Activity Logs**
> **Module:** Administration
> **Access:** Admin only
> **Source:** `public/admin.html`, `src/server/routes/admin-routes.ts`, `src/server/activity-log-store.ts`

#### Overview

The system's audit trail. Every meaningful action — sign-in attempts, registrations, script
generations, test runs, blocked code, folder and API-key changes, and every administrative decision —
is recorded with who did it, what they did, and when. This tab is read-only: entries cannot be edited,
deleted, or exported from the UI.

#### Layout

One card titled *Activity Logs*, subtitled *"Recent user activities and system events"*, containing
the log table and a pagination footer.

#### Fields

| Column | Format | Notes |
| :-- | :-- | :-- |
| Timestamp | Locale date-time | Newest first |
| Username | Plain text | The actor. `System` when no user could be identified |
| Action | Short label | See the catalogue below |
| Details | Free text | Context: which URL, which user, which key, why it failed |

10 rows per page, Previous / Next, paged in the browser.

#### Recorded actions

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

#### Interactions

##### Opening the tab

Fetches `GET /api/v1/admin/logs` and renders page 1. The console requests no explicit limit, so the
server's default applies: **the most recent 200 entries**. Older history exists in the database but is
not reachable from this screen.

##### Paging

Previous / Next move through the fetched 200 entries, 10 at a time. There is no search, no filter by
user or action, and no date range.

##### Refreshing

There is no refresh button on this tab — the list reloads when the console is opened. Switching away
and back does *not* refetch, because the tab only fetches when its cached list is empty.

#### API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| List logs | GET | `/api/v1/admin/logs?limit=` | Console load | Newest first; server default limit 200, capped only by what the caller asks for |

#### Page Relationships

- **From:** the Admin Console tab bar.
- **To:** nowhere — this tab is terminal and read-only.
- **Data coupling:** almost every action in the product writes here, including actions taken in the
  other admin tabs.

#### Business Rules

- **Logging never breaks the action.** If writing a log entry fails, the store returns a synthetic
  entry and the originating request still succeeds. Availability of the feature beats completeness of
  the audit trail.
- **Failed logins are logged with the attempted username**, even when no such account exists — useful
  for spotting credential-stuffing, and worth knowing when considering retention.
- **The trail is append-only from the product's perspective.** Nothing in the UI or the API deletes or
  edits log entries; pruning would have to happen in the database.
- **Actor identity is a snapshot.** The username is copied into the row at write time, so entries
  remain readable after the account is deleted, even though the user id reference is gone.

---

<a id="p09"></a>

### Admin — Feedbacks

> **Route:** `/admin` → tab **Feedbacks**
> **Module:** Administration
> **Access:** Admin only
> **Source:** `public/admin.html`, `src/server/routes/admin-routes.ts`, `src/server/services/attachment-service.ts`

#### Overview

The inbox for everything users report through the floating [Feedback](#p06) button.
Each row shows when it arrived, what kind of problem it is, the full description, and a link to the
attached screenshot if there is one. Administrators can read and delete; there is no triage state,
assignment, or reply.

#### Layout

One card titled *User Feedbacks*, subtitled *"Review feedback and bug reports from users"*, containing
the table and a pagination footer.

#### Fields

| Column | Format | Notes |
| :-- | :-- | :-- |
| Timestamp | Locale date-time | Newest first |
| Type | Chip | `Functional` · `Defect` · `Cosmetic` |
| Details | Wrapping text, up to 400 px wide | The reporter's full description |
| Attached File | **View File ↗** link, or italic *No File* | Opens the screenshot in a new tab |
| Actions | **Delete** button (warning colour) | |

10 rows per page, Previous / Next, paged in the browser.

#### Interactions

##### Opening the tab

Fetches `GET /api/v1/admin/feedbacks?limit=1000`. Each returned record is enriched server-side with a
freshly signed one-hour URL for its attachment, so the link works without exposing the bucket.

##### Viewing an attachment

The link prefers the signed URL supplied with the record. If that is missing — signing failed, or the
record predates signed URLs — it falls back to `/feedbacks/attachments/<filename>?token=<jwt>`, a
server route that re-signs and redirects, and which is itself admin-gated. Links open in a new tab
with `noopener`.

##### Deleting a feedback record

- **Trigger:** **Delete**.
- **Confirmation:** a warning dialog.
- **On confirm:** `DELETE /api/v1/admin/feedbacks/:id` removes the stored attachment from the bucket
  first, then the database row, and writes an `Admin Delete Feedback` entry to the activity log.
- **Not found:** 404 with *"Feedback not found"*.

#### API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| List feedbacks | GET | `/api/v1/admin/feedbacks?page=&limit=` | Tab open | Server-side pagination available (defaults page 1, limit 10) plus a total count; the console asks for 1000 and pages in the browser |
| Delete feedback | DELETE | `/api/v1/admin/feedbacks/:id` | Delete | Removes the attachment then the row |
| Attachment redirect | GET | `/feedbacks/attachments/:filename` | Fallback link | Admin-gated; signs and redirects, falling back to a public URL if signing fails |

#### Page Relationships

- **From:** the Admin Console tab bar.
- **To:** an external tab, when opening an attachment.
- **Data coupling:** rows originate from the [Feedback modal](#p06); deletions
  appear in [Activity Logs](#p08).

#### Business Rules

- **Feedback is anonymous by design of the data model** — there is no reporter field to display, so
  administrators cannot follow up. See the [Feedback modal](#p06) business rules.
- **There is no workflow state.** No open/closed, no severity, no assignee, no comments. The only
  lifecycle transition available is deletion.
- **Attachments are always private.** Nothing in the product ever hands out a durable public URL for
  a screenshot; every link is a one-hour signature minted at read time.
- **The list is effectively capped at 1000 records.** Beyond that, older feedback exists in the
  database but cannot be reached from the console, because the browser paginates a single fixed-size
  fetch. Switching to the endpoint's real server-side pagination would fix this.

---

<a id="p10"></a>

### Admin — System Configuration

> **Route:** `/admin` → tab **System Configuration**
> **Module:** Administration
> **Access:** Read requires any authenticated account; write is admin only
> **Source:** `public/admin.html`, `src/server/routes/config-routes.ts`, `src/server/config-store.ts`

#### Overview

One shared setting: the **sample flow** that every user gets when they click *Load Sample Flow* in the
Scenario Builder. An administrator uses this tab to give new users a working, house-specific starting
point instead of a blank form — typically a login flow against the organisation's own staging
environment.

Despite the tab's broad name, this is the only configuration it manages. Everything else — ports,
timeouts, concurrency limits, credentials, the usage-reset window — lives in environment variables and
is not editable from any screen.

#### Layout

A single card headed *System Configuration* with a **Save** button in the top-right, and one section
below the divider titled *Sample Flow Configuration* holding three stacked fields.

#### Fields

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

#### Interactions

##### Opening the tab

`GET /api/v1/config` is called every time the tab is selected (unlike the other tabs, which cache),
and the three fields are populated. The steps array is rendered as pretty-printed JSON with two-space
indentation. An unconfigured system returns empty strings and an empty array.

##### Saving

- **Trigger:** **Save**.
- **Client validation:** the steps textarea must parse as JSON *and* be an array; otherwise an error
  toast reads *"Execution Steps must be a valid JSON array."* and nothing is sent.
- **Behaviour:** `POST /api/v1/config` with the suite name, target URL, and parsed steps.
- **Server validation:** all three must be present and the steps must be an array, otherwise 400 with
  *"Missing or invalid configuration fields"*.
- **On success:** a *"Configuration saved successfully."* toast and the in-page cache is refreshed.
- **On failure:** an error toast with the server message.

##### Effect on users

The configuration is a single shared row — there is no per-user or per-team variant. The next time any
user opens the workspace, their session picks up the new sample; users already signed in keep the
previously loaded copy until they reload the page.

#### API Dependencies

| API | Method | Path | Trigger | Auth | Notes |
| :-- | :-: | :-- | :-- | :-- | :-- |
| Read config | GET | `/api/v1/config` | Tab open; also on every workspace sign-in | Any authenticated caller | Notably **not** gated on approved status |
| Write config | POST | `/api/v1/config` | Save | Admin only | Upserts the single configuration row |

#### Page Relationships

- **From:** the Admin Console tab bar.
- **To:** nowhere directly.
- **Data coupling:** what is saved here is exactly what *Load Sample Flow* produces in the
  [Scenario Builder](#p02). If the sample is empty, that button shows a
  warning telling the user to contact an administrator.

#### Business Rules

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

---

<a id="p11"></a>

### Admin — API Keys & Usage

> **Route:** `/admin` → tab **API Keys**, with two sub-tabs
> **Module:** Administration
> **Access:** Admin only (the page); the key list itself is scoped to the signed-in admin
> **Source:** `public/admin.html`, `src/server/routes/api-key-routes.ts`, `src/server/api-key-admin-store.ts`

#### Overview

Two jobs share this tab. **API Keys Management** is the administrator's own key wallet — identical in
behaviour to the [workspace API Keys tab](#p05), which is hidden for admins.
**Hit & Usage Activity Logs** is the genuinely administrative half: a system-wide dashboard of how the
API is being used, across every key and every user.

#### Layout

A sub-tab bar with two pill buttons, then one of two panes:

**Sub-tab 1 — API Keys Management**
- *Admin Developer API Keys* card: **+ Generate New Key**, the one-time new-key banner, and the keys
  table.
- *Quick Integration Guide* card: the same two copyable cURL snippets as the workspace tab.

**Sub-tab 2 — Hit & Usage Activity Logs**
- Four aggregate stat cards.
- *API Key Hit & Usage Activity Logs* card with a **Refresh Logs** button, the log table, and
  server-side pagination.

#### Fields

##### Sub-tab 1: Keys table

Identical columns and actions to the workspace tab — Key Name, API Key Token (masked, copyable),
Usage (Monthly), Created, Last Used, Status, Action (**Revoke** while active, **Delete** once
revoked). See [Page 5](#p05) for the full field and interaction detail.

##### Sub-tab 2: Aggregate stat cards

| Card | Value | Subtext |
| :-- | :-- | :-- |
| Total Hits (Monthly) | All usage events in the current window | *"N-day reset window"*, filled from the server |
| Code Generated (blue) | Events with status `generated` | `/api/v1/generate-script` |
| Successful Runs (green) | Events with status `success` | Passed test executions |
| Failed Hits (red) | Events with status `failed` | Errors and test failures |

Numbers are locale-formatted with thousands separators.

##### Sub-tab 2: Usage log table

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

#### Interactions

##### Opening the tab

Selecting **API Keys** loads the admin's own keys and shows sub-tab 1. Sub-tab 2 is not loaded until
it is selected.

##### Switching to Hit & Usage Activity Logs

Fetches the aggregate stats and the first page of logs together. **Refresh Logs** re-fetches both, so
the stat cards never drift from the rows beneath them. Paging also re-queries the server.

##### Key lifecycle (sub-tab 1)

Generate, copy, revoke, and delete behave exactly as on the
[workspace API Keys page](#p05), including the create-time uniqueness check on
the key name, the show-once secret, and the preservation of usage history when a key record is
deleted.

#### API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| List own keys | GET | `/api/v1/api-keys` | Tab open | **Scoped to the admin's own keys** |
| Create / revoke / delete key | POST, DELETE | `/api/v1/api-keys[...]` | Key actions | JWT-only |
| Aggregate stats | GET | `/api/v1/admin/api-keys/stats` | Sub-tab 2 open, Refresh | System-wide, current window |
| Usage logs | GET | `/api/v1/admin/api-keys/logs?page=&limit=` | Sub-tab 2 open, Refresh, paging | System-wide, newest first, 15 per page |

#### Page Relationships

- **From:** the Admin Console tab bar.
- **To:** nowhere; both sub-tabs are terminal.
- **Data coupling:** every API-key-authenticated call to `generate-script` or `run-test` writes a
  usage row that appears here and in that key owner's Usage column.

#### Business Rules

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

---

## Part III — Backend, API & Tooling

<a id="p12"></a>

### Generation & Execution API

> **Endpoints:** `POST /api/v1/generate-script` · `POST /api/v1/inspect-dom` · `POST /api/v1/run-test`
> **Module:** Generation Engine
> **Access:** Authenticated (JWT or API key) **and** approved
> **Source:** `src/server/routes/test-routes.ts`, `src/index.ts`, `src/crawler/`, `src/matcher/`, `src/generator/`, `src/validator/`, `src/server/services/test-runner-service.ts`

#### Overview

The product's core capability, exposed as three endpoints that the web workspace and any external
integration use identically. `generate-script` runs the whole pipeline from business description to
finished test file; `inspect-dom` exposes just the crawler for debugging what the engine can see; and
`run-test` executes a script and returns its logs and a video.

#### The pipeline

A single `generate-script` call performs six stages in order:

| # | Stage | What it does |
| :-: | :-- | :-- |
| 1 | **Validate & normalise** | Checks the DSL against a schema. Also repairs common variants: missing step numbers are filled in sequentially, the actions `type` and `input` are rewritten to `fill`, and a `target` key is accepted as an alias for `targetLabel`. |
| 2 | **Crawl with state transitions** | Launches headless Chromium, opens the target URL, and then walks the steps *one at a time* — extracting the candidate elements visible right now, matching the current step, then actually performing that action so the next step sees the page as it will really be. |
| 3 | **Score & match** | Every candidate on the current page is scored against the step's target label using the deterministic matrix; the highest score wins, ties break toward the top-left element. |
| 4 | **Resolve a selector** | The winning element is turned into the most stable locator strategy it supports. |
| 5 | **Transpile** | The resolved steps are rendered through the framework's template and, for Playwright and Cypress, formatted. |
| 6 | **Dry-run & self-heal** *(optional)* | The script is executed headlessly. If it fails, the failing step is retried with its runner-up candidate; if that passes, the healed script replaces the original. |

Stage 2 is what makes multi-page flows work: a login form's second page simply does not exist in the
DOM until the first page has been submitted, so a single-snapshot crawler could never match it.

#### Scoring matrix

| Priority | Rule | Score | Resulting locator |
| :-: | :-- | :-: | :-- |
| 1 | Exact test-id match (`data-testid`, `data-test`, `data-qa`, `data-cy`, `data-testing`) | 100 (short-circuits) | `getByTestId` |
| 2 | Associated label — exact / partial | 90 / 75 | `getByLabel` |
| 3 | ARIA role plus accessible name — exact / partial | 88 / 70 | `getByRole` |
| 4 | Visible text — exact / partial | 85 / 60 | `getByText` |
| 5 | Placeholder or aria-label — exact / partial | 80 / 65 | `getByPlaceholder` |
| — | Exact `id` / `name` attribute (only when nothing above scored 60) | 60 / 55 | CSS locator |
| — | Bag-of-words token match (only below 50) | 65 / 60 / 45 | varies |
| 6 | Fuzzy Levenshtein, 60% similarity or better (only when nothing else scored) | up to 50 | text locator |

Only the single best attribute contributes — scores do not accumulate across rules — which keeps the
numbers comparable between steps and pages. Small action-appropriateness bonuses are then added
(+5 clicking a real button or link, +5 filling a real input, +15 uploading to a file input, +15
asserting against a pure text node).

Hard filters run first: hidden elements and `input[type=hidden]` score zero for any interaction, a
`fill` or `select` against a non-fillable element scores zero outright, and a `click` on a bare
`div`/`span`/`p`/`label` with no role, id, or test-id is penalised 20 points.

#### Endpoint: POST /api/v1/generate-script

**Request**

| Field | Type | Required | Description |
| :-- | :-- | :-: | :-- |
| `dsl` | object | Yes | The scenario — see the [DSL schema](#ax-enum) |
| `dsl.testSuite` | string | Yes | Non-empty; names the test |
| `dsl.targetUrl` | string | Yes | Must parse as an `http`/`https` URL |
| `dsl.framework` | enum | No | `playwright` (default) · `cypress` · `selenium` · `robotframework` |
| `dsl.language` | enum | No | `typescript` (default) · `javascript` · `python` · `robot` |
| `dsl.viewport` | `{width, height}` | No | Defaults to 1280 × 720 |
| `dsl.steps[]` | array | Yes | At least one step |
| `dryRun` | boolean | No | Run headless verification after generating |
| `outPath` | string | No | Server-side path to also write the file to |
| `folderId` | string | **Yes** | Must be a folder the caller owns (admins may use any) |

**Response (200)** — `historyId`, `code`, `resolvedSteps[]`, `warnings[]`, `logs[]`, and when a dry run
ran, `dryRunPassed` and `dryRunError`.

Each resolved step reports its action, target, the chosen `selectorType` and `selectorValue`, the
match score, a human-readable match reason, the top five ranked candidates, and any warning.

**Errors**

| Condition | HTTP | Body |
| :-- | :-: | :-- |
| `dsl` missing | 400 | *Missing required field: dsl* |
| `folderId` missing or not a string | 400 | *Please select or create a folder before generating a script.* |
| Folder does not exist or is not the caller's | 400 | *Invalid folder. Select one of your own folders.* |
| DSL validation or generation failed | 422 | `errors[]` — one message per schema violation |
| Unexpected failure | 500 | `error` |

**Side effects:** an activity-log entry (`Generate Script` or `Generate Script Failed`); a usage row
when the caller authenticated with an API key; and on success a Flow History record with status
`GENERATED` holding the code, the resolved steps, and the raw DSL.

**Warnings that do not fail the request** — these appear in `warnings[]` and as comments in the
generated code:

| Warning | Meaning |
| :-- | :-- |
| Low match score (0) for target | Nothing on the page matched; a bare text locator is emitted as a fallback |
| Ambiguous Element Detected | Several candidates tied on the top score; the top-left one was chosen |
| Auto-corrected action from `select` to `fill` | The resolved element is not a `<select>` |
| URL Assertion Failed (Score 0) | At crawl time the page was not at the expected URL, usually because an earlier step failed |
| Self-Healed: Fallback to Rank 2 candidate | The dry run repaired this step |

#### Endpoint: POST /api/v1/inspect-dom

**Request:** `url` (required) and an optional `viewport`.

**Response (200):** the URL, a candidate count, and the full candidate list — for each element its
tag, id, name, test-id, placeholder, aria-label, inner text, associated label, role, type, href,
value, visibility, iframe context, and bounding box.

Useful for answering "why did it match that?" before writing a scenario. Note that this endpoint
launches a browser but writes **no** history, activity log, or usage row.

#### Endpoint: POST /api/v1/run-test

**Request**

| Field | Type | Required | Description |
| :-- | :-- | :-: | :-- |
| `code` | string | Yes | The script to execute |
| `mode` | enum | No | `headless` (default) or `headed` |
| `language` | enum | No | `typescript` (default) or `javascript` — decides the temp file extension |
| `historyId` | string | No | Existing record to update |
| `saveAsNewHistory` | boolean | No | Create a new record instead of updating (the replay case) |
| `testSuite`, `targetUrl`, `rawDsl`, `resolvedSteps`, `folderId` | mixed | No | Used only when creating a new record |

**Response (200):** `success`, `logs`, `durationMs`, `videoUrl` (a one-hour signed URL) when a
recording was produced, and `historyId`.

**Errors**

| Condition | HTTP | Body |
| :-- | :-: | :-- |
| `code` missing or not a string | 400 | *Missing required field: code* |
| Code matched the sanitizer blocklist | 403 | *Submitted code contains blocked patterns…* plus `violations[]` |
| Unexpected failure | 500 | `error` |

**Execution environment:** a fresh temporary directory per run, holding the script and a generated
Playwright configuration with video recording always on, a 1280 × 720 viewport, and a timeout taken
from the environment (120 s by default). Headed mode adds a one-second slow-motion delay and, on
Linux without a display, wraps the command in a virtual framebuffer. The child process receives a
**stripped environment** — only the variables Playwright genuinely needs, never the JWT secret,
database credentials, or the admin password. The temporary directory is deleted afterwards, and any
recording is uploaded to a private bucket under the caller's user id.

#### Security controls

| Control | Applies to | Behaviour |
| :-- | :-- | :-- |
| **Code sanitizer** | `run-test` and every dry run, including self-healed code | Rejects the script if it references process internals or `process.env`, `child_process` or any exec helper, synchronous filesystem calls, `eval` / `new Function` / `.constructor` / `Reflect` / `globalThis`, path-disclosure globals (`__dirname`, `__filename`, `process.cwd()`, `process.argv`, `import.meta`), or any import or `require` that is not from `@playwright/...` |
| **Environment allowlist** | Every child process | Only path, locale, display, temp, and Playwright-related variables are passed through |
| **Template literal escaping** | Code generation | Every interpolated value is escaped for its target language — JavaScript/TypeScript string literals, Python literals, and Robot Framework cells (line breaks and multi-space separators collapsed) — so a scenario value cannot break out of a string and inject code |
| **Concurrency limiter** | Generation and execution | Separate queues, 5 and 3 concurrent by default, so a burst waits instead of exhausting browser processes |

#### Consumers

| Consumer | How it calls in |
| :-- | :-- |
| [Scenario Builder](#p02) | JWT session, from the browser |
| CI pipelines and scripts | API key in `X-API-Key` or as a bearer token |
| [CLI and library](#p15) | Not over HTTP — the same engine invoked in-process |

#### Business Rules

- **Determinism is the product promise.** The same DSL against the same page always yields the same
  script: no model, no randomness, no network calls to a third party.
- **Generation is expensive and honest about it.** Every call launches a real browser and walks the
  real application, which is why it is queued and why the crawl performs the steps as it goes.
- **Folders are enforced at the API, not just the UI.** An integration cannot bypass the folder
  requirement, so no scenario is ever orphaned at creation.
- **A failed match never fails the request.** The engine emits a fallback text locator and a warning,
  so the user gets a script to inspect and fix rather than an error — deliberate, because a partially
  wrong script is more useful than nothing.
- **Assertions are checked twice.** URL assertions are evaluated during the crawl (producing a warning
  when the page did not transition as expected) and again in the emitted script at runtime.
- **The emitted Playwright script is defensive.** It wraps each interaction in a retry helper that
  waits for the element, scrolls the page, and retries up to 15 times — so a script survives lazy
  loading and slow single-page-app rendering without hand-tuning.

---

<a id="p13"></a>

### Scenario Library API

> **Endpoints:** `/api/v1/history` · `/api/v1/history/:id` · `/api/v1/history/:id/folder` · `/api/v1/folders` · `/api/v1/folders/:id`
> **Module:** Scenario Library
> **Access:** Authenticated (JWT or API key) **and** approved; ownership-checked per record
> **Source:** `src/server/routes/history-routes.ts`, `src/server/routes/folder-routes.ts`, `src/server/flow-history-store.ts`, `src/server/folder-store.ts`

#### Overview

The persistence layer behind [Flow History](#p04): the record of every
generated scenario and every execution, plus the per-user folders that organise them. Records are
written by the generation and execution endpoints and read, moved, or deleted here.

#### Resource: Flow History

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

##### GET /api/v1/history

Returns the caller's records, newest first, as **summaries only** — id, folder, timestamp, suite,
target URL, status, duration, and a `hasVideo` boolean. Code, steps, and logs are deliberately
omitted so the list stays light.

Optional `?folderId=<id>` filters to one folder, and `?folderId=none` to uncategorized records. The
web UI does not use this parameter, filtering client-side instead.

##### GET /api/v1/history/:id

Returns the full record. The stored video path is exchanged for a fresh one-hour signed URL at read
time, so playback links are always valid and never durable.

| Condition | HTTP |
| :-- | :-: |
| No such record | 404 |
| Record belongs to someone else (and the caller is not an admin) | 403 |

##### PATCH /api/v1/history/:id/folder

Body: `folderId` — a string to move the scenario into that folder, or `null` to make it
uncategorized. The target folder must exist and belong to the caller (admins are exempt). Returns
*"Scenario moved successfully"*.

| Condition | HTTP | Message |
| :-- | :-: | :-- |
| Record not found | 404 | *History record not found* |
| Not the owner | 403 | *Unauthorized to modify this record* |
| `folderId` is neither a string nor null | 400 | *folderId must be a string or null* |
| Folder unknown or not the caller's | 400 | *Invalid folder* |

##### DELETE /api/v1/history/:id

Deletes the record **and** its video object from storage (with a legacy fallback that removes an old
local file if one exists). Ownership is checked exactly as for reads. A storage failure is logged as a
warning and does not block the database deletion.

#### Resource: Folders

A folder is a per-user project grouping. Fields: `id`, `userId`, `name`, `description`, `createdAt`.

##### GET /api/v1/folders

Returns the caller's folders, oldest first, each carrying a `scenarioCount`, plus a top-level
`uncategorizedCount`. Counts are computed by reading the caller's full history and tallying in
application code rather than by a grouped query — correct, but it does read every record on each call.

##### POST /api/v1/folders

| Field | Type | Required | Validation |
| :-- | :-- | :-: | :-- |
| `name` | string | Yes | Trimmed; must be non-empty and at most 120 characters |
| `description` | string | No | Trimmed and truncated to 500 characters |

| Condition | HTTP | Message |
| :-- | :-: | :-- |
| Name missing, blank, or too long | 400 | *Folder name is required (max 120 characters)* |
| Name already used by this user | 409 | *A folder with this name already exists* |

Writes a `Create Folder` activity-log entry.

##### PATCH /api/v1/folders/:id

Updates `name` and/or `description` with the same validation and the same duplicate rule. Ownership is
checked (404 if unknown, 403 if someone else's; admins exempt).

##### DELETE /api/v1/folders/:id

Deletes the folder. **Scenarios inside are not deleted** — the database clears their folder reference,
so they become uncategorized. The response says so explicitly: *"Folder deleted. Scenarios inside are
now uncategorized."* Writes a `Delete Folder` activity-log entry.

#### Business Rules

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
  coexist. See the [Data Model](#ax-data).
- **Deleting a user removes their folders and history**, by database cascade — but not their stored
  videos, which are only removed when a history record is deleted individually.

#### Consumers

| Consumer | Usage |
| :-- | :-- |
| [Flow History](#p04) | Every operation on this page |
| [Scenario Builder](#p02) | Folder list and folder creation |
| [Generation API](#p12) | Validates the folder, then writes and updates records |

---

<a id="p14"></a>

### Recorder API & Reverse Proxy

> **Endpoints:** `GET /api/v1/recorder/proxy` · `POST /api/v1/recorder/ingest` · `GET /api/v1/recorder/session/:sessionId/steps` · `DELETE /api/v1/recorder/session/:sessionId` · plus a catch-all asset proxy
> **Module:** Scenario Authoring
> **Access:** Mixed — see the table below
> **Source:** `src/server/routes/recorder-routes.ts`, `src/server/services/recorder-proxy-service.ts`, `src/security/url-guard.ts`

#### Overview

The server-side half of the [Interaction Recorder](#p03). Its job is to make a
third-party website render inside the Tester Lab workspace and report what the tester does to it. That
requires fetching the site server-side, neutralising the defences that stop pages being framed, and
injecting a small capture agent — each of which carries a security consequence the design has to
answer for.

#### Endpoints

| Endpoint | Method | Auth | Purpose |
| :-- | :-: | :-- | :-- |
| `/api/v1/recorder/proxy?url=` | GET | JWT or API key, approved (accepts `?token=` because iframes cannot send headers) | Fetch and serve the target page with the agent injected |
| *(catch-all middleware)* | any | None | Proxy sub-resources — scripts, styles, chunks, images — for the page currently being recorded |
| `/api/v1/recorder/ingest` | POST | **None** | Receive a captured step from the injected agent |
| `/api/v1/recorder/session/:sessionId/steps` | GET | JWT or API key, approved | Poll the buffered steps for a session |
| `/api/v1/recorder/session/:sessionId` | DELETE | JWT or API key, approved | End a session and discard its buffer |

#### GET /api/v1/recorder/proxy

**Request:** `url` — the target page. **Response:** the target's HTML, rewritten.

Processing order:

1. Reject anything that is not a syntactically valid `http`/`https` URL.
2. Run the SSRF guard (below); reject with 400 and a reason if it fails.
3. Fetch the target, following redirects, forwarding the caller's user agent, accept, and language
   headers and presenting itself as a top-level navigation.
4. **Re-run the SSRF guard on the final URL** — a redirect must not be able to land on an internal
   address.
5. Set a cookie recording the resolved origin, so sub-resource requests can be attributed.
6. Strip `X-Frame-Options`, both CSP headers, and the three cross-origin isolation headers from the
   response; explicitly allow framing.
7. For HTML: strip equivalent `<meta>` tags, then inject a `<base>` tag pointing at the final URL, a
   shim that neutralises frame-buster scripts, and the recorder agent inlined into a `<script>` tag.
   Non-HTML responses are passed through with their content type intact.
8. On any network failure, return 502 with the underlying message.

##### SSRF guard

Rejected before any request is made:

| Rejected | Examples |
| :-- | :-- |
| Non-HTTP schemes | `file:`, `gopher:`, `ftp:` |
| Internal hostnames | `localhost`, `*.localhost`, `*.local`, `*.internal` |
| Private and reserved IPv4 | `0.0.0.0/8`, `10/8`, `127/8`, `169.254/16` (including the cloud metadata address `169.254.169.254`), `172.16/12`, `192.168/16`, `100.64/10`, `192.0.0/24`, `198.18/15`, and everything from `224.0.0.0` up |
| Internal IPv6 | `::1`, `::`, `fe80::/10`, `fc00::/7`, and IPv4-mapped forms of the above |

**Documented residual risk:** the guard is hostname-based and performs no DNS resolution, so a
hostname that resolves to an internal address (DNS rebinding) is not caught. This is acknowledged in
the source. Resolving the host and validating the resolved addresses — and pinning the connection to
them — would close it.

#### Asset fallback proxy

A catch-all middleware registered after all real routes. Any request it cannot attribute is passed
straight through to the normal 404 handling.

- **Skipped entirely** for `/api/*`, `/`, `/admin`, `/css/*`, and `/js/*` — the application's own
  surfaces are never proxied.
- **Origin resolution:** first from a referer that itself points at the proxy endpoint, otherwise from
  the origin cookie the proxy set. It is deliberately resolved **per request**, never from shared
  mutable server state, so two users recording different sites cannot cross over.
- **Re-validated** by the same SSRF guard before fetching.
- HTML responses fetched this way also get the recorder agent injected.

#### POST /api/v1/recorder/ingest — unauthenticated by design

This endpoint is called from inside a third-party page, so it cannot carry the user's credentials.
It is therefore treated as hostile input and bounded on every axis:

| Guard | Limit |
| :-- | :-- |
| Session id format | Must match `[A-Za-z0-9_-]{8,128}` |
| Steps per session | 1000, then 429 |
| Concurrent sessions | 500, then 429 |
| Field length | Every string clamped to 4096 characters; the action name to 64 |
| Storage | An in-memory map only — it never touches the database or the filesystem |
| Reaping | The whole map is cleared every two hours if it has exceeded the session cap |

It also merges consecutive `fill` steps on the same target label, exactly as the browser-side buffer
does. CORS is opened (`*`) for this endpoint and its preflight, which it must be to work at all.

#### Known gap: the ingest path is currently unreachable

The injected agent only calls `ingest` when it can find a `session` identifier — from its own script
`src` query string, or from the page URL. But the proxy injects the agent **inline**, so there is no
`src`, and the workspace never adds a `session` parameter to the proxy URL. The session id is
therefore always empty and the HTTP call never fires.

In the shipped product, captured steps travel only through the browser: the agent posts each payload
to the parent window and broadcasts it on a channel, and the workspace listens on both.

**Consequences to decide on:**

- The `ingest`, `session/:id/steps`, and `session/:id` endpoints are dead code paths — either remove
  them, or finish the wiring by generating a session id in the workspace and passing it through the
  proxy URL into the injected script.
- Without the server-side buffer there is no recovery: reloading the workspace tab loses everything
  captured so far.
- An unauthenticated, CORS-open endpoint is exposed with no product benefit today. Bounded as it is,
  the exposure is small, but it is non-zero.

#### Business Rules

- **Recording is a deliberate weakening of the browser's protections, contained to one iframe.** The
  product exists to drive other people's applications, so frame protections must come off — but only
  for the specific page a signed-in, approved user asked to record, fetched through a guard that
  refuses internal targets.
- **The proxy carries no credentials of its own.** It forwards no cookies or authorization to the
  target, so it can only fetch what an anonymous visitor could — which also means sites behind a login
  cannot be recorded past their sign-in page unless that sign-in happens inside the recorder.
- **The session token appears in a URL.** The workspace passes the JWT as a query parameter because an
  iframe navigation cannot carry headers. That value can end up in server logs and browser history; a
  short-lived, single-purpose recorder token would be safer than the full session token.

---

<a id="p15"></a>

### CLI & Library API

> **Surfaces:** the `test-gen` command-line binary, and the `tester-lab` package used programmatically
> **Module:** Generation Engine
> **Access:** Local process — no authentication, no accounts, no database
> **Source:** `src/cli/index.ts`, `src/index.ts`, `scripts/generate-yaml.ts`, `examples/`

#### Overview

The same generation engine the web product uses, available without the web product. A team can keep
scenarios as files in their repository and generate test scripts in a build step, or embed the
generator in their own tooling — with no server, no Supabase, and no account.

This is also the scope boundary the project publishes: the engine, the CLI, and the library are
open-source under AGPL-3.0; the managed multi-tenant service around them is developed separately.

#### CLI: `test-gen`

Installed as a binary by the package; also runnable directly from the built output.

##### `test-gen generate`

Generates a test script from a scenario file.

| Option | Required | Description |
| :-- | :-: | :-- |
| `-c, --config <path>` | Yes | Path to a JSON or YAML DSL file; the format is detected from the extension |
| `-o, --out <path>` | No | Where to write the generated script; parent directories are created |
| `-d, --dry-run` | No | Execute the script headlessly after generating, with self-healing |

**Output:** a generation summary (one line per step, showing the action, the matched target, the
chosen locator, and the score), then any warnings, then the dry-run verdict if requested, then the
full generated code.

**Exit codes:** `0` on success; `1` if the config file is missing, if generation failed validation, or
on any fatal error. A *failed dry run does not fail the command* — it is reported but the exit code
stays 0, which matters for anyone wiring this into CI expecting a non-zero signal.

##### `test-gen inspect`

| Option | Required | Description |
| :-- | :-: | :-- |
| `-u, --url <url>` | Yes | Page to crawl |

Prints every interactive candidate the crawler found, with all of its attributes — the diagnostic tool
for "why did it match that element?".

#### Library API

The package exports the full pipeline and each stage individually:

| Export | Purpose |
| :-- | :-- |
| `TestScriptGenerator` | The orchestrator — `generate(dsl, { outPath, dryRun })` runs all six stages |
| `validateDSL` | Schema validation and normalisation, standalone |
| `DOMExtractor` | The headless crawler |
| `HeuristicMatcher` | Step-to-element matching |
| `CodeGenerator` | Template rendering and formatting |
| `DryRunEngine` | Headless verification with self-healing |
| *types* | The full domain type surface — DSL, candidates, resolved steps, results |

`generate` returns success, the code, the resolved steps, warnings, logs, and — when a dry run
ran — whether it passed and any error.

#### Supporting scripts

| Script | Purpose |
| :-- | :-- |
| `npm run demo` | Serves a local demo target application to generate against |
| `npm run gen-yaml` | Helper for producing YAML scenario files |
| `npm test` | Builds the project, then runs the repository's security checks |

An example YAML scenario for a Google Form survey ships in `examples/`.

#### Differences from the hosted product

| Aspect | Web product | CLI / library |
| :-- | :-- | :-- |
| Authentication | Required, approval-gated | None |
| Folder | Mandatory | Not applicable |
| History | Every generation and run recorded | Nothing persisted |
| Video | Recorded and stored for runs | Not applicable — the CLI does not run tests, only dry-runs them |
| Concurrency | Server-side queue | Whatever the caller does |
| Code sanitizer | Enforced on execution and dry runs | Enforced on dry runs |
| Output | Returned to the browser | Printed, and optionally written to a file |

#### Business Rules

- **Same engine, same results.** The CLI, the library, and the API share one implementation, so a
  script generated in CI is identical to one generated in the workspace from the same DSL.
- **Nothing leaves the machine except the crawl itself.** The only outbound traffic is the headless
  browser visiting the target URL.
- **YAML and JSON are interchangeable** at every entry point, and the normaliser accepts common
  variants (`type`/`input` for `fill`, `target` for `targetLabel`, missing step numbers).
- **Dry runs execute real code and are sanitised accordingly**, including any self-healed variant.
- **The published scope is the engine.** Multi-tenant key management, quotas, the dashboard, and
  distributed execution orchestration are explicitly outside this repository.

---

## Part IV — Appendices

<a id="ax-enum"></a>

### Enum Dictionary

Every fixed value, status code, and configurable limit in the system, with its meaning and where it
comes from.

---

#### DSL

##### Step actions

The complete set a scenario step may use.

| Value | UI label | Target required | Value required | Meaning |
| :-- | :-- | :-: | :-: | :-- |
| `fill` | Fill Input | Yes | Yes | Type text into an input or textarea |
| `click` | Click Element | Yes | No | Click a button, link, or clickable element |
| `select` | Select Option | Yes | Yes | Choose an option in a dropdown |
| `check` | Check | Yes | No | Tick a checkbox or radio |
| `uncheck` | Uncheck | Yes | No | Untick a checkbox |
| `upload` | Upload File | Yes | Yes (a file path) | Attach a file to a file input |
| `assert_text` | Assert Text | Yes | Yes (`expected`) | Verify an element contains the expected text |
| `assert_url` | Assert URL | **No** | Yes (`expected`, or `value`) | Verify the page URL matches |
| `assert_visible` | Assert Visible | Yes | No | Verify an element is visible |
| `wait` | Wait Delay | **No** | Yes (milliseconds) | Pause; defaults to 1000 ms if unparseable |

**Accepted aliases** (rewritten during normalisation): `type` → `fill`, `input` → `fill`,
`target` → `targetLabel`. Missing `step` numbers are filled in sequentially.

##### Step options

| Option | Type | Meaning |
| :-- | :-- | :-- |
| `timeout` | positive number | Per-step timeout |
| `force` | boolean | Bypass actionability checks |
| `iframeSelector` | string | Resolve the element inside this iframe |
| `exact` | boolean | Require an exact text match |

These are accepted and carried through to the resolved step, but the current templates do not emit
them — a defined but unused extension point.

##### Frameworks and languages

| Framework | Valid languages | Template | Output extension |
| :-- | :-- | :-- | :-- |
| `playwright` *(default)* | `typescript` *(default)*, `javascript` | `playwright-ts.hbs` / `playwright-js.hbs` | `.spec.ts` / `.spec.js` |
| `cypress` | `javascript` | `cypress-js.hbs` | `.cy.js` |
| `selenium` | `python` | `selenium-py.hbs` | `.py` |
| `robotframework` | `robot` | `robot-rf.hbs` | `.robot` |

Only Playwright and Cypress output is passed through the code formatter.

##### Viewport

Optional `{ width, height }`, both positive. Defaults to **1280 × 720** in the crawler, the dry run,
and test execution alike.

---

#### Matching and selectors

##### Selector types

| Value | Emitted as (Playwright) | Chosen when |
| :-- | :-- | :-- |
| `getByTestId` | `page.getByTestId(...)` | The element carries any recognised test-id attribute |
| `getByRole` | `page.getByRole(role, { name })` | The role is `radio`, `checkbox`, `button`, `link`, `option`, or `tab`; or a non-`<select>` combobox with a real label |
| `getByLabel` | `page.getByLabel(...)` | A genuinely associated label exists (`label[for]`, a wrapping label, `aria-label`, or `aria-labelledby`) |
| `getByPlaceholder` | `page.getByPlaceholder(...)` | The element has a placeholder |
| `getByText` | `page.getByText(...)` | Only visible text is available |
| `locator` | `page.locator(...)` | CSS fallback — `tag[name=…]`, `#id`, `[name=…]`, or `text="…"` |
| `url` | `expect(page).toHaveURL(...)` | Used exclusively for `assert_url` steps |

Recognised test-id attributes, in priority order: `data-testid`, `data-test`, `data-qa`, `data-cy`,
`data-testing`.

**Deliberate restriction:** `getByLabel` is only chosen for *genuinely associated* labels. A merely
adjacent `<label>` without a `for` attribute is not matched by the framework at runtime, so the
resolver falls through to placeholder, name, or role instead — this prevents a common class of
generated-but-broken selector.

##### Scoring matrix

| Rule | Exact | Partial | Notes |
| :-- | :-: | :-: | :-- |
| Direct test-id match | **100** | — | Short-circuits; nothing else is evaluated |
| Associated label | 90 | 75 | Partial requires both strings over 3 characters and either a prefix match of 4+ characters or a length ratio of at least 0.35 |
| ARIA role + accessible name | 88 | 70 | Same partial-match rule |
| Inner text | 85 | 60 | Same partial-match rule |
| Placeholder | 80 | 65 | Same partial-match rule |
| Aria-label (standalone) | 80 | 65 | Same partial-match rule |
| Exact `id` attribute | 60 | — | Only evaluated when the score so far is below 60 |
| Exact `name` attribute | 55 | — | Only evaluated when the score so far is below 60 |
| Token match on label or placeholder | 65 | — | Only below 50; order-independent word-set comparison |
| Token match on name or id | 60 | — | Only below 50 |
| Partial token match | 45 | — | Only below 50 |
| Levenshtein fuzzy | up to 50 | — | Only when nothing else scored; requires 60% similarity |

Only the **single best** primary attribute contributes; scores never accumulate across rules.

**Action bonuses** (added when the score is already above zero):

| Bonus | Condition |
| :-: | :-- |
| +5 | `click` on a real `<button>` or `<a>` |
| +5 | `fill` on a genuinely fillable input |
| +15 | `upload` targeting a file input or any `<input>` |
| +15 | `assert_text` / `assert_visible` on a pure text node |

**Hard filters** (applied before scoring):

| Result | Condition |
| :-- | :-- |
| Score 0, *"Element is hidden or not visible"* | The element is invisible or `input[type=hidden]`, for any interactive action |
| Score 0, *"Cannot perform fill on non-input…"* | `fill` or `select` against a non-fillable element |
| −20 | `click` on a bare `div`/`span`/`p`/`label` with no role, test-id, or id |

**UI score threshold:** the matching tables colour a score green at **80 or above**, red below.

---

#### Accounts and access

##### User role

| Value | Meaning |
| :-- | :-- |
| `user` | Default for every registration. Full access to the workspace once approved |
| `admin` | Additionally reaches the Admin Console and may read, move, or delete any user's scenarios and folders |

There is no UI for changing a role.

##### User status

| Value | Set when | Can sign in | Can call the API |
| :-- | :-- | :-: | :-: |
| `pending` | On registration | No | No |
| `approved` | An admin approves, or the bootstrap admin is created | Yes | Yes |
| `rejected` | An admin rejects | No | No |

Rejection is reversible — a rejected account can still be approved later.

##### Authentication methods

| Method | Header / parameter | Accepted where |
| :-- | :-- | :-- |
| JWT bearer | `Authorization: Bearer <jwt>` | Everywhere |
| API key | `X-API-Key: tl_live_…` | Everywhere except API-key management |
| API key as bearer | `Authorization: Bearer tl_live_…` | Same as above |
| Query token | `?token=<jwt>` | Iframe and media loads (recorder proxy, attachment redirect) |

Token lifetime: **7 days**. Key prefix: `tl_live_`, followed by 32 random bytes in hexadecimal.
Masked display format: the first 16 characters, an ellipsis, and the last 4.

##### API key status

| Value | Meaning |
| :-- | :-- |
| `active` | Authenticates requests; `last_used_at` is stamped on each use |
| `revoked` | Rejected immediately; the record remains and can then be deleted |

---

#### Records and telemetry

##### Flow History status

| Value | Set when | UI pill |
| :-- | :-- | :-- |
| `GENERATED` | A script is generated | Neutral |
| `RUNNING` | An execution starts | Amber |
| `SUCCESS` | An execution passes | Green |
| `FAILED` | An execution fails | Red |

##### API-key usage endpoints and statuses

| Endpoint | Status | Written when |
| :-- | :-- | :-- |
| `generate-script` | `generated` | Generation succeeded |
| `generate-script` | `failed` | Generation failed validation or the pipeline |
| `run-test` | `success` | The test passed |
| `run-test` | `failed` | The test failed, or the sanitizer blocked the code |

Aggregation also accepts the legacy synonyms `passed` (counted as success) and `failure` (counted as
failed). Usage rows are written **only** for API-key-authenticated requests.

##### Feedback types

| Stored value | UI label |
| :-- | :-- |
| `Functional` | Functional (Bug / Logic Error) |
| `Defect` | Defect (Crash / Error Page) |
| `Cosmetic` | Cosmetic (UI / Design Issue) |

##### Activity-log actions

`Register` · `Register Failed` · `Login Success` · `Login Failed` · `Generate Script` ·
`Generate Script Failed` · `Run Test` · `Run Test Blocked` · `Create Folder` · `Delete Folder` ·
`API Key Created` · `API Key Revoked` · `API Key Deleted` · `Admin Approve` · `Admin Reject` ·
`Admin Delete` · `Admin Delete Feedback`

##### Snackbar types

`success` · `error` · `warning` · `info` — each with its own icon and colour; default duration
3500 ms.

---

#### Limits and configuration

##### Environment variables

| Variable | Default | Effect |
| :-- | :-- | :-- |
| `PORT` | `3000` | HTTP listen port |
| `HOST` | `0.0.0.0` | Listen address (used by the deployment configuration) |
| `ADMIN_USERNAME` | `admin` | Bootstrap admin, re-synced on every start |
| `ADMIN_EMAIL` | `admin@testerlab.com` | Bootstrap admin email |
| `ADMIN_PASSWORD` | `AdminPassword123!` | Bootstrap admin password — **must be overridden in any real deployment** |
| `JWT_SECRET` | random per process | Signing key. When unset, a warning is logged and sessions do not survive a restart |
| `PLAYWRIGHT_TIMEOUT` | `120000` ms | Test timeout for generated scripts and manual runs |
| `MAX_CONCURRENT_TESTS` | `3` | Parallel test executions |
| `MAX_CONCURRENT_GENERATIONS` | `5` | Parallel script generations |
| `API_KEY_USAGE_RESET_DAYS` | `30` | Rolling window for usage statistics |
| `MAX_FEEDBACK_FILE_SIZE` | `5242880` (5 MB) | Feedback attachment size cap |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | — | Database and storage credentials |

##### Hard-coded limits

| Limit | Value | Where |
| :-- | :-: | :-- |
| Request body size | 10 MB | Express JSON parser — also the ceiling for base64 feedback attachments |
| Folder name | 120 characters | Folder create and update |
| Folder description | 500 characters (truncated, not rejected) | Folder create and update |
| Recorder session id | 8–128 characters, `[A-Za-z0-9_-]` | Ingest endpoint |
| Recorder steps per session | 1000 | Ingest endpoint |
| Recorder concurrent sessions | 500 | Ingest endpoint |
| Recorder field length | 4096 characters (action name: 64) | Ingest endpoint |
| Recorder buffer reaping | every 2 hours when over the session cap | Ingest endpoint |
| In-memory usage-log buffer | 5000 entries | Usage store fallback |
| Ranked candidates retained per step | top 5 | Matcher — the runner-up drives self-healing |
| Self-healing retry attempts | 1 (rank-2 candidate for the failing step only) | Dry-run engine |
| Generated-script retry loop | 15 attempts per interaction, with a scroll between each | Playwright template |
| Signed URL lifetime | 3600 s | Videos and feedback attachments |
| Activity-log page size | 200 (server default) | Admin logs endpoint |
| Admin feedback page size | 10 (server default); the console requests 1000 | Admin feedbacks endpoint |
| Admin API-key log page size | 15 | Admin usage-log endpoint |
| Client-side table page size | 10 | Flow History and every admin table |
| Crawler navigation timeouts | 15 s goto, 1 s network-idle, 2 s first-element wait | DOM extractor |
| Post-action settle delay | 1000 ms after a click, 100 ms otherwise | DOM extractor |
| Dry-run test timeout | 60 s | Dry-run engine |
| Headed-mode slow motion | 1000 ms per action | Test runner |
| Password minimum length | 6 characters | Registration |
| Feedback attachment formats | `.png` `.jpg` `.jpeg` `.bmp` | Feedback endpoint |

##### Blocked code patterns

Any of these in submitted or dry-run code causes rejection: `process.env`, bracket access to
`process`, `process.exit`, `process.kill`, process internals (`binding`, `mainModule`, `dlopen`),
`child_process`, `execSync`, `execFileSync`, `spawnSync`, `execFile`, the synchronous `fs` calls
(`readFileSync`, `writeFileSync`, `readdirSync`, `unlinkSync`, `rmSync`), `eval(`, `new Function(`,
the `Function` constructor, `.constructor`, `Reflect.get/apply/construct/set`, `globalThis`,
`__dirname`, `__filename`, `process.cwd()`, `process.argv`, `import.meta`, dynamic `import(`, and any
`require` or `import` whose source is not `@playwright/...`.

##### Browser storage keys

| Key | Contents |
| :-- | :-- |
| `tester_jwt_token` | The session token |
| `tester_lab_theme` | `light` or `dark` |
| `tester_apikey_<id>` | The full API key, cached at creation so the table's copy button works |
| `tester_apikey_prefix_<prefix>` | The same value, keyed by masked prefix |

---

<a id="ax-data"></a>

### Data Model

PostgreSQL (Supabase) schema plus the two storage buckets. Source: `supabase/schema.sql` and the
store modules under `src/server/`.

---

#### Entity relationships

```
users ──┬── folders ──┐
        │             │ (ON DELETE SET NULL)
        ├── flow_history ◄─┘
        ├── api_keys ─── api_key_usage_logs   (ON DELETE SET NULL)
        └── activity_logs                     (no FK — user_id is a loose reference)

app_config   (single row, no relationships)
feedbacks    (anonymous, no relationships)
```

All cascades from `users` are `ON DELETE CASCADE`. Deleting a user therefore removes their folders,
their entire history, and their API keys — but their activity-log entries and API-key usage rows
survive, because those references are loose or cleared rather than cascaded.

---

#### `users`

| Column | Type | Constraints |
| :-- | :-- | :-- |
| `id` | TEXT | Primary key. Application-generated: `usr_<timestamp>_<random>`; the bootstrap admin is the fixed `usr_admin_env` |
| `username` | TEXT | Not null, **unique**; indexed lower-cased for case-insensitive lookup |
| `email` | TEXT | Not null; no format or uniqueness constraint |
| `password_hash` | TEXT | Not null; bcrypt, 10 rounds |
| `role` | TEXT | Not null, default `user`, check `admin` / `user` |
| `status` | TEXT | Not null, default `pending`, check `pending` / `approved` / `rejected` |
| `created_at` | TIMESTAMPTZ | Not null, default now |

**Note:** emails are neither unique nor validated server-side — two accounts may share one, and the
only format check is the browser's `type=email`.

#### `folders`

| Column | Type | Constraints |
| :-- | :-- | :-- |
| `id` | UUID | Primary key, generated |
| `user_id` | TEXT | Not null, references `users(id)` ON DELETE CASCADE; indexed |
| `name` | TEXT | Not null |
| `description` | TEXT | Not null, default empty |
| `created_at` | TIMESTAMPTZ | Not null, default now |
| — | — | `UNIQUE (user_id, name)` |

**Discrepancy:** the schema comment says *"A user cannot have two folders with the same name
(case-insensitive)"*, but the constraint is a plain unique index on the raw values. *Project Alpha*
and *project alpha* can coexist. Either the comment or the constraint should change — a
`UNIQUE (user_id, lower(name))` expression index would deliver what the comment promises. Contrast
API-key names, which the application compares case-insensitively before inserting.

#### `flow_history`

| Column | Type | Constraints |
| :-- | :-- | :-- |
| `id` | UUID | Primary key, generated |
| `user_id` | TEXT | Not null, references `users(id)` ON DELETE CASCADE; indexed |
| `username` | TEXT | Not null — denormalised so records stay readable after account deletion |
| `folder_id` | UUID | References `folders(id)` **ON DELETE SET NULL**; indexed; added by an idempotent migration for pre-folders databases |
| `timestamp` | TIMESTAMPTZ | Not null, default now; indexed descending |
| `test_suite` | TEXT | Not null, default empty |
| `target_url` | TEXT | Not null, default empty |
| `status` | TEXT | Not null, default `GENERATED`, check `GENERATED` / `RUNNING` / `SUCCESS` / `FAILED` |
| `generated_code` | TEXT | Not null, default empty; overwritten with the exact code each run executes |
| `resolved_steps` | JSONB | Not null, default `[]` |
| `raw_dsl` | JSONB | Nullable — absent on records predating DSL storage |
| `video_url` | TEXT | Nullable. Holds a **durable bucket path**, not a URL; legacy rows may hold a full URL or a local path, and both readers handle that |
| `run_logs` | TEXT | Nullable |
| `duration_ms` | INTEGER | Nullable |

The `ON DELETE SET NULL` on `folder_id` is what makes "deleting a folder never deletes work" a
database guarantee rather than a UI convention.

#### `activity_logs`

| Column | Type | Constraints |
| :-- | :-- | :-- |
| `id` | TEXT | Primary key. Application-generated: `log_<timestamp>_<random>` |
| `user_id` | TEXT | Nullable, **no foreign key** — entries survive account deletion |
| `username` | TEXT | Not null; the actor's name, or `System` |
| `action` | TEXT | Not null |
| `details` | TEXT | Not null, default empty |
| `timestamp` | TIMESTAMPTZ | Not null, default now; indexed descending |

#### `app_config`

| Column | Type | Constraints |
| :-- | :-- | :-- |
| `id` | INTEGER | Primary key, default 1, **check `id = 1`** — structurally a single row |
| `sample_test_suite` | TEXT | Not null, default empty |
| `sample_target_url` | TEXT | Not null, default empty |
| `sample_steps` | JSONB | Not null, default `[]` |
| `updated_at` | TIMESTAMPTZ | Not null, default now |

Seeded with an empty row on schema creation. No history, no versioning, no per-user variant.

#### `feedbacks`

| Column | Type | Constraints |
| :-- | :-- | :-- |
| `id` | UUID | Primary key; the application supplies it so the attachment filename can match |
| `timestamp` | TIMESTAMPTZ | Not null, default now; indexed descending |
| `type` | TEXT | Not null — no check constraint, so any string is accepted |
| `details` | TEXT | Not null |
| `attachment` | TEXT | Nullable; the object name in the bucket, `<feedbackId><ext>` |

**No reporter column.** Feedback is structurally anonymous — an administrator cannot attribute,
reply to, or de-duplicate by reporter.

#### `api_keys`

| Column | Type | Constraints |
| :-- | :-- | :-- |
| `id` | UUID | Primary key, generated |
| `user_id` | TEXT | Not null, references `users(id)` ON DELETE CASCADE; indexed |
| `name` | TEXT | Not null, default `Default API Key`; uniqueness per user is enforced **in application code**, case-insensitively — not by a constraint |
| `key_hash` | TEXT | Not null, **unique**; SHA-256 of the raw key; indexed |
| `key_prefix` | TEXT | Not null; the masked display form |
| `status` | TEXT | Not null, default `active`, check `active` / `revoked` |
| `created_at` | TIMESTAMPTZ | Not null, default now |
| `last_used_at` | TIMESTAMPTZ | Nullable; stamped on every successful authentication |
| `revoked_at` | TIMESTAMPTZ | Nullable |

The raw key exists only in the creation response. Lookup is by hash, so the plaintext is never needed
again.

#### `api_key_usage_logs`

| Column | Type | Constraints |
| :-- | :-- | :-- |
| `id` | UUID | Primary key, generated |
| `api_key_id` | UUID | Nullable, references `api_keys(id)` **ON DELETE SET NULL**; indexed with `created_at` |
| `key_name` | TEXT | Nullable; copied onto the row when its key is deleted, so the audit trail keeps a readable name |
| `user_id` | TEXT | Not null, **no foreign key** |
| `endpoint` | TEXT | Not null — `generate-script` or `run-test` |
| `status` | TEXT | Not null — `generated`, `success`, or `failed` |
| `details` | TEXT | Nullable |
| `created_at` | TIMESTAMPTZ | Not null, default now; indexed by key, by user, and by status |

Neither `endpoint` nor `status` has a check constraint; the allowed values are enforced only by the
TypeScript types at the call sites.

---

#### Row Level Security

RLS is enabled on all eight tables, and each carries exactly one policy: **full access for
`service_role`**, for every operation, unconditionally.

This is a deliberate posture, not an oversight. The server is the only client, it holds the service
role key, and all authorisation — ownership, roles, approval status — is enforced in application code.
The policies exist so that a leaked anon key grants nothing.

The trade-off worth stating: there is no defence in depth at the row level. A bug in an application
ownership check is not caught by the database. Should the anon key ever be used directly (for
example, a future client-side integration), per-user policies would need writing from scratch.

---

#### Storage buckets

| Bucket | Public | Contents | Object naming | Lifecycle |
| :-- | :-: | :-- | :-- | :-- |
| `test-videos` | **No** | WebM recordings of test executions | `<sanitizedUserId>/run_<timestamp>.webm` | Uploaded after a run; deleted with its history record |
| `feedback-attachments` | **No** | Screenshots attached to feedback | `<feedbackId><ext>` | Uploaded with the feedback; deleted with the record |

Both are created (or forced private) by the schema script, and `service_role` has unrestricted access
to storage objects. Every read is served through a signed URL valid for one hour, minted at read time.
The user id in a video path is sanitised to alphanumerics, hyphens, and underscores before being used
as a path segment.

**Legacy handling:** older `video_url` values may hold a full public URL or a path relative to the
public directory. The path normaliser strips everything up to and including `/test-videos/`, and the
delete routine additionally removes a matching local file if one exists.

---

<a id="ax-api"></a>

### API Inventory

Every HTTP endpoint the server exposes, with its authentication requirement and behaviour.

**Authentication legend**

| Symbol | Meaning |
| :-- | :-- |
| **Public** | No credentials required |
| **Auth** | A valid JWT or API key |
| **Auth + Approved** | Valid credentials *and* account status `approved` |
| **JWT only** | A browser session token; API keys are explicitly rejected |
| **Admin** | Valid JWT and role `admin` |

All responses are JSON with a `success` boolean; failures carry an `error` string. A global handler
guarantees JSON for anything under `/api/`, and unmatched `/api/*` paths return 404 with the method
and URL echoed back.

---

#### Authentication — `/api/v1/auth`

| Method | Path | Auth | Description |
| :-: | :-- | :-- | :-- |
| POST | `/register` | Public | Create an account. Always `user` / `pending`. 201 on success; 400 on missing fields or a password under 6 characters; 409 if the username is taken |
| POST | `/login` | Public | Exchange credentials for a 7-day JWT. 401 for bad credentials; 403 for a pending or rejected account |
| GET | `/me` | Auth | The current user's profile. Used to gate both the workspace and the admin console |

#### Generation & Execution — `/api/v1`

| Method | Path | Auth | Description |
| :-: | :-- | :-- | :-- |
| POST | `/generate-script` | Auth + Approved | Run the full pipeline. Requires an owned `folderId`. 422 with `errors[]` on DSL failure. Writes history, an activity log, and (for key auth) a usage row |
| POST | `/inspect-dom` | Auth + Approved | Crawl a URL and return its interactive element candidates. No records written |
| POST | `/run-test` | Auth + Approved | Execute a script. 403 with `violations[]` if the sanitizer rejects it. Returns logs, duration, and a signed video URL |

#### Scenario Library — `/api/v1/history`, `/api/v1/folders`

| Method | Path | Auth | Description |
| :-: | :-- | :-- | :-- |
| GET | `/history` | Auth + Approved | The caller's records as summaries. Optional `?folderId=<id>` or `?folderId=none` |
| GET | `/history/:id` | Auth + Approved, owner or admin | Full record; the video path is re-signed on read |
| PATCH | `/history/:id/folder` | Auth + Approved, owner or admin | Move to a folder, or `null` for uncategorized |
| DELETE | `/history/:id` | Auth + Approved, owner or admin | Delete the record and its video |
| GET | `/folders` | Auth + Approved | The caller's folders with scenario counts, plus an uncategorized count |
| POST | `/folders` | Auth + Approved | Create. 409 on a duplicate name |
| PATCH | `/folders/:id` | Auth + Approved, owner or admin | Rename or re-describe. 409 on a duplicate name |
| DELETE | `/folders/:id` | Auth + Approved, owner or admin | Delete; scenarios inside become uncategorized |

#### API Keys — `/api/v1/api-keys`

Every endpoint here is **Auth + Approved + JWT only**.

| Method | Path | Description |
| :-: | :-- | :-- |
| GET | `/` | The caller's keys, each with a usage summary for the current window |
| POST | `/` | Create a key. Returns the raw secret **once**. 201. Duplicate names rejected |
| DELETE | `/:id` | Revoke — the key stops authenticating, the record remains |
| DELETE | `/:id/delete` | Hard delete; usage logs are relabelled and retained |

#### Configuration — `/api/v1/config`

| Method | Path | Auth | Description |
| :-: | :-- | :-- | :-- |
| GET | `/` | **Auth** (approval *not* checked) | The shared sample-scenario configuration |
| POST | `/` | Admin | Replace it. 400 if the suite, URL, or steps array is missing or malformed |

#### Feedback — `/api/v1/feedback`

| Method | Path | Auth | Description |
| :-: | :-- | :-- | :-- |
| POST | `/` | **Public** | Submit feedback with an optional base64 image. 400 on a bad extension or an oversized file |

#### Recorder — `/api/v1/recorder`

| Method | Path | Auth | Description |
| :-: | :-- | :-- | :-- |
| GET | `/proxy?url=` | Auth + Approved (accepts `?token=`) | SSRF-guarded reverse proxy that injects the recorder agent |
| OPTIONS | `/ingest` | Public | CORS preflight |
| POST | `/ingest` | **Public** | Buffer a captured step. Strict validation and hard caps. *Unreachable from the current UI* |
| GET | `/session/:sessionId/steps` | Auth + Approved | Poll a session's buffer. *Unused by the current UI* |
| DELETE | `/session/:sessionId` | Auth + Approved | Discard a session's buffer. *Unused by the current UI* |

#### Administration — `/api/v1/admin`

Every endpoint here is **Admin**.

| Method | Path | Description |
| :-: | :-- | :-- |
| GET | `/users` | Every account, oldest first, without password hashes |
| POST | `/users/:id/approve` | Set status `approved`. 404 if unknown |
| POST | `/users/:id/reject` | Set status `rejected`. 404 if unknown |
| DELETE | `/users/:id` | Delete the account, cascading to folders, history, and keys |
| GET | `/logs?limit=` | Activity log, newest first. Default limit 200 |
| GET | `/feedbacks?page=&limit=` | Paginated feedback with signed attachment URLs and a total count. Defaults page 1, limit 10 |
| DELETE | `/feedbacks/:id` | Delete the record and its attachment |
| GET | `/api-keys/stats` | System-wide usage totals for the current window |
| GET | `/api-keys/logs?page=&limit=` | System-wide usage log, newest first. Default limit 15 |

#### Non-API routes

| Method | Path | Auth | Description |
| :-: | :-- | :-- | :-- |
| GET | `/` | Public | The workspace single-page application |
| GET | `/admin` | Public (the page); the client immediately enforces admin | The admin console page |
| GET | `/feedbacks/attachments/:filename` | Admin (accepts `?token=`) | Signs and redirects to a feedback attachment; falls back to a public URL if signing fails |
| GET | `/css/*`, `/js/*`, `/favicon.jpg` | Public | Static assets |
| *any* | *(unmatched)* | Public | Asset-proxy middleware — forwards to the origin currently being recorded, when one can be attributed; otherwise falls through to 404 |

---

#### Cross-cutting behaviour

| Concern | Behaviour |
| :-- | :-- |
| Request size | 10 MB JSON limit |
| Error shape | `{ success: false, error: "…" }`; DSL failures add `errors[]`, sanitizer rejections add `violations[]` |
| Rate limiting | **None anywhere** — including on login, registration, feedback, and the recorder ingest endpoint |
| CORS | Not configured globally; opened to `*` only on the recorder ingest and proxy responses |
| Concurrency | Generation and execution pass through separate in-memory queues (5 and 3 by default) |
| Logging | Every meaningful action writes an activity-log row; API-key-authenticated generation and execution additionally write a usage row |
| Auth failures | Always 401 with a message distinguishing an invalid key, an expired session, and a missing credential |
| Ownership failures | 403 with an explicit message; admins bypass ownership on history and folders |

##### Observations worth acting on

- **No rate limiting exists.** Login and registration are brute-forceable, and the public feedback and
  recorder-ingest endpoints are open to abuse bounded only by their size caps.
- **`GET /api/v1/config` does not check approval status**, unlike every other authenticated endpoint.
  Currently harmless — a pending account cannot obtain a token — but it is an inconsistency in the
  gate.
- **The attachment redirect falls back to a public URL** if signing fails. Since the bucket is
  private that fallback yields a non-working link rather than a leak, but the intent reads as though a
  public URL were expected — worth removing.
- **The recorder ingest and session endpoints are unreachable** from the product; see
  [Page 14](#p14).

---

<a id="ax-rel"></a>

### Page Relationships

How the surfaces connect, what they pass to each other, and which actions ripple across screens.

---

#### Navigation map

```
                        ┌──────────────────────────┐
                        │  Sign In / Request Access│
                        └────────────┬─────────────┘
                                     │ successful login
                                     ▼
        ┌──────────────────── WORKSPACE  /  ────────────────────┐
        │                                                       │
   ┌────▼────────────┐   ┌─────────────────┐   ┌────────────────▼───┐
   │ Scenario Builder│◄──┤  Flow History   │   │     API Keys       │
   │   (default)     │   │                 │   │ (hidden for admins)│
   └────┬───────┬────┘   └─────────────────┘   └────────────────────┘
        │       │
        │       └──────────► Create Folder (modal)
        └──────────────────► Interaction Recorder (modal)

   Floating Feedback button ─────────► Feedback (modal)

   Header (admins only) ─────────────► ADMIN CONSOLE  /admin
                                        ├── User Management (default)
                                        ├── Activity Logs
                                        ├── Feedbacks
                                        ├── System Configuration
                                        └── API Keys ─┬─ Management
                                                      └─ Hit & Usage Logs
```

Sign Out, from either the workspace or the console, returns to Sign In. Opening `/admin` without an
admin role redirects to the workspace after an *Access Denied* toast.

---

#### Transitions that carry data

| From | To | Trigger | What travels |
| :-- | :-- | :-- | :-- |
| Sign In | Scenario Builder | Successful login | JWT stored; the sample configuration and folder list are fetched immediately |
| Flow History detail | Scenario Builder | **Load to Builder** | Suite name, target URL, framework, language, steps (from the raw DSL, or reverse-parsed from the code for older records), folder selection, the generated code, the history id, and a **replay flag** |
| Scenario Builder | Interaction Recorder | **Record Steps** | The target URL, and the session token in the proxy URL |
| Interaction Recorder | Scenario Builder | **Apply Recorded Steps** | The captured step list, appended to the existing steps |
| Scenario Builder | Create Folder modal | **+ New Folder** | Nothing in; a new folder id out, selected on return |
| Any workspace tab | Feedback modal | Floating button | Nothing — the report is anonymous |
| Workspace header | Admin Console | **Admin Console** link | The JWT, read from browser storage by the console page |

The **replay flag** is the subtle one: it makes the next run create a *new* history record instead of
overwriting the loaded one, then clears itself once the new record's id is adopted.

---

#### Data coupling

| Action | Immediately affects | Visible next time |
| :-- | :-- | :-- |
| Generate a script | Creates a `GENERATED` history record; writes an activity log; writes a usage row for key auth | Flow History table and folder counts; Admin activity log; API-key usage |
| Run a test | Sets the record to `RUNNING`, then `SUCCESS`/`FAILED` with logs, duration, and video; writes an activity log and possibly a usage row | Flow History status column and detail modal; Admin logs and usage dashboard |
| Create a folder | Adds a folder; writes an activity log | Builder folder selector *and* History folder tree, both refreshed on the spot |
| Rename a folder | Updates the folder | Folder tree and the builder selector on next load |
| Delete a folder | Clears the folder reference on its scenarios | Those scenarios appear under *Uncategorized*; the active filter resets if it pointed at the deleted folder |
| Move a scenario | Updates one record's folder | Folder counts on both sides update immediately in the local view |
| Delete a history record | Removes the record and its video | The row disappears; folder counts drop |
| Approve or reject an account | Changes the user's status | That user's next request or login attempt — no sign-out needed, because status is re-read per request |
| Delete an account | Cascades to folders, history, and API keys | The user's sessions and keys stop working immediately |
| Create or revoke an API key | Changes what authenticates | Any integration using that key, on its next call |
| Save the system configuration | Replaces the shared sample | Every user's *Load Sample Flow*, from their next page load |
| Submit feedback | Creates an anonymous record | The Admin Feedbacks tab |

---

#### The main journey, end to end

1. A tester requests an account and waits; an administrator approves it in **User Management**.
2. The tester signs in and lands on the **Scenario Builder**.
3. They create a **project folder**, or pick an existing one — generation is refused without it.
4. They author steps by hand, load the admin-configured sample, import a JSON/YAML flow, or open the
   **Interaction Recorder** and click through the target site.
5. They press **Generate Script**. The engine crawls the real page step by step, matches each target
   label to an element, emits framework-specific code, and — with dry-run enabled — verifies and
   self-heals it. A history record is created.
6. They review the **matching table** (scores, chosen locators) and, if needed, edit values or URLs
   directly in the code box.
7. They press **Run Script Now**. The code is sanitised, queued, executed with video recording, and
   the terminal fills with the run output; the recording appears below it.
8. Later they open **Flow History**, filter by folder, search, and re-open the scenario — code,
   scores, and video intact.
9. **Load to Builder** brings it back, and re-running it forks a new history record so the original
   run's evidence survives.
10. To automate all of this, they mint a key in **API Keys** and paste one of the ready-made cURL
    snippets into their pipeline. Their usage then appears in the admin **Hit & Usage** dashboard.

---

#### Surfaces with no outbound links

These are terminal — reached from a nav bar or a button, exited only by going back:

- API Keys (both the workspace tab and the admin sub-tab)
- Admin Activity Logs
- Admin System Configuration
- Feedback modal
- Admin Feedbacks (except opening an attachment in a new browser tab)

---

#### Structural observations

- **Two separate HTML documents.** The workspace and the admin console are independent pages with
  their own scripts, sharing a stylesheet, a snackbar implementation, a theme toggle, and — duplicated
  rather than shared — the API-key management logic and several table renderers. Any behavioural
  change to key management currently has to be made twice.
- **User management appears twice.** The workspace script still contains an admin-modal user table
  (`loadAdminUsers`, `approveUser`, `rejectUser`, `deleteUserAccount`) with no markup left to host it;
  the working implementation is the console's. Dead code worth removing.
- **Admins lose a surface rather than gaining one.** The workspace API Keys tab is hidden from them,
  and the console tab that replaces it shows only their own keys — so no screen anywhere manages
  another user's keys.
- **Filtering and paging happen in the browser** for Flow History and every admin table except the
  API-key usage log. Fine at current scale; the first thing to revisit as archives grow.

---
