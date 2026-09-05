# Scenario Builder

> **Route:** `/` → navigation tab **Scenario Builder** (default tab after sign-in)
> **Module:** Scenario Authoring
> **Access:** Authenticated, approved account
> **Source:** `public/index.html` (`#tabBuilder`), `public/js/app.js`, `src/server/routes/test-routes.ts`

## Overview

The heart of the product. On the left the user describes a business flow — which project folder it
belongs to, what it is called, which website it runs against, which test framework to emit, and an
ordered list of steps. On the right the system reports what it matched, shows the generated code, and
gives a terminal plus a video player for running the script on the spot.

A user comes here to author a new test, to adjust and re-run one loaded from history, or to import an
existing spec file and simply execute it.

## Layout

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

## Fields

### Region: Scenario header

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

### Region: Execution Steps

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

### Region: Action bar and toolbars

| Control | Location | Visibility / state | Behaviour |
| :-- | :-- | :-- | :-- |
| **Import File (.spec/.json/.yaml)** | Card header | Always | Opens a file picker accepting `.ts .js .spec.ts .spec.js .json .yaml .yml` |
| **Load Sample Flow** | Card header | Always | Loads the admin-configured sample scenario |
| **+ New Folder** | Beside the folder selector | Always | Opens the Create Folder modal |
| **Record Steps** | Steps header and below the list | Always | Opens the [Interaction Recorder](./03-interaction-recorder.md) |
| **+ Add Step** | Below the list | Always | Appends an empty `fill` step |
| **Run Headless Dry-Run Verification** | Action footer | Checked by default | Whether to execute the script once headlessly right after generating |
| **Generate Script** | Action footer, primary | Always | Runs the whole pipeline |
| Export format | Generated Code header | After generation/import | `Code (.spec/.js)` · `Flow (.yaml)` · `Flow (.json)` |
| **Copy** / **Download** | Generated Code header | Disabled until code exists | Copies or downloads in the selected format |
| **Collapse / Expand** | Matching table and code card | Always | Show/hide that section |
| Run mode | Terminal header | Default `Headless Mode` | `Headless Mode` · `Headed Mode (Visual Browser)` |
| **Run Script Now** | Terminal header, primary | Disabled until code exists | Executes the code currently in the editor |

## Interactions

### Page load

The workspace renders with an empty step list, an empty matching table, the Generated Code card
hidden, and the terminal showing *"Terminal ready…"*. The sample configuration and the user's folder
list are fetched in the background so *Load Sample Flow* and the folder selector are ready.

### Editing anything resets the output

Changing the folder, suite name, target URL, framework, language, or any step field — or adding,
removing, reordering, or re-typing a step — clears the generated code, hides the code card and the
matching table, clears the status chip, resets the terminal, hides the video, and disables Copy,
Download, and Run. This is deliberate: the displayed code must never be stale relative to the steps
above it.

### Load Sample Flow

- **Trigger:** Clicking *Load Sample Flow*.
- **Behaviour:** Fills suite name, target URL, and the step list from the admin-configured sample.
- **Special rule:** If the administrator has not configured a sample yet, nothing is loaded and a
  warning toast says *"Admin has not configured the sample scenario yet. Please contact
  administrator."*

### Import a file

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

### Generate Script

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

### Edit the generated code in place

Once code exists the console is editable. A hint line below it — *currently written in Indonesian* —
explains that values and URLs can be changed directly and run without regenerating. *Run Script Now*
always executes what is currently in the box, and that exact text is persisted to the history record,
so history never disagrees with what actually ran.

### Run Script Now

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

### Copy / Download

Both honour the export-format selector:

| Format | Content | Filename |
| :-- | :-- | :-- |
| `Code (.spec/.js)` | Exactly what is in the code box, user edits included | `<Test_Suite_Name>.spec.ts` or `.spec.js` |
| `Flow (.yaml)` | The current builder state re-serialised as YAML DSL | `<Test_Suite_Name>.yaml` |
| `Flow (.json)` | The same state as JSON DSL | `<Test_Suite_Name>.json` |

Spaces in the suite name become underscores; an empty name falls back to `test-spec`.

## API Dependencies

| API | Method | Path | Trigger | Notes |
| :-- | :-: | :-- | :-- | :-- |
| Folder list | GET | `/api/v1/folders` | Sign-in, tab switches, folder changes | Populates the selector with scenario counts |
| Create folder | POST | `/api/v1/folders` | Create Folder modal | |
| App config | GET | `/api/v1/config` | Sign-in | Supplies the sample scenario |
| Generate script | POST | `/api/v1/generate-script` | Generate Script | Requires a valid, owned folder id |
| Run test | POST | `/api/v1/run-test` | Run Script Now | Code is sanitised before execution |

## Page Relationships

- **From:** [Sign In](./01-auth-sign-in-register.md) (default landing tab);
  [Flow History](./04-workspace-flow-history.md) via *Load to Builder*, which brings the suite, URL,
  framework, language, steps, folder, and code across and marks the scenario as a replay.
- **To:** [Interaction Recorder](./03-interaction-recorder.md) (modal), Create Folder (modal),
  [Feedback](./06-feedback-modal.md) (modal), and the other workspace tabs via the nav bar.
- **Data coupling:** A successful generation writes a Flow History record, so the History tab shows a
  new row on its next load. Creating a folder in the modal refreshes the selector *and* the History
  folder tree.

## Business Rules

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
