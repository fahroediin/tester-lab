# Enum Dictionary

Every fixed value, status code, and configurable limit in the system, with its meaning and where it
comes from.

---

## DSL

### Step actions

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

### Step options

| Option | Type | Meaning |
| :-- | :-- | :-- |
| `timeout` | positive number | Per-step timeout |
| `force` | boolean | Bypass actionability checks |
| `iframeSelector` | string | Resolve the element inside this iframe |
| `exact` | boolean | Require an exact text match |

These are accepted and carried through to the resolved step, but the current templates do not emit
them — a defined but unused extension point.

### Frameworks and languages

| Framework | Valid languages | Template | Output extension |
| :-- | :-- | :-- | :-- |
| `playwright` *(default)* | `typescript` *(default)*, `javascript` | `playwright-ts.hbs` / `playwright-js.hbs` | `.spec.ts` / `.spec.js` |
| `cypress` | `javascript` | `cypress-js.hbs` | `.cy.js` |
| `selenium` | `python` | `selenium-py.hbs` | `.py` |
| `robotframework` | `robot` | `robot-rf.hbs` | `.robot` |

Only Playwright and Cypress output is passed through the code formatter.

### Viewport

Optional `{ width, height }`, both positive. Defaults to **1280 × 720** in the crawler, the dry run,
and test execution alike.

---

## Matching and selectors

### Selector types

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

### Scoring matrix

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

## Accounts and access

### User role

| Value | Meaning |
| :-- | :-- |
| `user` | Default for every registration. Full access to the workspace once approved |
| `admin` | Additionally reaches the Admin Console and may read, move, or delete any user's scenarios and folders |

There is no UI for changing a role.

### User status

| Value | Set when | Can sign in | Can call the API |
| :-- | :-- | :-: | :-: |
| `pending` | On registration | No | No |
| `approved` | An admin approves, or the bootstrap admin is created | Yes | Yes |
| `rejected` | An admin rejects | No | No |

Rejection is reversible — a rejected account can still be approved later.

### Authentication methods

| Method | Header / parameter | Accepted where |
| :-- | :-- | :-- |
| JWT bearer | `Authorization: Bearer <jwt>` | Everywhere |
| API key | `X-API-Key: tl_live_…` | Everywhere except API-key management |
| API key as bearer | `Authorization: Bearer tl_live_…` | Same as above |
| Query token | `?token=<jwt>` | Iframe and media loads (recorder proxy, attachment redirect) |

Token lifetime: **7 days**. Key prefix: `tl_live_`, followed by 32 random bytes in hexadecimal.
Masked display format: the first 16 characters, an ellipsis, and the last 4.

### API key status

| Value | Meaning |
| :-- | :-- |
| `active` | Authenticates requests; `last_used_at` is stamped on each use |
| `revoked` | Rejected immediately; the record remains and can then be deleted |

---

## Records and telemetry

### Flow History status

| Value | Set when | UI pill |
| :-- | :-- | :-- |
| `GENERATED` | A script is generated | Neutral |
| `RUNNING` | An execution starts | Amber |
| `SUCCESS` | An execution passes | Green |
| `FAILED` | An execution fails | Red |

### API-key usage endpoints and statuses

| Endpoint | Status | Written when |
| :-- | :-- | :-- |
| `generate-script` | `generated` | Generation succeeded |
| `generate-script` | `failed` | Generation failed validation or the pipeline |
| `run-test` | `success` | The test passed |
| `run-test` | `failed` | The test failed, or the sanitizer blocked the code |

Aggregation also accepts the legacy synonyms `passed` (counted as success) and `failure` (counted as
failed). Usage rows are written **only** for API-key-authenticated requests.

### Feedback types

| Stored value | UI label |
| :-- | :-- |
| `Functional` | Functional (Bug / Logic Error) |
| `Defect` | Defect (Crash / Error Page) |
| `Cosmetic` | Cosmetic (UI / Design Issue) |

### Activity-log actions

`Register` · `Register Failed` · `Login Success` · `Login Failed` · `Generate Script` ·
`Generate Script Failed` · `Run Test` · `Run Test Blocked` · `Create Folder` · `Delete Folder` ·
`API Key Created` · `API Key Revoked` · `API Key Deleted` · `Admin Approve` · `Admin Reject` ·
`Admin Delete` · `Admin Delete Feedback`

### Snackbar types

`success` · `error` · `warning` · `info` — each with its own icon and colour; default duration
3500 ms.

---

## Limits and configuration

### Environment variables

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

### Hard-coded limits

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

### Blocked code patterns

Any of these in submitted or dry-run code causes rejection: `process.env`, bracket access to
`process`, `process.exit`, `process.kill`, process internals (`binding`, `mainModule`, `dlopen`),
`child_process`, `execSync`, `execFileSync`, `spawnSync`, `execFile`, the synchronous `fs` calls
(`readFileSync`, `writeFileSync`, `readdirSync`, `unlinkSync`, `rmSync`), `eval(`, `new Function(`,
the `Function` constructor, `.constructor`, `Reflect.get/apply/construct/set`, `globalThis`,
`__dirname`, `__filename`, `process.cwd()`, `process.argv`, `import.meta`, dynamic `import(`, and any
`require` or `import` whose source is not `@playwright/...`.

### Browser storage keys

| Key | Contents |
| :-- | :-- |
| `tester_jwt_token` | The session token |
| `tester_lab_theme` | `light` or `dark` |
| `tester_apikey_<id>` | The full API key, cached at creation so the table's copy button works |
| `tester_apikey_prefix_<prefix>` | The same value, keyed by masked prefix |
