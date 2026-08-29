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

export interface AdminApiKeyStats {
  totalRequests: number;
  totalGenerated: number;
  totalSuccess: number;
  totalFailed: number;
  periodDays: number;
  periodStart: string;
}

export interface EnrichedApiKeyUsageLog extends ApiKeyUsageLog {
  keyName?: string;
  username?: string;
}

// In-memory fallback logs in case database table is pending migration or unreachable
export const inMemoryUsageLogs: ApiKeyUsageLog[] = [];

/**
 * Push log into memory buffer with cap
 */
export function pushInMemoryLog(log: ApiKeyUsageLog): void {
  inMemoryUsageLogs.unshift(log);
  if (inMemoryUsageLogs.length > 5000) {
    inMemoryUsageLogs.length = 5000;
  }
}

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
 * Aggregates counts of generated, success, and failed statuses from an array of status items
 */
export function aggregateStatusCounts(items: Array<{ status: string }>): { generated: number; success: number; failed: number } {
  let generated = 0;
  let success = 0;
  let failed = 0;

  for (const item of items) {
    if (item.status === 'generated') generated++;
    else if (item.status === 'success') success++;
    else if (item.status === 'failed') failed++;
  }

  return { generated, success, failed };
}

/**
 * In-memory fallback for a single key summary
 */
export function getInMemoryKeySummary(apiKeyId: string, periodStart: Date, periodDays: number): ApiKeyUsageSummary {
  const matching = inMemoryUsageLogs.filter(
    (l) => l.apiKeyId === apiKeyId && new Date(l.createdAt) >= periodStart
  );
  const counts = aggregateStatusCounts(matching);

  return {
    apiKeyId,
    total: matching.length,
    generated: counts.generated,
    success: counts.success,
    failed: counts.failed,
    periodDays,
    periodStart: periodStart.toISOString()
  };
}

/**
 * In-memory fallback for grouped user key summaries
 */
export function getInMemoryUserKeySummaries(
  periodStart: Date,
  periodDays: number,
  userId?: string
): Record<string, ApiKeyUsageSummary> {
  const matching = inMemoryUsageLogs.filter(
    (l) => (!userId || l.userId === userId) && new Date(l.createdAt) >= periodStart
  );

  const summaries: Record<string, ApiKeyUsageSummary> = {};
  for (const log of matching) {
    const keyId = log.apiKeyId;
    if (!keyId) continue;

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
    if (log.status === 'generated') summaries[keyId].generated++;
    else if (log.status === 'success') summaries[keyId].success++;
    else if (log.status === 'failed') summaries[keyId].failed++;
  }

  return summaries;
}

/**
 * In-memory fallback for admin overall stats
 */
export function getInMemoryAdminStats(periodStart: Date, periodDays: number): AdminApiKeyStats {
  const matching = inMemoryUsageLogs.filter((l) => new Date(l.createdAt) >= periodStart);
  const counts = aggregateStatusCounts(matching);

  return {
    totalRequests: matching.length,
    totalGenerated: counts.generated,
    totalSuccess: counts.success,
    totalFailed: counts.failed,
    periodDays,
    periodStart: periodStart.toISOString()
  };
}

/**
 * In-memory fallback for admin paginated logs
 */
export function getInMemoryAdminLogs(page: number, limit: number): { logs: EnrichedApiKeyUsageLog[]; total: number } {
  const startIndex = (page - 1) * limit;
  const logs = inMemoryUsageLogs.slice(startIndex, startIndex + limit).map((l) => ({
    ...l,
    keyName: l.keyName || (l.apiKeyId ? 'API Key (Deleted)' : 'Direct API'),
    username: l.userId
  }));

  return {
    logs,
    total: inMemoryUsageLogs.length
  };
}
