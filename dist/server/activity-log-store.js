"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadLogs = loadLogs;
exports.saveLogs = saveLogs;
exports.addLog = addLog;
exports.getLogs = getLogs;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dataDir = path_1.default.join(process.cwd(), 'data');
const logsFilePath = path_1.default.join(dataDir, 'activity-logs.json');
const MAX_LOG_RETENTION = 2000;
const DEFAULT_LOG_LIMIT = 100;
let cachedLogs = null;
function ensureDataDirExists() {
    if (!fs_1.default.existsSync(dataDir)) {
        fs_1.default.mkdirSync(dataDir, { recursive: true });
    }
}
function loadLogs() {
    if (cachedLogs !== null) {
        return cachedLogs;
    }
    ensureDataDirExists();
    let logs = [];
    if (fs_1.default.existsSync(logsFilePath)) {
        try {
            const raw = fs_1.default.readFileSync(logsFilePath, 'utf-8');
            logs = JSON.parse(raw);
        }
        catch {
            logs = [];
        }
    }
    cachedLogs = logs;
    return logs;
}
function saveLogs(logs) {
    ensureDataDirExists();
    fs_1.default.writeFileSync(logsFilePath, JSON.stringify(logs, null, 2), 'utf-8');
    cachedLogs = logs;
}
function addLog(log) {
    const logs = loadLogs();
    const newLog = {
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
function getLogs(limit = DEFAULT_LOG_LIMIT) {
    const logs = loadLogs();
    return logs.slice(0, limit);
}
