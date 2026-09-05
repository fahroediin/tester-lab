import fs from 'fs';
import path from 'path';
import { supabase } from './supabase-client.js';
import { toVideoStoragePath } from './lib/storage-url.js';
import type { ResolvedStep, DSLConfig } from '../types/index.js';

export interface FlowHistory {
  id: string;
  userId: string;
  username: string;
  folderId?: string | null;
  timestamp: string;
  testSuite: string;
  targetUrl: string;
  status: 'GENERATED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  generatedCode: string;
  resolvedSteps: ResolvedStep[];
  rawDsl?: DSLConfig | Record<string, unknown>;
  videoUrl?: string;
  runLogs?: string;
  durationMs?: number;
}

interface FlowHistoryRow {
  id: string;
  user_id: string;
  username: string;
  folder_id: string | null;
  timestamp: string;
  test_suite: string;
  target_url: string;
  status: string;
  generated_code: string;
  resolved_steps: unknown;
  raw_dsl: unknown;
  video_url: string | null;
  run_logs: string | null;
  duration_ms: number | null;
}

function rowToFlowHistory(row: FlowHistoryRow): FlowHistory {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    folderId: row.folder_id || undefined,
    timestamp: row.timestamp,
    testSuite: row.test_suite,
    targetUrl: row.target_url,
    status: row.status as FlowHistory['status'],
    generatedCode: row.generated_code,
    resolvedSteps: Array.isArray(row.resolved_steps) ? (row.resolved_steps as ResolvedStep[]) : [],
    rawDsl: (row.raw_dsl as DSLConfig | Record<string, unknown>) || undefined,
    videoUrl: row.video_url || undefined,
    runLogs: row.run_logs || undefined,
    durationMs: row.duration_ms || undefined
  };
}

export async function addHistory(record: Omit<FlowHistory, 'id' | 'timestamp'>): Promise<FlowHistory> {
  const { data, error } = await supabase
    .from('flow_history')
    .insert({
      user_id: record.userId,
      username: record.username,
      folder_id: record.folderId || null,
      test_suite: record.testSuite,
      target_url: record.targetUrl,
      status: record.status,
      generated_code: record.generatedCode,
      resolved_steps: record.resolvedSteps,
      raw_dsl: record.rawDsl || null
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to add history record:', error);
    throw new Error('Failed to save history record');
  }

  return rowToFlowHistory(data);
}

export async function getUserHistory(userId: string): Promise<FlowHistory[]> {
  const { data, error } = await supabase
    .from('flow_history')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('Failed to fetch user history:', error);
    return [];
  }

  return (data || []).map(rowToFlowHistory);
}

export async function getHistoryById(id: string): Promise<FlowHistory | undefined> {
  const { data, error } = await supabase
    .from('flow_history')
    .select('*')
    .eq('id', id)
    .limit(1)
    .single();

  if (error || !data) return undefined;
  return rowToFlowHistory(data);
}

export async function updateHistory(id: string, updates: Partial<FlowHistory>): Promise<FlowHistory | null> {
  const updatePayload: Record<string, unknown> = {};
  if (updates.status !== undefined) updatePayload.status = updates.status;
  // folderId is nullable: pass null explicitly to move a scenario to uncategorized.
  if ('folderId' in updates) updatePayload.folder_id = updates.folderId ?? null;
  if (updates.generatedCode !== undefined) updatePayload.generated_code = updates.generatedCode;
  if (updates.rawDsl !== undefined) updatePayload.raw_dsl = updates.rawDsl;
  if (updates.videoUrl !== undefined) updatePayload.video_url = updates.videoUrl;
  if (updates.runLogs !== undefined) updatePayload.run_logs = updates.runLogs;
  if (updates.durationMs !== undefined) updatePayload.duration_ms = updates.durationMs;

  const { data, error } = await supabase
    .from('flow_history')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to update history:', error);
    return null;
  }

  return rowToFlowHistory(data);
}

export async function deleteHistory(id: string): Promise<boolean> {
  // First get the record to check for video
  const record = await getHistoryById(id);
  if (!record) return false;

  // Clean up associated video if exists (Supabase Storage object and/or legacy local file)
  if (record.videoUrl) {
    try {
      const objectPath = toVideoStoragePath(record.videoUrl);
      if (objectPath) {
        await supabase.storage.from('test-videos').remove([objectPath]);
      }
      // Legacy local-file fallback (older records stored a public-relative path)
      if (!record.videoUrl.includes('/test-videos/') && !record.videoUrl.startsWith('http')) {
        const videoPath = path.join(process.cwd(), 'public', record.videoUrl);
        if (fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
      }
    } catch (err: unknown) {
      console.warn(`Failed to delete video for history ${id}:`, (err as Error).message || err);
    }
  }

  const { error } = await supabase
    .from('flow_history')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete history:', error);
    return false;
  }

  return true;
}
