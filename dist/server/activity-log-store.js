"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addLog = addLog;
exports.getLogs = getLogs;
const supabase_client_js_1 = require("./supabase-client.js");
function rowToLog(row) {
    return {
        id: row.id,
        userId: row.user_id || undefined,
        username: row.username,
        action: row.action,
        details: row.details,
        timestamp: row.timestamp
    };
}
async function addLog(log) {
    const newId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const { data, error } = await supabase_client_js_1.supabase
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
async function getLogs(limit = 100) {
    const { data, error } = await supabase_client_js_1.supabase
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
