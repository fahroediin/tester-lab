import dotenv from 'dotenv';
import { supabase } from './supabase-client.js';

dotenv.config();

export interface ApiKeyUsageLog {
  id: string;
  apiKeyId?: string;
  keyName?: string;
  userId: string;
  endpoint: 'generate-script' | 'run-test';
  status: 'generated' | 'success' | 'failed';
  details?: string;
  createdAt: string;
}

export interface ApiKeyUsageSummary {
  apiKeyId: string;
  total: number;
  generated: number;
  success: number;
  failed: number;
  periodDays: number;
  periodStart: string;
}

// In-memory fallback logs in case database table is pending migration
const inMemoryUsageLogs: ApiKeyUsageLog[] = [];

/**
 * Get the reset period in days from environment variable (default: 30 days / 1 month)
 */
export function getUsageResetDays(): number {
  const days = parseInt(process.env.API_KEY_USAGE_RESET_DAYS || '30', 10);
  return isNaN(days) || days <= 0 ? 30 : days;
}

/**
 * Calculate the cutoff start date for the current reset period
 */
export function getPeriodStartDate(): Date {
  const resetDays = getUsageResetDays();
  const date = new Date();
  date.setDate(date.getDate() - resetDays);
  return date;
}

/**
 * Record an API key usage event
 */
export async function recordApiKeyUsage(params: {
  apiKeyId?: string;
  keyName?: string;
  userId: string;
  endpoint: 'generate-script' | 'run-test';
  status: 'generated' | 'success' | 'failed';
  details?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const logEntry: ApiKeyUsageLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    apiKeyId: params.apiKeyId,
    keyName: params.keyName,
    userId: params.userId,
    endpoint: params.endpoint,
    status: params.status,
    details: params.details,
    createdAt: now
  };

  // Keep in memory buffer
  inMemoryUsageLogs.unshift(logEntry);
  if (inMemoryUsageLogs.length > 5000) {
    inMemoryUsageLogs.length = 5000;
  }

  // Persist to Supabase if table exists
  try {
    const { error } = await supabase
      .from('api_key_usage_logs')
      .insert({
        api_key_id: params.apiKeyId || null,
        key_name: params.keyName || null,
        user_id: params.userId,
        endpoint: params.endpoint,
        status: params.status,
        details: params.details || null,
        created_at: now
      });

    if (error) {
      // If table doesn't exist yet, we silently fallback to in-memory tracking without breaking requests
      console.warn('[API Key Usage Log] Supabase insert warning (using in-memory fallback):', error.message);
    }
  } catch (err) {
    console.warn('[API Key Usage Log] Unexpected error during log persistence:', err);
  }
}

/**
 * Get usage summary for a specific API Key within the current period
 */
export async function getApiKeyUsageSummary(apiKeyId: string): Promise<ApiKeyUsageSummary> {
  const periodStart = getPeriodStartDate();
  const periodDays = getUsageResetDays();

  let generated = 0;
  let success = 0;
  let failed = 0;

  try {
    const { data, error } = await supabase
      .from('api_key_usage_logs')
      .select('status, created_at')
      .eq('api_key_id', apiKeyId)
      .gte('created_at', periodStart.toISOString());

    if (!error && data) {
      data.forEach((row) => {
        if (row.status === 'generated') generated++;
        else if (row.status === 'success') success++;
        else if (row.status === 'failed') failed++;
      });

      return {
        apiKeyId,
        total: data.length,
        generated,
        success,
        failed,
        periodDays,
        periodStart: periodStart.toISOString()
      };
    }
  } catch (err) {
    console.warn('[API Key Usage Summary] Error querying Supabase, falling back to memory:', err);
  }

  // Fallback to in-memory logs
  const matchingLogs = inMemoryUsageLogs.filter(
    (l) => l.apiKeyId === apiKeyId && new Date(l.createdAt) >= periodStart
  );

  matchingLogs.forEach((l) => {
    if (l.status === 'generated') generated++;
    else if (l.status === 'success') success++;
    else if (l.status === 'failed') failed++;
  });

  return {
    apiKeyId,
    total: matchingLogs.length,
    generated,
    success,
    failed,
    periodDays,
    periodStart: periodStart.toISOString()
  };
}

/**
 * Get usage summary for all API keys of a user within the current reset period
 */
