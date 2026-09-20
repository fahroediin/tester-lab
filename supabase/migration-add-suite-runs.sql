-- Migration: suite_runs — persisted result of a Run Suite, for the suite-level
-- report (POC). One row per Run Suite: the aggregate status plus the full
-- per-scenario/per-step result snapshot, so a report can be rebuilt later.
-- No user stories or acceptance criteria are involved.

CREATE TABLE IF NOT EXISTS suite_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suite_id UUID REFERENCES suites(id) ON DELETE SET NULL,
  suite_name TEXT NOT NULL DEFAULT '',
  target_url TEXT NOT NULL DEFAULT '',
  job_status TEXT NOT NULL DEFAULT 'SKIPPED'
    CHECK (job_status IN ('PASSED', 'PARTIAL', 'FAILED', 'SKIPPED')),
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suite_runs_user_id ON suite_runs (user_id);
CREATE INDEX IF NOT EXISTS idx_suite_runs_suite_id ON suite_runs (suite_id);
CREATE INDEX IF NOT EXISTS idx_suite_runs_created_at ON suite_runs (created_at DESC);

ALTER TABLE suite_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suite_runs_service_role ON suite_runs;
CREATE POLICY suite_runs_service_role ON suite_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
