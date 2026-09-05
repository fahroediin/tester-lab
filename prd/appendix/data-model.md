# Data Model

PostgreSQL (Supabase) schema plus the two storage buckets. Source: `supabase/schema.sql` and the
store modules under `src/server/`.

---

## Entity relationships

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

## `users`

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

## `folders`

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

## `flow_history`

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

## `activity_logs`

| Column | Type | Constraints |
| :-- | :-- | :-- |
| `id` | TEXT | Primary key. Application-generated: `log_<timestamp>_<random>` |
| `user_id` | TEXT | Nullable, **no foreign key** — entries survive account deletion |
| `username` | TEXT | Not null; the actor's name, or `System` |
| `action` | TEXT | Not null |
| `details` | TEXT | Not null, default empty |
| `timestamp` | TIMESTAMPTZ | Not null, default now; indexed descending |

## `app_config`

| Column | Type | Constraints |
| :-- | :-- | :-- |
| `id` | INTEGER | Primary key, default 1, **check `id = 1`** — structurally a single row |
| `sample_test_suite` | TEXT | Not null, default empty |
| `sample_target_url` | TEXT | Not null, default empty |
| `sample_steps` | JSONB | Not null, default `[]` |
| `updated_at` | TIMESTAMPTZ | Not null, default now |

Seeded with an empty row on schema creation. No history, no versioning, no per-user variant.

## `feedbacks`

| Column | Type | Constraints |
| :-- | :-- | :-- |
| `id` | UUID | Primary key; the application supplies it so the attachment filename can match |
| `timestamp` | TIMESTAMPTZ | Not null, default now; indexed descending |
| `type` | TEXT | Not null — no check constraint, so any string is accepted |
| `details` | TEXT | Not null |
| `attachment` | TEXT | Nullable; the object name in the bucket, `<feedbackId><ext>` |

**No reporter column.** Feedback is structurally anonymous — an administrator cannot attribute,
reply to, or de-duplicate by reporter.

## `api_keys`

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

## `api_key_usage_logs`

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

## Row Level Security

RLS is enabled on all eight tables, and each carries exactly one policy: **full access for
`service_role`**, for every operation, unconditionally.

This is a deliberate posture, not an oversight. The server is the only client, it holds the service
role key, and all authorisation — ownership, roles, approval status — is enforced in application code.
The policies exist so that a leaked anon key grants nothing.

The trade-off worth stating: there is no defence in depth at the row level. A bug in an application
ownership check is not caught by the database. Should the anon key ever be used directly (for
example, a future client-side integration), per-user policies would need writing from scratch.

---

## Storage buckets

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