export async function getUserApiKeysUsageSummary(userId: string): Promise<Record<string, ApiKeyUsageSummary>> {
  const periodStart = getPeriodStartDate();
  const periodDays = getUsageResetDays();
  const summaries: Record<string, ApiKeyUsageSummary> = {};

  try {
    const { data, error } = await supabase
      .from('api_key_usage_logs')
      .select('api_key_id, status, created_at')
      .eq('user_id', userId)
      .gte('created_at', periodStart.toISOString());

    if (!error && data) {
      data.forEach((row) => {
        const keyId = row.api_key_id;
        if (!keyId) return;

        if (!summaries[keyId]) {
          summaries[keyId] = {
            apiKeyId: keyId,
            total: 0,
            generated: 0,
            success: 0,
            failed: 0,
            periodDays,
            periodStart: periodStart.toISOString()
          };
        }

        summaries[keyId].total++;
        if (row.status === 'generated') summaries[keyId].generated++;
        else if (row.status === 'success') summaries[keyId].success++;
        else if (row.status === 'failed') summaries[keyId].failed++;
      });

      return summaries;
    }
  } catch (err) {
    console.warn('[User API Keys Usage] Error querying Supabase, using memory fallback:', err);
  }

  // In-memory fallback
  const matchingLogs = inMemoryUsageLogs.filter(
    (l) => l.userId === userId && new Date(l.createdAt) >= periodStart
  );

  matchingLogs.forEach((l) => {
    const keyId = l.apiKeyId;
    if (!keyId) return;

    if (!summaries[keyId]) {
      summaries[keyId] = {
        apiKeyId: keyId,
        total: 0,
        generated: 0,
        success: 0,
        failed: 0,
        periodDays,
        periodStart: periodStart.toISOString()
      };
    }

    summaries[keyId].total++;
    if (l.status === 'generated') summaries[keyId].generated++;
    else if (l.status === 'success') summaries[keyId].success++;
    else if (l.status === 'failed') summaries[keyId].failed++;
  });

  return summaries;
}

/**
 * Get usage summary for all API keys in system (for admin portal)
 */
export async function getAllApiKeysUsageSummary(): Promise<Record<string, ApiKeyUsageSummary>> {
  const periodStart = getPeriodStartDate();
  const periodDays = getUsageResetDays();
  const summaries: Record<string, ApiKeyUsageSummary> = {};

  try {
    const { data, error } = await supabase
      .from('api_key_usage_logs')
      .select('api_key_id, status, created_at')
      .gte('created_at', periodStart.toISOString());

    if (!error && data) {
      data.forEach((row) => {
        const keyId = row.api_key_id;
        if (!keyId) return;

        if (!summaries[keyId]) {
          summaries[keyId] = {
            apiKeyId: keyId,
            total: 0,
            generated: 0,
            success: 0,
            failed: 0,
            periodDays,
            periodStart: periodStart.toISOString()
          };
        }

        summaries[keyId].total++;
        if (row.status === 'generated') summaries[keyId].generated++;
        else if (row.status === 'success') summaries[keyId].success++;
        else if (row.status === 'failed') summaries[keyId].failed++;
      });

      return summaries;
    }
  } catch (err) {
    console.warn('[All API Keys Usage] Error querying Supabase, using memory fallback:', err);
  }

  // In-memory fallback
  const matchingLogs = inMemoryUsageLogs.filter(
    (l) => new Date(l.createdAt) >= periodStart
  );

  matchingLogs.forEach((l) => {
    const keyId = l.apiKeyId;
    if (!keyId) return;

    if (!summaries[keyId]) {
      summaries[keyId] = {
        apiKeyId: keyId,
        total: 0,
        generated: 0,
        success: 0,
        failed: 0,
        periodDays,
        periodStart: periodStart.toISOString()
      };
    }

    summaries[keyId].total++;
    if (l.status === 'generated') summaries[keyId].generated++;
    else if (l.status === 'success') summaries[keyId].success++;
    else if (l.status === 'failed') summaries[keyId].failed++;
  });

  return summaries;
}

export interface AdminApiKeyStats {
  totalRequests: number;
  totalGenerated: number;
  totalSuccess: number;
  totalFailed: number;
  periodDays: number;
  periodStart: string;
}

