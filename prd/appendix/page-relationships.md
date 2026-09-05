# Page Relationships

How the surfaces connect, what they pass to each other, and which actions ripple across screens.

---

## Navigation map

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

## Transitions that carry data

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

## Data coupling

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

## The main journey, end to end

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

## Surfaces with no outbound links

These are terminal — reached from a nav bar or a button, exited only by going back:

- API Keys (both the workspace tab and the admin sub-tab)
- Admin Activity Logs
- Admin System Configuration
- Feedback modal
- Admin Feedbacks (except opening an attachment in a new browser tab)

---

## Structural observations

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
