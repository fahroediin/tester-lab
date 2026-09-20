/*
 * tester-lab - Suite run store (POC).
 * Persists the result of a Run Suite so its suite-level report can be rebuilt
 * later. One row per run; the per-scenario results ride along as JSONB.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { supabase } from './supabase-client.js';
import type { JobStatus, ScenarioResult } from './services/run-suite-service.js';

export interface SuiteRun {
  id: string;
  userId: string;
  suiteId?: string | null;
  suiteName: string;
  targetUrl: string;
  jobStatus: JobStatus;
  results: ScenarioResult[];
  durationMs?: number;
  createdAt: string;
}

interface SuiteRunRow {
  id: string;
  user_id: string;
  suite_id: string | null;
  suite_name: string;
  target_url: string;
  job_status: string;
  results: unknown;
  duration_ms: number | null;
  created_at: string;
}

function rowToSuiteRun(row: SuiteRunRow): SuiteRun {
  return {
    id: row.id,
    userId: row.user_id,
    suiteId: row.suite_id || undefined,
    suiteName: row.suite_name,
    targetUrl: row.target_url,
    jobStatus: row.job_status as JobStatus,
    results: Array.isArray(row.results) ? (row.results as ScenarioResult[]) : [],
    durationMs: row.duration_ms || undefined,
    createdAt: row.created_at
  };
}

export async function addSuiteRun(record: Omit<SuiteRun, 'id' | 'createdAt'>): Promise<SuiteRun> {
  const { data, error } = await supabase
    .from('suite_runs')
    .insert({
      user_id: record.userId,
      suite_id: record.suiteId || null,
      suite_name: record.suiteName,
      target_url: record.targetUrl,
      job_status: record.jobStatus,
      results: record.results,
      duration_ms: record.durationMs ?? null
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to add suite run:', error);
    throw new Error('Failed to save suite run');
  }

  return rowToSuiteRun(data);
}

export async function getSuiteRunById(id: string): Promise<SuiteRun | null> {
  const { data, error } = await supabase.from('suite_runs').select('*').eq('id', id).single();
  if (error || !data) return null;
  return rowToSuiteRun(data);
}

export async function getSuiteRunsBySuite(suiteId: string): Promise<SuiteRun[]> {
  const { data, error } = await supabase
    .from('suite_runs')
    .select('*')
    .eq('suite_id', suiteId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch suite runs:', error);
    return [];
  }
  return (data || []).map(rowToSuiteRun);
}
