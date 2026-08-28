import fs from 'fs';
import path from 'path';

export interface ActivityLog {
  id: string;
  userId?: string;
  username: string;
  action: string;
  details: string;
  timestamp: string;
}

const dataDir = path.join(process.cwd(), 'data');
const logsFilePath = path.join(dataDir, 'activity-logs.json');
const MAX_LOG_RETENTION = 2000;
const DEFAULT_LOG_LIMIT = 100;

let cachedLogs: ActivityLog[] | null = null;

function ensureDataDirExists() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export function loadLogs(): ActivityLog[] {
  if (cachedLogs !== null) {
    return cachedLogs;
  }

  ensureDataDirExists();
  let logs: ActivityLog[] = [];

  if (fs.existsSync(logsFilePath)) {
    try {
      const raw = fs.readFileSync(logsFilePath, 'utf-8');
      logs = JSON.parse(raw);
    } catch {
      logs = [];
    }
  }

  cachedLogs = logs;
  return logs;
}

export function saveLogs(logs: ActivityLog[]): void {
  ensureDataDirExists();
  fs.writeFileSync(logsFilePath, JSON.stringify(logs, null, 2), 'utf-8');
  cachedLogs = logs;
}

export function addLog(log: Omit<ActivityLog, 'id' | 'timestamp'>): ActivityLog {
  const logs = loadLogs();
  const newLog: ActivityLog = {
    ...log,
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString()
  };
  
  // Add to beginning of array so newest logs are first
  logs.unshift(newLog);
  
  // Optional: Limit logs size to prevent file bloat
  if (logs.length > MAX_LOG_RETENTION) {
    logs.pop();
  }
  
  saveLogs(logs);
  return newLog;
}

export function getLogs(limit: number = DEFAULT_LOG_LIMIT): ActivityLog[] {
  const logs = loadLogs();
  return logs.slice(0, limit);
}
