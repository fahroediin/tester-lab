import dotenv from 'dotenv';
import { supabase } from './supabase-client.js';
import {
  ApiKeyUsageLog,
  ApiKeyUsageSummary,
  AdminApiKeyStats,
  EnrichedApiKeyUsageLog,
  pushInMemoryLog,
  getUsageResetDays,
  getPeriodStartDate,
  aggregateStatusCounts,
  getInMemoryKeySummary,
  getInMemoryUserKeySummaries,
  getInMemoryAdminStats,
  getInMemoryAdminLogs
} from './api-key-usage-helpers.js';

dotenv.config();

export {
  ApiKeyUsageLog,
  ApiKeyUsageSummary,
  AdminApiKeyStats,
  EnrichedApiKeyUsageLog,
  getUsageResetDays,
  getPeriodStartDate
};

/**
 * Record an API key usage event in memory and database
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

  pushInMemoryLog(logEntry);

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
      console.warn('[API Key Usage Log] Supabase insert warning (using in-memory fallback):', error.message);
    }
  } catch (err: unknown) {
    console.warn('[API Key Usage Log] Unexpected error during log persistence:', (err as Error).message || err);
  }
}

/**
 * Get usage summary for a specific API Key within the current period
 */
export async function getApiKeyUsageSummary(apiKeyId: string): Promise<ApiKeyUsageSummary> {
  const periodStart = getPeriodStartDate();
  const periodDays = getUsageResetDays();

  try {
    const { data, error } = await supabase
      .from('api_key_usage_logs')
      .select('status, created_at')
      .eq('api_key_id', apiKeyId)
      .gte('created_at', periodStart.toISOString());

    if (!error && data) {
      const counts = aggregateStatusCounts(data);
      return {
        apiKeyId,
        total: data.length,
        generated: counts.generated,
        success: counts.success,
        failed: counts.failed,
        periodDays,
        periodStart: periodStart.toISOString()
      };
    }
  } catch (err: unknown) {
    console.warn('[API Key Usage Summary] Error querying Supabase, falling back to memory:', (err as Error).message || err);
  }

  return getInMemoryKeySummary(apiKeyId, periodStart, periodDays);
}

/**
 * Helper to aggregate multi-key summaries from database rows
 */
function buildSummariesFromRows(
  rows: Array<{ api_key_id: string | null; status: string }>,
  periodDays: number,
  periodStartIso: string
): Record<string, ApiKeyUsageSummary> {
  const summaries: Record<string, ApiKeyUsageSummary> = {};

  for (const row of rows) {
    const keyId = row.api_key_id;
    if (!keyId) continue;

    if (!summaries[keyId]) {
      summaries[keyId] = {
        apiKeyId: keyId,
        total: 0,
        generated: 0,
        success: 0,
        failed: 0,
        periodDays,
        periodStart: periodStartIso
      };
    }

    const st = (row.status || '').toLowerCase().trim();
    summaries[keyId].total++;
    if (st === 'generated') summaries[keyId].generated++;
    else if (st === 'success' || st === 'passed') summaries[keyId].success++;
    else if (st === 'failed' || st === 'failure') summaries[keyId].failed++;
  }

  return summaries;
}

/**
 * Get usage summary for all API keys of a user within the current reset period
 */
export async function getUserApiKeysUsageSummary(userId: string): Promise<Record<string, ApiKeyUsageSummary>> {
  const periodStart = getPeriodStartDate();
  const periodDays = getUsageResetDays();

  try {
    const { data, error } = await supabase
      .from('api_key_usage_logs')
      .select('api_key_id, status, created_at')
      .eq('user_id', userId)
      .gte('created_at', periodStart.toISOString());

    if (!error && data) {
      return buildSummariesFromRows(data, periodDays, periodStart.toISOString());
    }
  } catch (err: unknown) {
    console.warn('[User API Keys Usage] Error querying Supabase, using memory fallback:', (err as Error).message || err);
  }

  return getInMemoryUserKeySummaries(periodStart, periodDays, userId);
}

/**
 * Get usage summary for all API keys in system (for admin portal)
 */
export async function getAllApiKeysUsageSummary(): Promise<Record<string, ApiKeyUsageSummary>> {
  const periodStart = getPeriodStartDate();
  const periodDays = getUsageResetDays();

  try {
    const { data, error } = await supabase
      .from('api_key_usage_logs')
      .select('api_key_id, status, created_at')
      .gte('created_at', periodStart.toISOString());

    if (!error && data) {
      return buildSummariesFromRows(data, periodDays, periodStart.toISOString());
    }
  } catch (err: unknown) {
    console.warn('[All API Keys Usage] Error querying Supabase, using memory fallback:', (err as Error).message || err);
  }

  return getInMemoryUserKeySummaries(periodStart, periodDays);
}

// Admin aggregate/stats queries live in a dedicated module (kept <250 lines per CODING_STANDARD 5.1)
export { getAdminApiKeyStats, getAdminApiKeyLogs } from './api-key-admin-store.js';
