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
const supabase_client_js_1 = require("./supabase-client.js");
const storage_url_js_1 = require("./lib/storage-url.js");
function rowToFlowHistory(row) {
    return {
        id: row.id,
        userId: row.user_id,
        username: row.username,
        timestamp: row.timestamp,
        testSuite: row.test_suite,
        targetUrl: row.target_url,
        status: row.status,
        generatedCode: row.generated_code,
        resolvedSteps: Array.isArray(row.resolved_steps) ? row.resolved_steps : [],
        rawDsl: row.raw_dsl || undefined,
        videoUrl: row.video_url || undefined,
        runLogs: row.run_logs || undefined,
        durationMs: row.duration_ms || undefined
    };
}
async function addHistory(record) {
    const { data, error } = await supabase_client_js_1.supabase
        .from('flow_history')
        .insert({
        user_id: record.userId,
        username: record.username,
        test_suite: record.testSuite,
        target_url: record.targetUrl,
        status: record.status,
        generated_code: record.generatedCode,
        resolved_steps: record.resolvedSteps,
        raw_dsl: record.rawDsl || null
    })
        .select()
        .single();
    if (error || !data) {
        console.error('Failed to add history record:', error);
        throw new Error('Failed to save history record');
    }
    return rowToFlowHistory(data);
}
async function getUserHistory(userId) {
    const { data, error } = await supabase_client_js_1.supabase
        .from('flow_history')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });
    if (error) {
        console.error('Failed to fetch user history:', error);
        return [];
    }
    return (data || []).map(rowToFlowHistory);
}
async function getHistoryById(id) {
    const { data, error } = await supabase_client_js_1.supabase
        .from('flow_history')
        .select('*')
        .eq('id', id)
        .limit(1)
        .single();
    if (error || !data)
        return undefined;
    return rowToFlowHistory(data);
}
async function updateHistory(id, updates) {
    const updatePayload = {};
    if (updates.status !== undefined)
        updatePayload.status = updates.status;
    if (updates.rawDsl !== undefined)
        updatePayload.raw_dsl = updates.rawDsl;
    if (updates.videoUrl !== undefined)
        updatePayload.video_url = updates.videoUrl;
    if (updates.runLogs !== undefined)
        updatePayload.run_logs = updates.runLogs;
    if (updates.durationMs !== undefined)
        updatePayload.duration_ms = updates.durationMs;
    const { data, error } = await supabase_client_js_1.supabase
        .from('flow_history')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();
    if (error || !data) {
        console.error('Failed to update history:', error);
        return null;
    }
    return rowToFlowHistory(data);
}
async function deleteHistory(id) {
    // First get the record to check for video
    const record = await getHistoryById(id);
    if (!record)
        return false;
    // Clean up associated video if exists (Supabase Storage object and/or legacy local file)
    if (record.videoUrl) {
        try {
            const objectPath = (0, storage_url_js_1.toVideoStoragePath)(record.videoUrl);
            if (objectPath) {
                await supabase_client_js_1.supabase.storage.from('test-videos').remove([objectPath]);
            }
            // Legacy local-file fallback (older records stored a public-relative path)
            if (!record.videoUrl.includes('/test-videos/') && !record.videoUrl.startsWith('http')) {
                const videoPath = path_1.default.join(process.cwd(), 'public', record.videoUrl);
                if (fs_1.default.existsSync(videoPath)) {
                    fs_1.default.unlinkSync(videoPath);
                }
            }
        }
        catch (err) {
            console.warn(`Failed to delete video for history ${id}:`, err.message || err);
        }
    }
    const { error } = await supabase_client_js_1.supabase
        .from('flow_history')
        .delete()
        .eq('id', id);
    if (error) {
        console.error('Failed to delete history:', error);
        return false;
    }
    return true;
}
