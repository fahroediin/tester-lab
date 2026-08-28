# Coding Standard

## Terral: Logistic Mine App

**Version:** 1.1.0  
**Date:** 2026-05-13  
**Author:** Tech Lead  
**Status:** Enforced

---

## Table of Contents

1. [General Principles](#1-general-principles)
2. [TypeScript Standards](#2-typescript-standards)
3. [Backend Standards (Next.js + Bun)](#3-backend-standards-nextjs--bun)
4. [Frontend Standards (React + MVP)](#4-frontend-standards-react--mvp)
5. [Database Standards (Drizzle ORM)](#5-database-standards-drizzle-orm)
6. [Testing Standards](#6-testing-standards)
7. [Git Workflow](#7-git-workflow)
8. [File and Folder Naming](#8-file-and-folder-naming)
9. [Code Formatting](#9-code-formatting)
10. [Localization and User-Facing Copy](#10-localization-and-user-facing-copy)
11. [Draft Pattern (`"Simpan"` to localStorage)](#11-draft-pattern-simpan-to-localstorage)

---

## 1. General Principles

- Write code for the next developer.
- Prefer explicit over implicit. No hidden side effects. No magic configuration.
- Each function, file, or module does one thing.
- Comments explain why, not what.
- No dead code in `main`.
- No `// @ts-ignore` or `any` without a documented justification.
- No file exceeds **300 lines**. Split at 250 lines proactively.

## 2. TypeScript Standards

### 2.1 Compiler Settings

`tsconfig.json` enforces:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 2.2 Rules

- No `any`. Use `unknown` and narrow with a type guard.
- Exported functions require explicit return types.
- `type` for data shapes. `interface` only for extensible contracts.
- Enum-like values are string literal unions, never TypeScript `enum`.
- Separate `import type` from value imports when they come from the same module.
- Zod schemas are the source of truth. Derive TS types via `z.infer<>`.

Example:

```typescript
import type { WorkOrderStatus, Role } from "@terral/shared";
import { workOrderStatusSchema, roleSchema } from "@terral/shared";
```

`@terral/shared` holds cross-cutting literal unions and constants only. Entity shapes like `workOrderSchema` live at the module root (`src/modules/work-orders/work-orders.schema.ts`).

## 3. Backend Standards (Next.js + Bun)

### 3.1 Module Structure

Every backend service lives under `src/modules/<service>/`. Three shared files at the module root, plus one folder per HTTP endpoint:

```
src/modules/<service>/
  <service>.route.ts           # withRbac-wrapped handlers, consumed by app/api/v1/.../route.ts
  <service>.repository.ts      # all Drizzle queries for the module (shared across endpoints)
  <service>.schema.ts          # shared base entity schema + module-local enums

  <endpoint>/
    <endpoint>.handler.ts      # Next.js route-handler body
    <endpoint>.service.ts      # business logic for this endpoint
    <endpoint>.schema.ts       # request + response Zod + MOCK_REQUEST/MOCK_RESPONSE (scaffolds)
    <endpoint>.test.ts
```

Each Next.js route file wraps the handler with `withRbac` AND carries the JSDoc that `next-openapi-gen` parses to build `public/openapi.json`:

```typescript
// src/app/api/v1/work-orders/route.ts
import { withRbac } from "@/middleware/rbac";
import { listWorkOrdersHandler } from "@/modules/work-orders/list/list.handler";
import { createWorkOrderHandler } from "@/modules/work-orders/create/create.handler";

/**
 * List SPK with status + filters + pagination
 * @tag work-orders
 * @response WorkOrderListResponse
 * @auth bearer
 * @openapi
 */
export const GET = withRbac(["fieldman_1", "fieldman_2", "super_admin"], listWorkOrdersHandler);

/**
 * Buat SPK baru (Create SPK Kirim — Fieldman 1 only)
 * @tag work-orders
 * @body CreateWorkOrderRequest
 * @response CreateWorkOrderResponse
 * @auth bearer
 * @openapi
 */
export const POST = withRbac(["fieldman_1"], createWorkOrderHandler);
```

`bun run openapi:generate` (or `bun run build`) walks every `route.ts` and emits `public/openapi.json` for the Scalar UI at `/api/v1/docs`. Commit the regenerated spec with the endpoint change.

### 3.2 Where Each Schema Lives

- Request + response schemas for a single endpoint live in `src/modules/<service>/<endpoint>/<endpoint>.schema.ts`. The OpenAPI metadata for that endpoint lives in the JSDoc of `src/app/api/v1/<path>/route.ts`, not in the schema file.
- The shared base entity schema (e.g. `workOrderDetailSchema`, `customerSchema`) lives at `src/modules/<service>/<service>.schema.ts`. Endpoint schemas compose on top of it (`workOrderDetailSchema.pick(...)`, `z.array(customerSchema)`, etc.).
- Cross-cutting literal unions and constants live in `packages/shared`. No per-endpoint shapes go there.

See [technical-specs/05-module-definitions.md §5.1 and §5.3](technical-specs/05-module-definitions.md) for the full pattern plus the `next-openapi-gen` JSDoc flow.

### 3.3 Handler Pattern

Handlers are plain Next.js route-handler bodies. They:

- Parse `req.json()` with Zod `safeParse` (or parse query / path params). Never trust the raw input.
- Are wrapped with `withRbac` at the module-root `<service>.route.ts`. The handler itself does not call `withRbac`.
- Call exactly one service function.
- Return `jsonOk(data, status)` or `jsonError(code, message, status)` from `@/lib/http`.

```typescript
// src/modules/work-orders/create/create.handler.ts
import type { NextRequest } from "next/server";
import type { AuthUser } from "@/middleware/auth";
import { createWorkOrderRequestSchema } from "./create.schema";
import { createWorkOrderService } from "./create.service";
import { jsonOk, jsonError } from "@/lib/http";

export async function createWorkOrderHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  const body = await req.json().catch(() => null);
  const parsed = createWorkOrderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("VALIDATION_ERROR", "Data tidak valid", 400, parsed.error.flatten());
  }
  const row = await createWorkOrderService(parsed.data, user.id);
  return jsonOk(row, 201);
}
```

Dynamic path params are async in Next.js 15+ (still required in 16):

```typescript
export async function getWorkOrderHandler(
  req: NextRequest,
  user: AuthUser,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const row = await getWorkOrderService(id);
  return jsonOk(row);
}
```

### 3.4 Service Pattern

- Take already-validated input.
- Call repositories for DB access.
- Write audit logs inside the same `db.transaction()`.
- Throw domain errors from `lib/errors.ts`.
- Never touch `Request`, `Response`, or HTTP context.

```typescript
// src/modules/work-orders/create/create.service.ts
import { db } from "@/db/client";
import { workOrderRepository } from "../work-orders.repository";
import { voucherRepository } from "@/modules/documents/documents.repository";
import { auditService } from "@/modules/audit/audit.service";
import { allocateWorkOrderNumberForToday } from "@/lib/work-order-number";
import {
  assertUniqueDeliveryNote,
  assertUniqueDeliveryOrder,
  resolveTravelAllowance,
} from "./create.helpers";
import type { CreateWorkOrderInput } from "./create.schema";
import type { WorkOrder } from "../work-orders.schema";

export async function createWorkOrderService(
  input: CreateWorkOrderInput,
  createdBy: string,
): Promise<WorkOrder> {
  return await db.transaction(async (tx) => {
    await assertUniqueDeliveryNote(tx, input.delivery_note_number);
    await assertUniqueDeliveryOrder(tx, input.delivery_order_number);
    const amount = input.has_travel_allowance
      ? await resolveTravelAllowance(tx, input.origin_location_id, input.destination_location_id)
      : 0;
    const number = await allocateWorkOrderNumberForToday();
    const row = await workOrderRepository.insert(tx, {
      ...input,
      work_order_number: number,
      travel_allowance_amount: amount,
      created_by: createdBy,
    });
    if (amount > 0) await voucherRepository.issuePrimary(tx, row.id, amount, createdBy);
    await auditService.log(tx, {
      user_id: createdBy,
      module: "work_orders",
      entity_type: "work_order",
      entity_id: row.id,
      action: "create",
      before_state: null,
      after_state: row,
    });
    return row;
  });
}
```

No classes. `export async function` only.

### 3.5 Repository Pattern

- The module-root `<service>.repository.ts` owns every Drizzle query for the module.
- Every method accepts an optional `tx` parameter so the caller may pass an open transaction.
- No business logic here.

### 3.6 Error Handling

Define domain errors in `lib/errors.ts`:

```typescript
export class NotFoundError extends Error {
  code = "NOT_FOUND";
  status = 404;
}
export class ForbiddenError extends Error {
  code = "FORBIDDEN";
  status = 403;
}
export class ConflictError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.status = 409;
  }
}
export class InvalidTransitionError extends Error {
  code = "INVALID_TRANSITION";
  status = 422;
}
```

The `jsonError` helper and Next.js `route.ts` error wrapper map these to the API envelope.

### 3.7 Environment Variables

Import from `@/lib/config`. Never read `Bun.env` or `process.env` directly in application code. Exceptions: `drizzle.config.ts`, `scripts/*.ts`, and `src/proxy.ts` (Next.js edge proxy reads `NODE_ENV` to decide dev-only CSP relaxations; `@/lib/config` is not available at edge runtime).

### 3.8 Async Discipline

- `async` / `await`. No `.then()` chains.
- No silent fire-and-forget. Use `.catch(logError)` when detachment is necessary.

### 3.9 API Scaffold (Tech Lead Pre-Sprint)

Every API endpoint is scaffolded by the Tech Lead in Sprint 0. For each endpoint, the scaffold ships:

- The endpoint folder `src/modules/<service>/<endpoint>/` with the four files (`<endpoint>.handler.ts`, `<endpoint>.service.ts`, `<endpoint>.schema.ts`, `<endpoint>.test.ts`).
- `<endpoint>.schema.ts` exports request / response Zod schemas plus typed `MOCK_REQUEST` (when applicable) and `MOCK_RESPONSE` constants matching `docs/api-specs/`.
- `<endpoint>.service.ts` returns `MOCK_RESPONSE`. Real implementation lands in the corresponding BE-S? card.
- `<endpoint>.handler.ts` parses the request, calls the service, and serializes the response with `NextResponse.json(service())` (the service already returns the full `{ success, data }` envelope).
- `src/app/api/v1/<path>/route.ts` wraps the handler with `withRbac` inline AND carries the JSDoc that `next-openapi-gen` reads to build `public/openapi.json`.

Backend developers later replace the placeholder service body with real logic. Frontend developers integrate against the scaffold from day one. The HTTP contract (path, method, response shape, error codes) stays stable across the scaffold-to-real transition.

## 4. Frontend Standards (React + MVP)

### 4.1 MVP Layout

```
features/<feature>/
  <feature>.api.ts           Model
  <feature>.presenter.ts     Presenter (React hook)
  <feature>.view.tsx         View (JSX only)
```

### 4.2 Component Rules

- One component per file. Default export.
- Props type named `{ComponentName}Props`.
- No prop spreading (`...rest`) outside documented low-level wrappers.
- No `fetch` or Zod parsing in view files.

### 4.3 State Management

- Component-local: `useState`.
- Feature-scoped: custom presenter hooks.
- Global (auth, toast): React Context.
- No Redux, Zustand, or Jotai in Phase 1.

### 4.4 API Client

All calls go through `@/lib/api-client`. Never raw `fetch` in presenter or view.

### 4.5 Conditional Rendering

Use early returns. Avoid nested ternaries.

### 4.6 Error Boundaries

Every top-level route is wrapped in `<ErrorBoundary>`.

### 4.7 Forms

React Hook Form + Zod resolver. The Zod schema is composed from the endpoint's own `<endpoint>.schema.ts` (or the module-root base schema); only cross-cutting literal unions and constants come from `@terral/shared`. Field-level errors shown inline in Bahasa Indonesia.

## 5. Database Standards (Drizzle ORM)

### 5.1 Schema Conventions

- Table names: `snake_case`, plural. English only (`work_orders`, not `spks`).
- Column names: `snake_case`. English only.
- Primary key: `uuid` via `gen_random_uuid()`.
- Mutable tables: `created_at`, `updated_at` (both `timestamptz NOT NULL DEFAULT now()`).
- Calendar dates use `date`. Point-in-time records use `timestamp with time zone`.

### 5.2 Migrations

- All schema changes through Drizzle migrations.
- Migration files are committed. Name them descriptively: `0005_add_voucher_redemptions.sql`.

### 5.2.1 Migration Serialization Protocol

One generate per PR. Regenerate after rebase. See [add-drizzle-migration skill](../.claude/skills/add-drizzle-migration/SKILL.md).

### 5.3 Transactions

Every multi-table write uses `db.transaction()`. Audit log writes are part of the originating transaction.

## 6. Testing Standards

### 6.1 Approach

- TDD preferred. Write the failing test first.
- Backend service and repository tests are required.
- Frontend tests are optional. Write when the presenter carries non-trivial logic (optimistic updates, multi-step draft reconciliation).

### 6.2 Structure

Arrange-Act-Assert. One `it` per error condition. Mock at `../../db/client` only.

### 6.3 Mock Discipline

Bun's `mock.module()` is global. Mocking an intermediate module (service, repository) breaks other tests. Always mock at `db/client`.

```typescript
const mockFindFirst = mock((): Promise<WorkOrder | undefined> => Promise.resolve(undefined));
mock.module("../../db/client", () => ({
  sql: mock(() => Promise.resolve([])),
  db: {
    query: { workOrders: { findFirst: mockFindFirst } },
    transaction: (fn: any) => fn({}),
  },
}));
const { workOrderService } = await import("./work-orders.service");
```

## 7. Git Workflow

### 7.1 Branch Naming

```
feature/<task-id>-short-description
fix/<task-id>-short-description
chore/<task-id>-short-description
```

### 7.2 Commit Messages

Conventional Commits: `<type>(<scope>): <subject>`.

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.

Rules:

- Imperative mood.
- Subject <= 80 chars including type, scope, and task id.
- Reference task id when applicable: `[BE-S1-03]`.
- Never add `Co-Authored-By` trailers.

### 7.3 Pull Requests

- Direct pushes to `main`, `test`, `dev` are blocked.
- CI (lint, fmt, type-check, test, build) must pass.
- **Reviewer: Tech Lead only.** Developer self-review against [CODE_REVIEW_CHECKLIST.md](CODE_REVIEW_CHECKLIST.md) is required before requesting Tech Lead review.
- Squash merge into the target branch.

## 8. File and Folder Naming

| Item                  | Convention             | Example                       |
| --------------------- | ---------------------- | ----------------------------- |
| Folders               | `kebab-case`           | `work-orders/`                |
| TypeScript files      | `kebab-case`           | `create.service.ts`           |
| React component files | `kebab-case`           | `work-order-table.view.tsx`   |
| Test files            | Source name + `.test`  | `work-orders.service.test.ts` |
| Constants             | `SCREAMING_SNAKE_CASE` | `MAX_ATTACHMENT_SIZE_MB`      |
| Variables / functions | `camelCase`            | `createWorkOrder`             |
| Types / interfaces    | `PascalCase`           | `CreateWorkOrderInput`        |
| Zod schemas           | `camelCase` + `Schema` | `createWorkOrderSchema`       |
| DB table objects      | `camelCase`, plural    | `workOrders`, `auditLogs`     |
| Environment variables | `SCREAMING_SNAKE_CASE` | `DATABASE_URL`                |

All code identifiers are English. UI labels are Bahasa Indonesia in view files as string literals.

## 9. Code Formatting

- Formatter: `oxfmt`.
- Linter: `oxlint`.
- Pre-commit hook (husky + lint-staged) runs both on staged files.
- Files 250 lines or more trigger a warning in CI. 300+ lines fail the build.

## 10. Localization and User-Facing Copy

- UI strings are Bahasa Indonesia.
- No i18n library in Phase 1. Copy lives in the component that uses it.
- Dates use the `id-ID` locale. Format `DD MMMM YYYY` in display and `DD-MM-YYYY` in tables.
- Currency: `IDR` only. Format `Rp 500.000`.
- API error: `code` in English, `message` in Bahasa Indonesia. Example: `{ code: "DUPLICATE_DELIVERY_NOTE_NUMBER", message: "No. Surat Jalan sudah terpakai" }`.

## 11. Draft Pattern (`"Simpan"` to localStorage)

The `"Simpan"` button never calls the API. It serializes the current form state to `localStorage`. The `"Kirim"` button hits the API and clears the draft.

### 11.1 Helper

`src/lib/local-draft.ts`:

```typescript
export function saveDraft<T>(key: string, value: T): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ v: 1, saved_at: new Date().toISOString(), data: value }),
    );
  } catch {
    // quota exceeded or disabled storage; fail silently, UI shows a toast
  }
}

export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: number; data: T };
    return parsed.v === 1 ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  localStorage.removeItem(key);
}

export function clearAllDraftsFor(userId: string): void {
  const prefix = `terral:draft:`;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix) && key.endsWith(`:${userId}`)) {
      localStorage.removeItem(key);
    }
  }
}
```

### 11.2 Key Naming

```
terral:draft:<feature>:<scope>:<user_id>
```

Examples:

- `terral:draft:work-orders:create:<user_id>` for `"Create SPK"`.
- `terral:draft:work-orders:edit:<work_order_id>:<user_id>` for `"Edit SPK"`.
- `terral:draft:work-orders:process:<work_order_id>:<user_id>:section2` for `"Proses SPK"` Section II.

### 11.3 Rules

- Never write tokens, cleartext passwords, or binary files to `localStorage`.
- Drafts are hints. The server validates on `"Kirim"` as if the form were freshly typed.
- On logout, the UI calls `clearAllDraftsFor(user.id)`.
- Attachments are not drafts. They upload to the backend on file select (multipart) because files are not safe in `localStorage`.
