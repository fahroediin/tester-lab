-- ============================================================
-- Migration: enforce unique email per account (AC-01.12 / AC-01.13)
-- Run this in Supabase SQL Editor on an existing database.
-- ============================================================
--
-- The register route rejects a duplicate email in app code, but this
-- case-insensitive unique index is the database-level backstop against a race
-- or a direct insert.
--
-- IMPORTANT: if the table already contains rows that collide on LOWER(email),
-- creating this index will FAIL. Find and resolve duplicates first, e.g.:
--
--   SELECT LOWER(email) AS email_ci, COUNT(*)
--   FROM users
--   GROUP BY LOWER(email)
--   HAVING COUNT(*) > 1;
--
-- then merge or remove the offending accounts before re-running this migration.

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (LOWER(email));
