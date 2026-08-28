"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSanitizedEnv = getSanitizedEnv;
exports.findVideoFile = findVideoFile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Build a sanitized environment object for child processes.
 * Only includes variables required for Playwright to function.
 * ALL secrets (JWT_SECRET, ADMIN_PASSWORD, etc.) are stripped.
 */
function getSanitizedEnv() {
    const ALLOWED_ENV_KEYS = [
        'PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'SHELL',
        'DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS',
        'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
        'TMPDIR', 'TMP', 'TEMP',
        'PLAYWRIGHT_BROWSERS_PATH',
        'CHROMIUM_FLAGS', 'CHROME_FLAGS',
        'PUPPETEER_CHROMIUM_REVISION',
        'NODE_PATH',
        'SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles',
        'ProgramFiles(x86)', 'CommonProgramFiles', 'USERPROFILE',
        'HOMEDRIVE', 'HOMEPATH', 'PATHEXT', 'COMSPEC', 'windir',
    ];
    const sanitized = {};
    for (const key of ALLOWED_ENV_KEYS) {
        if (process.env[key]) {
            sanitized[key] = process.env[key];
        }
    }
    return sanitized;
}
/**
 * Helper to recursively search for generated .webm video files
 */
function findVideoFile(dir) {
    if (!fs_1.default.existsSync(dir))
        return null;
    const files = fs_1.default.readdirSync(dir);
    for (const file of files) {
        const fullPath = path_1.default.join(dir, file);
        if (fs_1.default.statSync(fullPath).isDirectory()) {
            const res = findVideoFile(fullPath);
            if (res)
                return res;
        }
        else if (file.endsWith('.webm')) {
            return fullPath;
        }
    }
    return null;
}
