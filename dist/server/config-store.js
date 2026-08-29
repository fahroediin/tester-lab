"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
const supabase_client_js_1 = require("./supabase-client.js");
const DEFAULT_CONFIG = {
    sampleTestSuite: '',
    sampleTargetUrl: '',
    sampleSteps: []
};
async function loadConfig() {
    try {
        const { data, error } = await supabase_client_js_1.supabase
            .from('app_config')
            .select('*')
            .eq('id', 1)
            .single();
        if (error || !data) {
            return DEFAULT_CONFIG;
        }
        return {
            sampleTestSuite: data.sample_test_suite || '',
            sampleTargetUrl: data.sample_target_url || '',
            sampleSteps: Array.isArray(data.sample_steps) ? data.sample_steps : []
        };
    }
    catch (err) {
        console.error('Failed to load config from Supabase:', err.message || err);
        return DEFAULT_CONFIG;
    }
}
async function saveConfig(newConfig) {
    try {
        const { error } = await supabase_client_js_1.supabase
            .from('app_config')
            .upsert({
            id: 1,
            sample_test_suite: newConfig.sampleTestSuite,
            sample_target_url: newConfig.sampleTargetUrl,
            sample_steps: newConfig.sampleSteps,
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
        if (error) {
            console.error('Failed to save config:', error);
            throw new Error('Could not save configuration');
        }
    }
    catch (err) {
        console.error('Failed to save config:', err.message || err);
        throw new Error('Could not save configuration');
    }
}
