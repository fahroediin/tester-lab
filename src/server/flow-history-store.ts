import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface FlowHistory {
  id: string;
  userId: string;
  username: string;
  timestamp: string;
  testSuite: string;
  targetUrl: string;
  status: 'GENERATED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  generatedCode: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolvedSteps: any[];
  videoUrl?: string;
  runLogs?: string;
  durationMs?: number;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'flow-history.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadHistoryData(): FlowHistory[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(HISTORY_FILE)) {
      return [];
    }
    const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load history data:', err);
    return [];
  }
}

function saveHistoryData(history: FlowHistory[]): void {
  try {
    ensureDataDir();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save history data:', err);
  }
}

export function addHistory(record: Omit<FlowHistory, 'id' | 'timestamp'>): FlowHistory {
  const history = loadHistoryData();
  const newRecord: FlowHistory = {
    ...record,
    id: randomUUID(),
    timestamp: new Date().toISOString()
  };
  history.push(newRecord);
  saveHistoryData(history);
  return newRecord;
}

export function getUserHistory(userId: string): FlowHistory[] {
  const history = loadHistoryData();
  return history
    .filter(record => record.userId === userId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function getHistoryById(id: string): FlowHistory | undefined {
  const history = loadHistoryData();
  return history.find(record => record.id === id);
}

export function updateHistory(id: string, updates: Partial<FlowHistory>): FlowHistory | null {
  const history = loadHistoryData();
  const index = history.findIndex(record => record.id === id);
  if (index === -1) {
    return null;
  }
  
  const existing = history[index];
  if (!existing) return null;

  history[index] = {
    ...existing,
    status: updates.status !== undefined ? updates.status : existing.status,
    videoUrl: updates.videoUrl !== undefined ? updates.videoUrl : existing.videoUrl,
    runLogs: updates.runLogs !== undefined ? updates.runLogs : existing.runLogs,
    durationMs: updates.durationMs !== undefined ? updates.durationMs : existing.durationMs
  };
  
  saveHistoryData(history);
  return history[index] ?? null;
}

export function deleteHistory(id: string): boolean {
  const history = loadHistoryData();
  const index = history.findIndex(record => record.id === id);
  if (index === -1) {
    return false;
  }
  
  const record = history[index];
  if (!record) return false;
  
  // Clean up associated video if exists
  if (record.videoUrl) {
    try {
      // videoUrl is something like /videos/<userId>/run_123.webm
      const videoPath = path.join(process.cwd(), 'public', record.videoUrl);
      if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
    } catch (err) {
      console.warn(`Failed to delete video for history ${id}:`, err);
    }
  }

  history.splice(index, 1);
  saveHistoryData(history);
  return true;
}
