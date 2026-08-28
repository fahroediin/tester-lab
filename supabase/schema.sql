-- ============================================================
-- Supabase Schema for Tester Lab
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast username lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users (LOWER(username));

-- 2. FLOW HISTORY TABLE
CREATE TABLE IF NOT EXISTS flow_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  test_suite TEXT NOT NULL DEFAULT '',
  target_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'GENERATED' CHECK (status IN ('GENERATED', 'RUNNING', 'SUCCESS', 'FAILED')),
  generated_code TEXT NOT NULL DEFAULT '',
  resolved_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_dsl JSONB,
  video_url TEXT,
  run_logs TEXT,
  duration_ms INTEGER
);

-- Index for fast user history lookups
CREATE INDEX IF NOT EXISTS idx_flow_history_user_id ON flow_history (user_id);
CREATE INDEX IF NOT EXISTS idx_flow_history_timestamp ON flow_history (timestamp DESC);

-- 3. ACTIVITY LOGS TABLE
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast time-based retrieval
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs (timestamp DESC);

-- 4. APP CONFIG TABLE (single-row config pattern)
CREATE TABLE IF NOT EXISTS app_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sample_test_suite TEXT NOT NULL DEFAULT '',
  sample_target_url TEXT NOT NULL DEFAULT '',
  sample_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default row if not exists
INSERT INTO app_config (id, sample_test_suite, sample_target_url, sample_steps)
VALUES (1, '', '', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 5. FEEDBACKS TABLE
CREATE TABLE IF NOT EXISTS feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL,
  details TEXT NOT NULL,
  attachment TEXT
);

-- Index for time-based retrieval
CREATE INDEX IF NOT EXISTS idx_feedbacks_timestamp ON feedbacks (timestamp DESC);

-- 6. API KEYS TABLE
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default API Key',
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

-- Index for fast key lookup and user listing
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys (user_id);


-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- USERS: Service role can do everything (server-side operations)
CREATE POLICY "Service role full access on users"
  ON users FOR ALL
  USING (true)
  WITH CHECK (true);

-- FLOW HISTORY: Service role can do everything
CREATE POLICY "Service role full access on flow_history"
  ON flow_history FOR ALL
  USING (true)
  WITH CHECK (true);

-- ACTIVITY LOGS: Service role can do everything
CREATE POLICY "Service role full access on activity_logs"
  ON activity_logs FOR ALL
  USING (true)
  WITH CHECK (true);

-- APP CONFIG: Service role can do everything
CREATE POLICY "Service role full access on app_config"
  ON app_config FOR ALL
  USING (true)
  WITH CHECK (true);

-- FEEDBACKS: Service role can do everything
CREATE POLICY "Service role full access on feedbacks"
  ON feedbacks FOR ALL
  USING (true)
  WITH CHECK (true);

-- API KEYS: Service role can do everything
CREATE POLICY "Service role full access on api_keys"
  ON api_keys FOR ALL
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- SUPABASE STORAGE BUCKETS (FEEDBACK ATTACHMENTS & TEST VIDEOS)
-- ============================================================
-- Run this separately or via Supabase Dashboard > Storage:

-- 1. Feedback Attachments Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-attachments', 'feedback-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access on feedback-attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'feedback-attachments');

CREATE POLICY "Service role upload on feedback-attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'feedback-attachments');

CREATE POLICY "Service role delete on feedback-attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'feedback-attachments');

-- 2. Test Execution Videos Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('test-videos', 'test-videos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access on test-videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'test-videos');

CREATE POLICY "Service role upload on test-videos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'test-videos');

CREATE POLICY "Service role delete on test-videos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'test-videos');
