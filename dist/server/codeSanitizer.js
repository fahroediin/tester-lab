"use strict";
/**
 * Code Sanitizer — Defense-in-Depth Layer
 *
 * Validates user-submitted test code before execution to block
 * dangerous patterns that could lead to Remote Code Execution (RCE),
 * environment variable leakage, or filesystem access.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeCode = sanitizeCode;
/** Dangerous patterns that are NEVER allowed in submitted test code */
const BLOCKED_PATTERNS = [
    // Environment variable access
    { pattern: /process\.env/gi, reason: 'Access to process.env is not allowed' },
    { pattern: /process\.exit/gi, reason: 'Calling process.exit is not allowed' },
    { pattern: /process\.kill/gi, reason: 'Calling process.kill is not allowed' },
    // Command execution
    { pattern: /child_process/gi, reason: 'Access to child_process module is not allowed' },
    { pattern: /\bexecSync\b/gi, reason: 'execSync is not allowed' },
    { pattern: /\bexecFileSync\b/gi, reason: 'execFileSync is not allowed' },
    { pattern: /\bspawnSync\b/gi, reason: 'spawnSync is not allowed' },
    { pattern: /\bexecFile\b/gi, reason: 'execFile is not allowed' },
    { pattern: /\brequire\s*\(\s*['"`]child_process['"`]\s*\)/gi, reason: 'Importing child_process is not allowed' },
    // Filesystem access (outside Playwright)
    { pattern: /\brequire\s*\(\s*['"`]fs['"`]\s*\)/gi, reason: 'Direct filesystem access via require("fs") is not allowed' },
    { pattern: /\brequire\s*\(\s*['"`]fs\/promises['"`]\s*\)/gi, reason: 'Direct filesystem access via require("fs/promises") is not allowed' },
    { pattern: /\bimport\s+.*\bfrom\s+['"`]fs['"`]/gi, reason: 'Direct filesystem import is not allowed' },
    { pattern: /\bimport\s+.*\bfrom\s+['"`]fs\/promises['"`]/gi, reason: 'Direct filesystem import is not allowed' },
    { pattern: /\bfs\s*\.\s*readFileSync\b/gi, reason: 'fs.readFileSync is not allowed' },
    { pattern: /\bfs\s*\.\s*writeFileSync\b/gi, reason: 'fs.writeFileSync is not allowed' },
    { pattern: /\bfs\s*\.\s*readdirSync\b/gi, reason: 'fs.readdirSync is not allowed' },
    { pattern: /\bfs\s*\.\s*unlinkSync\b/gi, reason: 'fs.unlinkSync is not allowed' },
    { pattern: /\bfs\s*\.\s*rmSync\b/gi, reason: 'fs.rmSync is not allowed' },
    // Network access (outside Playwright)
    { pattern: /\brequire\s*\(\s*['"`]net['"`]\s*\)/gi, reason: 'Direct network access via require("net") is not allowed' },
    { pattern: /\brequire\s*\(\s*['"`]dgram['"`]\s*\)/gi, reason: 'Direct socket access is not allowed' },
    { pattern: /\brequire\s*\(\s*['"`]http['"`]\s*\)/gi, reason: 'Direct HTTP module access is not allowed' },
    { pattern: /\brequire\s*\(\s*['"`]https['"`]\s*\)/gi, reason: 'Direct HTTPS module access is not allowed' },
    // Dynamic code execution
    { pattern: /\beval\s*\(/gi, reason: 'eval() is not allowed' },
    { pattern: /\bnew\s+Function\s*\(/gi, reason: 'new Function() is not allowed' },
    { pattern: /\bFunction\s*\(\s*['"`]/gi, reason: 'Function constructor is not allowed' },
    // Path disclosure / server introspection
    { pattern: /\b__dirname\b/gi, reason: 'Access to __dirname is not allowed' },
    { pattern: /\b__filename\b/gi, reason: 'Access to __filename is not allowed' },
    { pattern: /process\.cwd\s*\(\s*\)/gi, reason: 'Access to process.cwd() is not allowed' },
    { pattern: /process\.argv/gi, reason: 'Access to process.argv is not allowed' },
    // OS module access
    { pattern: /\brequire\s*\(\s*['"`]os['"`]\s*\)/gi, reason: 'Access to os module is not allowed' },
    { pattern: /\bimport\s+.*\bfrom\s+['"`]os['"`]/gi, reason: 'Importing os module is not allowed' },
    // Crypto/path modules that could be used maliciously
    { pattern: /\brequire\s*\(\s*['"`]path['"`]\s*\)/gi, reason: 'Direct path module access is not allowed' },
    // Global require to load arbitrary modules
    { pattern: /\brequire\s*\(\s*['"`](?!@playwright)[^'"]*['"`]\s*\)/gi, reason: 'Loading arbitrary Node.js modules is not allowed. Only @playwright imports are permitted.' },
];
/**
 * Scan submitted code for dangerous patterns.
 * Returns { safe: true } if no violations found,
 * or { safe: false, violations: [...] } with human-readable reasons.
 */
function sanitizeCode(code) {
    const violations = [];
    for (const { pattern, reason } of BLOCKED_PATTERNS) {
        // Reset regex state (lastIndex) for global patterns
        pattern.lastIndex = 0;
        if (pattern.test(code)) {
            violations.push(reason);
        }
    }
    // Deduplicate violations
    const unique = [...new Set(violations)];
    return {
        safe: unique.length === 0,
        violations: unique
    };
}
