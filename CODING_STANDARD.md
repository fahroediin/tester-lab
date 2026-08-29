# Coding Standard

## Tester Lab: Non-LLM Rule & Heuristic-Based Automated Test Script Generator

**Version:** 1.0.0  
**Date:** 2026-08-29  
**Author:** Tech Lead & Core Engineering Team  
**Status:** Enforced

---

## Table of Contents

1. [General Principles](#1-general-principles)
2. [Tech Stack & Architecture](#2-tech-stack--architecture)
3. [TypeScript & Coding Standards](#3-typescript--coding-standards)
4. [Core Pipeline Standards (Non-LLM Engine)](#4-core-pipeline-standards-non-llm-engine)
5. [Backend & API Standards (Express + Supabase)](#5-backend--api-standards-express--supabase)
6. [Security & Defense-in-Depth](#6-security--defense-in-depth)
7. [Concurrency & Process Execution](#7-concurrency--process-execution)
8. [Testing & Verification Standards](#8-testing--verification-standards)
9. [File & Directory Organization](#9-file--directory-organization)
10. [Git Workflow & Commit Standards](#10-git-workflow--commit-standards)

---

## 1. General Principles

- **Write code for the next developer:** Code must be clear, self-explanatory, and maintainable.
- **Explicit over implicit:** No magic behaviors, hidden global states, or obscure side-effects.
- **Single Responsibility Principle (SRP):** Each function, class, file, and module does exactly one job.
- **Strict File Length Limits:** 
  - Maximum **300 lines** per file (hard limit).
  - Split proactively at **250 lines**.
- **Zero `any` Policy:** Use `unknown` or explicit types/interfaces. Narrow `unknown` with safe type guards.
- **Async Discipline:** Always use `async` / `await`. No unhandled floating promises.
- **No Dead Code in `main`:** Remove unused stubs, deprecated functions, and orphan imports.

---

## 2. Tech Stack & Architecture

### 2.1 Technology Overview

| Layer / Component | Technology | Description |
| :--- | :--- | :--- |
| **Runtime & Language** | Node.js (v18+/v20+ LTS), TypeScript (ES2022 / NodeNext) | High-performance, modern TypeScript environment. |
| **DSL Validation** | Zod (`^3.22.4`) | Strict schema validation & input normalizer for JSON/YAML business rules. |
| **DOM Crawler** | Playwright Chromium (`@playwright/test ^1.40.0`) | Headless browser for state-transition interactive DOM extraction. |
| **Code Transpilation** | Handlebars (`^4.7.8`) + Prettier (`^3.1.1`) | Template-based multi-framework transpiler & code formatter. |
| **Backend REST API** | Express.js (`^4.18.2`) | Modular REST API with JWT & API Key authentication. |
| **Database & Storage** | Supabase (`@supabase/supabase-js ^2.39.0`) | PostgreSQL with RLS, Supabase Storage for videos & feedback attachments. |
| **CLI Tool** | Commander.js (`^11.1.0`) + js-yaml (`^5.4.0`) | Standalone CLI tool (`test-gen`) supporting JSON and YAML DSLs. |
| **Frontend UI** | HTML5, Vanilla JavaScript, Modern CSS Design System | Responsive workspace UI with dark mode, real-time logs, and admin console. |

### 2.2 System Architecture Pipeline

```
[ Business Rule DSL (JSON/YAML) ]
               │
               ▼
    1. Zod DSL Validator & Normalizer (src/validator/dsl-validator.ts)
               │
               ▼
    2. State-Transition DOM Extractor (src/crawler/dom-extractor.ts)
       - Headless Playwright Chromium Crawler
       - Interactive element extraction (buttons, inputs, links, roles)
               │
               ▼
    3. Heuristic Scoring Engine (src/matcher/heuristic-matcher.ts)
       - 6 Deterministic Heuristic Rules (Test ID -> Label -> Role -> Text -> Placeholder -> Levenshtein)
       - Tag suitability filtering & coordinate disambiguation
               │
               ▼
    4. Selector Strategy Resolver (src/matcher/selector-resolver.ts)
       - getByTestId, getByLabel, getByRole, getByPlaceholder, getByText, locator
               │
               ▼
    5. Multi-Framework Code Generator (src/generator/code-generator.ts)
       - Handlebars templates (Playwright TS/JS, Cypress, Selenium, Robot)
       - Prettier AST code formatting
               │
               ▼
    6. Dry-Run & Self-Healing Engine (src/validator/dry-run-engine.ts)
       - Headless test execution validation
       - Rank 2 candidate auto-healing fallback
```

---

## 3. TypeScript & Coding Standards

### 3.1 Compiler Settings

`tsconfig.json` enforces:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### 3.2 Typing Rules

- **No `any`:** Replace with explicit interfaces, `unknown`, or `Record<string, unknown>`.
- **String Literal Unions over Enums:** Use `'playwright' | 'cypress' | 'selenium' | 'robotframework'`, never TypeScript `enum`.
- **Data Shapes in `src/types/index.ts`:** All shared core domain types (`DSLConfig`, `DSLStep`, `DOMElementCandidate`, `ResolvedStep`, `SelectorType`) live in `src/types/index.ts`.
- **Error Types in `catch`:** All catch blocks must explicitly type errors as `unknown`:
  ```typescript
  try {
    // ...
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Operation failed:', error.message || err);
  }
  ```

---

## 4. Core Pipeline Standards (Non-LLM Engine)

### 4.1 DSL Validation & Normalization

- All DSL inputs (whether from CLI, REST API, or web UI) must pass `validateDSL(input)` from [`src/validator/dsl-validator.ts`](src/validator/dsl-validator.ts).
- Normalizer converts legacy aliases (e.g. `type`/`input` $\rightarrow$ `fill`, `target` $\rightarrow$ `targetLabel`) and auto-assigns `step: index + 1` if omitted in user-written YAML files.

### 4.2 Heuristic Scoring Matrix (Deterministic Non-LLM)

Scoring must strictly follow the deterministic 6-tier matrix:

| Priority | Rule | Score | Strategy / Condition |
| :---: | :--- | :---: | :--- |
| **1** | **Direct Test ID** | **100** | Matches `data-testid`, `data-test`, `id-test` directly. Immediate return. |
| **2** | **Associated Label** | **85 – 90** | Exact `label[for]` association or direct wrapping `<label>`. |
| **3** | **ARIA Role & Name** | **75 – 88** | Semantic ARIA role matching (`button`, `textbox`, `combobox`) + accessible name. |
| **4** | **Visual Text / Value** | **60 – 85** | Exact or substring inner text match on interactive elements. |
| **5** | **Placeholder / Aria-Label** | **65 – 80** | Standalone placeholder or `aria-label` matching input action. |
| **6** | **Fuzzy Levenshtein Distance** | **30 – 50** | Fallback similarity threshold for minor typos or dynamic prefixes. |

- **Tag Suitability Filtering:** Incompatible element tags (e.g. attempting `fill` on a `<div>` or `<button>`) must receive a score of **0** immediately before heuristic computation.
- **Disambiguation:** When candidates tie in score, the candidate closest to top-left coordinates is preferred (*Top-Left Visual Layout Disambiguation*).

### 4.3 Multi-Framework Code Transpiler

- Templates reside in `src/templates/*.hbs` and are compiled via Handlebars.
- Supported targets:
  - Playwright TypeScript (`playwright-ts.hbs`)
  - Playwright JavaScript (`playwright-js.hbs`)
  - Cypress (`cypress.hbs`)
  - Selenium Python (`selenium-py.hbs`)
  - Robot Framework (`robotframework.hbs`)
- All generated JavaScript/TypeScript code must be formatted through `prettier.format()` with single quotes and trailing commas disabled.

---

## 5. Backend & API Standards (Express + Supabase)

### 5.1 Route & Controller Separation

- Each domain feature has its own router file in `src/server/routes/`:
  - `auth-routes.ts`: Registration, login, token refresh, profile.
  - `admin-routes.ts`: User approvals, feedback management, activity logs, admin stats.
  - `api-key-routes.ts`: API key generation, revocation, usage summaries.
  - `test-routes.ts`: Code generation (`/generate-script`), DOM inspection (`/inspect-dom`), test execution (`/run-test`).
  - `history-routes.ts`: Scenario execution history CRUD.
  - `feedback-routes.ts`: User feedback submissions & attachments.
  - `config-routes.ts`: System & sample configuration.
- Complex service logic must be extracted to `src/server/services/` (e.g. `test-runner-service.ts`) or dedicated helper files to maintain the **< 250 line limit**.

### 5.2 Standard Response Envelope

All API endpoints must return the uniform envelope:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional descriptive success message"
}
```

**Error:**
```json
{
  "success": false,
  "error": "Descriptive error message"
}
```

### 5.3 Global Error & 404 Handlers

`src/server/index.ts` must maintain a typed global error middleware returning HTTP 500 JSON responses for uncaught exceptions, and a catch-all 404 handler for unknown `/api/*` endpoints.

---

## 6. Security & Defense-in-Depth

### 6.1 API Key Hashing & Masked Prefix Secrecy

- **Storage:** Only the SHA-256 hash digest (`key_hash`) is stored in the database.
- **Masking:** The `key_prefix` column stores only a masked string (e.g. `tl_live_01234567...cdef`). Raw keys are **never** persisted.
- **One-Time Display:** The raw generated API key (`tl_live_<64-hex>`) is returned to the user **once** upon creation and can never be retrieved again.

### 6.2 Dual Authentication Middleware

`src/server/auth-middleware.ts` supports dual authentication:
1. **JWT Bearer Token (`Authorization: Bearer <jwt>`):** Enforces user session, account status (`status = 'approved'`), and user role (`admin` vs `user`).
2. **API Key Header (`X-API-Key: tl_live_...` or `Authorization: Bearer tl_live_...`):** Validates key hash, checks revocation status, updates `last_used_at` asynchronously, and enforces account active status.

### 6.3 Row Level Security (RLS) on PostgreSQL

All tables in [`supabase/schema.sql`](supabase/schema.sql) must have Row Level Security enabled and locked to `TO service_role` to prevent unauthorized public access via Supabase direct REST endpoints:
```sql
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on api_keys"
  ON api_keys FOR ALL TO service_role USING (true);
```

### 6.4 Safe Process Execution

- **No Shell Commands:** Never use `child_process.exec()` with concatenated command strings.
- **Argument Arrays:** Always use `child_process.execFile()` with strict argument vectors:
  ```typescript
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const { stdout, stderr } = await execFileAsync(
    npxCmd,
    ['playwright', 'test', specFilePath, '--reporter=json'],
    { timeout: 120000, env: sanitizedEnv }
  );
  ```

### 6.5 Code Sanitizer & AST Guard

Prior to executing test scripts on the server (in dry-run or test execution), scripts must be validated via `sanitizeCode(code)` in [`src/server/code-sanitizer.ts`](src/server/code-sanitizer.ts) to block:
- Access to `process.env` (prevents secret exfiltration).
- Imports or access to `child_process`, `fs`, `net`, `http`, `cluster`, `worker_threads`.
- Dangerous runtime calls (`eval`, `Function(`, `vm.runInContext`).
- Loading unauthorized third-party libraries (only `@playwright` imports permitted).

---

## 7. Concurrency & Process Execution

To protect server resources against CPU/memory exhaustion during crawler and Playwright test executions:
- **Concurrency Queue Manager (`src/server/queue-manager.ts`):**
  - `globalTestRunnerQueue`: Limits concurrent test executions (default: `MAX_CONCURRENT_TESTS = 3`).
  - `globalTestGeneratorQueue`: Limits concurrent DOM crawler operations (default: `MAX_CONCURRENT_GENERATIONS = 5`).
- **Timeouts:** All browser navigations and Playwright test runs must specify explicit timeouts (default: 120s).

---

## 8. Testing & Verification Standards

### 8.1 Automated Test Suite

- Keep an automated test suite verifying:
  1. DSL schema validation and step normalizer.
  2. Deterministic scoring matrix rules (Rule 1 through 6).
  3. Multi-framework code transpilation outputs.
  4. Code Sanitizer security filters against malicious scripts.
  5. API Key SHA-256 hashing and prefix masking secrecy.
  6. In-memory and database usage metrics calculations.

### 8.2 Pre-Commit & Pre-Release Verification

Before pushing code or deploying:
```bash
# 1. Type check and build project
npm run build

# 2. Verify all functional test suites pass (0 errors)
node dist/cli/index.js --help
```

---

## 9. File & Directory Organization

```
tester-lab/
├── public/                     # Static Frontend Assets (HTML, CSS, JS)
│   ├── css/style.css           # Modern CSS Design System
│   ├── js/app.js               # Frontend Application Logic
│   └── index.html              # Single Page Workspace & Admin Portal
├── src/
│   ├── cli/
│   │   └── index.ts            # CLI Tool Entry Point (test-gen)
│   ├── crawler/
│   │   ├── dom-candidate-extractor.ts  # In-browser DOM extraction script
│   │   └── dom-extractor.ts            # Playwright headless crawler engine
│   ├── generator/
│   │   └── code-generator.ts   # Handlebars multi-framework transpiler
│   ├── matcher/
│   │   ├── heuristic-matcher.ts # Multi-step matching coordinator
│   │   ├── scoring-engine.ts    # 6-tier deterministic heuristic engine
│   │   └── selector-resolver.ts # Playwright selector strategy mapping
│   ├── server/
│   │   ├── lib/
│   │   │   └── sanitized-env.ts # Environment sanitizer for subprocesses
│   │   ├── routes/              # Express REST API Route Handlers (<250 lines each)
│   │   │   ├── admin-routes.ts
│   │   │   ├── api-key-routes.ts
│   │   │   ├── auth-routes.ts
│   │   │   ├── config-routes.ts
│   │   │   ├── feedback-routes.ts
│   │   │   ├── history-routes.ts
│   │   │   └── test-routes.ts
│   │   ├── services/
│   │   │   └── test-runner-service.ts # Headless test runner & video handler
│   │   ├── activity-log-store.ts
│   │   ├── api-key-store.ts     # Secure API Key Store (SHA-256 + masked prefix)
│   │   ├── api-key-usage-helpers.ts # In-memory buffer & date helpers
│   │   ├── api-key-usage-store.ts   # Database usage tracking & metrics
│   │   ├── auth-middleware.ts   # JWT & API Key dual auth middleware
│   │   ├── auth-store.ts        # Supabase auth database adapter
│   │   ├── code-sanitizer.ts    # AST/regex security guard for test scripts
│   │   ├── config-store.ts
│   │   ├── flow-history-store.ts
│   │   ├── index.ts             # Express server entry point
│   │   ├── queue-manager.ts     # Concurrency queue limiter
│   │   └── supabase-client.ts   # Supabase client singleton
│   ├── templates/               # Handlebars Test Templates (*.hbs)
│   │   ├── cypress.hbs
│   │   ├── playwright-js.hbs
│   │   ├── playwright-ts.hbs
│   │   ├── robotframework.hbs
│   │   └── selenium-py.hbs
│   ├── types/
│   │   └── index.ts             # Shared Domain Types & Interfaces
│   ├── validator/
│   │   ├── dry-run-engine.ts    # Test execution & self-healing engine
│   │   └── dsl-validator.ts     # Zod DSL schema & normalizer
│   └── index.ts                 # Programmatic Library Export Entry Point
├── supabase/
│   └── schema.sql               # PostgreSQL Schema & RLS Policies
├── tests/                       # Test scenarios & specs
├── CODING_STANDARD.md           # Engineering & Coding Standards (This Document)
├── package.json
└── tsconfig.json
```

### 9.1 Naming Conventions

| Item | Convention | Example |
| :--- | :--- | :--- |
| **Directories** | `kebab-case` | `src/server/routes/`, `src/crawler/` |
| **TypeScript Files** | `kebab-case` | `code-generator.ts`, `api-key-store.ts` |
| **Functions & Methods** | `camelCase` | `calculateScore()`, `generateApiKey()` |
| **Variables & Properties** | `camelCase` | `selectorType`, `matchScore` |
| **Types & Interfaces** | `PascalCase` | `DSLConfig`, `ResolvedStep`, `DOMElementCandidate` |
| **Constants & Enums** | `SCREAMING_SNAKE_CASE` | `DEFAULT_CONFIG`, `JWT_SECRET` |
| **Database Tables & Columns** | `snake_case` | `api_keys`, `flow_history`, `key_hash` |

---

## 10. Git Workflow & Commit Standards

### 10.1 Branch Naming

```
feat/<task-id>-short-description
fix/<task-id>-short-description
refactor/<task-id>-short-description
chore/<task-id>-short-description
```

### 10.2 Commit Message Standard (Conventional Commits)

Commit format: `<type>(<scope>): <subject>`

- **Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `security`
- **Scope examples:** `(matcher)`, `(generator)`, `(api-keys)`, `(auth)`, `(crawler)`, `(server)`, `(security)`
- **Rules:**
  - Use imperative mood: `feat(crawler): add iframe interactive candidate extraction`.
  - Subject line $\le$ 80 characters.
  - Never add unnecessary trailers or generated boilerplate.