/**
 * Get aggregate statistics across all API keys
 */
export async function getAdminApiKeyStats(): Promise<AdminApiKeyStats> {
  const periodStart = getPeriodStartDate();
  const periodDays = getUsageResetDays();

  let totalRequests = 0;
  let totalGenerated = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  try {
    const { data, error } = await supabase
      .from('api_key_usage_logs')
      .select('status, created_at')
      .gte('created_at', periodStart.toISOString());

    if (!error && data) {
      totalRequests = data.length;
      data.forEach((r) => {
        if (r.status === 'generated') totalGenerated++;
        else if (r.status === 'success') totalSuccess++;
        else if (r.status === 'failed') totalFailed++;
      });

      return {
        totalRequests,
        totalGenerated,
        totalSuccess,
        totalFailed,
        periodDays,
        periodStart: periodStart.toISOString()
      };
    }
  } catch (err) {
    console.warn('[Admin API Key Stats] Supabase query error, fallback to memory:', err);
  }

  const matching = inMemoryUsageLogs.filter((l) => new Date(l.createdAt) >= periodStart);
  totalRequests = matching.length;
  matching.forEach((r) => {
    if (r.status === 'generated') totalGenerated++;
    else if (r.status === 'success') totalSuccess++;
    else if (r.status === 'failed') totalFailed++;
  });

  return {
    totalRequests,
    totalGenerated,
    totalSuccess,
    totalFailed,
    periodDays,
    periodStart: periodStart.toISOString()
  };
}

export interface EnrichedApiKeyUsageLog extends ApiKeyUsageLog {
  keyName?: string;
  username?: string;
}

/**
 * Get paginated API key usage logs with associated key and user metadata
 */
export async function getAdminApiKeyLogs(page: number = 1, limit: number = 15): Promise<{ logs: EnrichedApiKeyUsageLog[]; total: number }> {
  const startIndex = (page - 1) * limit;

  try {
    const { count: totalCount } = await supabase
      .from('api_key_usage_logs')
      .select('*', { count: 'exact', head: true });

    const { data: logRows, error } = await supabase
      .from('api_key_usage_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(startIndex, startIndex + limit - 1);

    if (!error && logRows) {
      // Gather keys & users for enrichment
      const keyIds = [...new Set(logRows.map(r => r.api_key_id).filter(Boolean))];
      const userIds = [...new Set(logRows.map(r => r.user_id).filter(Boolean))];

      let keyMap: Record<string, string> = {};
      let userMap: Record<string, string> = {};

      if (keyIds.length > 0) {
        const { data: keys } = await supabase.from('api_keys').select('id, name').in('id', keyIds);
        (keys || []).forEach(k => { keyMap[k.id] = k.name; });
      }

      if (userIds.length > 0) {
        const { data: users } = await supabase.from('users').select('id, username').in('id', userIds);
        (users || []).forEach(u => { userMap[u.id] = u.username; });
      }

      const logs: EnrichedApiKeyUsageLog[] = logRows.map(r => {
        let keyDisplayName = 'Direct API';
        if (r.api_key_id && keyMap[r.api_key_id]) {
          keyDisplayName = keyMap[r.api_key_id] || 'Unknown Key';
        } else if (r.key_name) {
          keyDisplayName = r.api_key_id ? r.key_name : `${r.key_name} (Deleted)`;
        } else if (r.api_key_id) {
          keyDisplayName = 'Deleted API Key';
        }

        return {
          id: r.id || `log_${Date.now()}`,
          apiKeyId: r.api_key_id,
          keyName: keyDisplayName,
          userId: r.user_id,
          endpoint: r.endpoint,
          status: r.status,
          details: r.details,
          createdAt: r.created_at || new Date().toISOString(),
          username: userMap[r.user_id] || r.user_id
        };
      });

      return {
        logs,
        total: totalCount || logs.length
      };
    }
  } catch (err) {
    console.warn('[Admin API Key Logs] Supabase error, falling back to memory:', err);
  }

  const logs = inMemoryUsageLogs.slice(startIndex, startIndex + limit).map(l => ({
    ...l,
    keyName: l.keyName || (l.apiKeyId ? 'API Key (Deleted)' : 'Direct API'),
    username: l.userId
  }));

  return {
    logs,
    total: inMemoryUsageLogs.length
  };
}
