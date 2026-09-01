import { supabase } from './supabase-client.js';
import {
  AdminApiKeyStats,
  EnrichedApiKeyUsageLog,
  getUsageResetDays,
  getPeriodStartDate,
  aggregateStatusCounts,
  getInMemoryAdminStats,
  getInMemoryAdminLogs
} from './api-key-usage-helpers.js';

/**
 * Get aggregate statistics across all API keys
 */
export async function getAdminApiKeyStats(): Promise<AdminApiKeyStats> {
  const periodStart = getPeriodStartDate();
  const periodDays = getUsageResetDays();

  try {
    const { data, error } = await supabase
      .from('api_key_usage_logs')
      .select('status, created_at')
      .gte('created_at', periodStart.toISOString());

    if (!error && data) {
      const counts = aggregateStatusCounts(data);
      return {
        totalRequests: data.length,
        totalGenerated: counts.generated,
        totalSuccess: counts.success,
        totalFailed: counts.failed,
        periodDays,
        periodStart: periodStart.toISOString()
      };
    }
  } catch (err: unknown) {
    console.warn('[Admin API Key Stats] Supabase query error, fallback to memory:', (err as Error).message || err);
  }

  return getInMemoryAdminStats(periodStart, periodDays);
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
      const keyIds = [...new Set(logRows.map(r => r.api_key_id).filter(Boolean))];
      const userIds = [...new Set(logRows.map(r => r.user_id).filter(Boolean))];

      const keyMap: Record<string, string> = {};
      const userMap: Record<string, string> = {};

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
  } catch (err: unknown) {
    console.warn('[Admin API Key Logs] Supabase error, falling back to memory:', (err as Error).message || err);
  }

  return getInMemoryAdminLogs(page, limit);
}
