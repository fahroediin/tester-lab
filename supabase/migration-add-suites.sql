-- ============================================================
-- Migration: Add Suites Table & Link to Flow History
-- Transforms hierarchy to: Project (folders) -> Suite (suites) -> Scenario (flow_history)
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Ensure folders (projects) table exists
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A user cannot have two projects with the same name
  CONSTRAINT uq_folders_user_name UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders (user_id);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on folders" ON folders;
CREATE POLICY "Service role full access on folders"
  ON folders FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Ensure flow_history has folder_id column
ALTER TABLE flow_history ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_flow_history_folder_id ON flow_history (folder_id);

-- 2. Create suites table
CREATE TABLE IF NOT EXISTS suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A project cannot have two suites with the same name
  CONSTRAINT uq_suites_project_name UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_suites_project_id ON suites (project_id);

-- Enable Row Level Security (RLS) on suites
ALTER TABLE suites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on suites" ON suites;
CREATE POLICY "Service role full access on suites"
  ON suites FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Add suite_id column to flow_history
ALTER TABLE flow_history ADD COLUMN IF NOT EXISTS suite_id UUID REFERENCES suites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_flow_history_suite_id ON flow_history (suite_id);
