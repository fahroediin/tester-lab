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

export async function getLogs(limit: number = 100): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch activity logs:', error);
    return [];
  }

  return (data || []).map(rowToLog);
}
