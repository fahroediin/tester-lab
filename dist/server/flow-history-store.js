"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addHistory = addHistory;
exports.getUserHistory = getUserHistory;
exports.getHistoryById = getHistoryById;
exports.updateHistory = updateHistory;
exports.deleteHistory = deleteHistory;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const DATA_DIR = path_1.default.join(process.cwd(), 'data');
const HISTORY_FILE = path_1.default.join(DATA_DIR, 'flow-history.json');
function ensureDataDir() {
    if (!fs_1.default.existsSync(DATA_DIR)) {
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    }
}
function loadHistoryData() {
    try {
        ensureDataDir();
        if (!fs_1.default.existsSync(HISTORY_FILE)) {
            return [];
        }
        const data = fs_1.default.readFileSync(HISTORY_FILE, 'utf-8');
        return JSON.parse(data);
    }
    catch (err) {
        console.error('Failed to load history data:', err);
        return [];
    }
}
function saveHistoryData(history) {
    try {
        ensureDataDir();
        fs_1.default.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
    }
    catch (err) {
        console.error('Failed to save history data:', err);
    }
}
function addHistory(record) {
    const history = loadHistoryData();
    const newRecord = {
        ...record,
        id: (0, crypto_1.randomUUID)(),
        timestamp: new Date().toISOString()
    };
    history.push(newRecord);
    saveHistoryData(history);
    return newRecord;
}
function getUserHistory(userId) {
    const history = loadHistoryData();
    return history
        .filter(record => record.userId === userId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
function getHistoryById(id) {
    const history = loadHistoryData();
    return history.find(record => record.id === id);
}
function updateHistory(id, updates) {
    const history = loadHistoryData();
    const index = history.findIndex(record => record.id === id);
    if (index === -1) {
        return null;
    }
    const existing = history[index];
    if (!existing)
        return null;
    history[index] = {
        ...existing,
        status: updates.status !== undefined ? updates.status : existing.status,
        rawDsl: updates.rawDsl !== undefined ? updates.rawDsl : existing.rawDsl,
        videoUrl: updates.videoUrl !== undefined ? updates.videoUrl : existing.videoUrl,
        runLogs: updates.runLogs !== undefined ? updates.runLogs : existing.runLogs,
        durationMs: updates.durationMs !== undefined ? updates.durationMs : existing.durationMs
    };
    saveHistoryData(history);
    return history[index] ?? null;
}
function deleteHistory(id) {
    const history = loadHistoryData();
    const index = history.findIndex(record => record.id === id);
    if (index === -1) {
        return false;
    }
    const record = history[index];
    if (!record)
        return false;
    // Clean up associated video if exists
    if (record.videoUrl) {
        try {
            // videoUrl is something like /videos/<userId>/run_123.webm
            const videoPath = path_1.default.join(process.cwd(), 'public', record.videoUrl);
            if (fs_1.default.existsSync(videoPath)) {
                fs_1.default.unlinkSync(videoPath);
            }
        }
        catch (err) {
            console.warn(`Failed to delete video for history ${id}:`, err);
        }
    }
    history.splice(index, 1);
    saveHistoryData(history);
    return true;
}
