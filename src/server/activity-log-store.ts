import { supabase } from './supabase-client.js';

export interface ActivityLog {
  id: string;
  userId?: string;
  username: string;
  action: string;
  details: string;
  timestamp: string;
}

interface ActivityLogRow {
  id: string;
  user_id: string | null;
  username: string;
  action: string;
  details: string;
  timestamp: string;
}

function rowToLog(row: ActivityLogRow): ActivityLog {
  return {
    id: row.id,
    userId: row.user_id || undefined,
    username: row.username,
    action: row.action,
    details: row.details,
    timestamp: row.timestamp
  };
}

export async function addLog(log: Omit<ActivityLog, 'id' | 'timestamp'>): Promise<ActivityLog> {
  const newId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const { data, error } = await supabase
    .from('activity_logs')
    .insert({
      id: newId,
      user_id: log.userId || null,
      username: log.username,
      action: log.action,
      details: log.details
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to add activity log:', error);
    // Return a fallback object to prevent caller crashes
    return {
      id: newId,
      userId: log.userId,
      username: log.username,
      action: log.action,
      details: log.details,
      timestamp: new Date().toISOString()
    };
  }

  return rowToLog(data);
}

export interface ActivityLogFilters {
  action?: string;
  username?: string;
}

/**
 * Escape LIKE/ILIKE wildcards so user input is matched literally
 * (e.g. the "_" in "qa_budi" must not match any single character).
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Trim filter values and drop empty ones; caps length to keep queries sane. */
export function normalizeLogFilters(raw: { action?: unknown; username?: unknown }): ActivityLogFilters {
  const clean = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const t = v.trim().slice(0, 100);
    return t.length > 0 ? t : undefined;
  };
  const filters: ActivityLogFilters = {};
  const action = clean(raw.action);
  const username = clean(raw.username);
  if (action) filters.action = action;
  if (username) filters.username = username;
  return filters;
}

export async function getLogs(limit: number = 100, filters: ActivityLogFilters = {}): Promise<ActivityLog[]> {
  let query = supabase
    .from('activity_logs')
    .select('*');

  if (filters.action) {
    query = query.eq('action', filters.action);
  }
  if (filters.username) {
    // Exact match, case-insensitive
    query = query.ilike('username', escapeLikePattern(filters.username));
  }

  const { data, error } = await query
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch activity logs:', error);
    return [];
  }

  return (data || []).map(rowToLog);
}
