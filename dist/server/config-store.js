"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(process.cwd(), 'data');
const CONFIG_FILE = path_1.default.join(DATA_DIR, 'config.json');
const DEFAULT_CONFIG = {
    sampleTestSuite: '',
    sampleTargetUrl: '',
    sampleSteps: []
};
function ensureDataDir() {
    if (!fs_1.default.existsSync(DATA_DIR)) {
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    }
}
function loadConfig() {
    try {
        ensureDataDir();
        if (!fs_1.default.existsSync(CONFIG_FILE)) {
            saveConfig(DEFAULT_CONFIG);
            return DEFAULT_CONFIG;
        }
        const data = fs_1.default.readFileSync(CONFIG_FILE, 'utf-8');
        return JSON.parse(data);
    }
    catch (err) {
        console.error('Failed to load config, returning default:', err);
        return DEFAULT_CONFIG;
    }
}
function saveConfig(newConfig) {
    try {
        ensureDataDir();
        fs_1.default.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf-8');
    }
    catch (err) {
        console.error('Failed to save config:', err);
        throw new Error('Could not save configuration');
    }
}
