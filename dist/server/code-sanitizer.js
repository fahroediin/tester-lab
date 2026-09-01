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
    // Environment variable / process access (dot AND bracket notation)
    { pattern: /process\s*\.\s*env/gi, reason: 'Access to process.env is not allowed' },
    { pattern: /process\s*\[/gi, reason: 'Bracket-notation access to process is not allowed' },
    { pattern: /process\s*\.\s*exit/gi, reason: 'Calling process.exit is not allowed' },
    { pattern: /process\s*\.\s*kill/gi, reason: 'Calling process.kill is not allowed' },
    { pattern: /process\s*\.\s*(binding|mainModule|dlopen)/gi, reason: 'Access to low-level process internals is not allowed' },
    // Command execution
    { pattern: /child_process/gi, reason: 'Access to child_process module is not allowed' },
    { pattern: /\bexecSync\b/gi, reason: 'execSync is not allowed' },
    { pattern: /\bexecFileSync\b/gi, reason: 'execFileSync is not allowed' },
    { pattern: /\bspawnSync\b/gi, reason: 'spawnSync is not allowed' },
    { pattern: /\bexecFile\b/gi, reason: 'execFile is not allowed' },
    // Filesystem access (outside Playwright)
    { pattern: /\bfs\s*\.\s*readFileSync\b/gi, reason: 'fs.readFileSync is not allowed' },
    { pattern: /\bfs\s*\.\s*writeFileSync\b/gi, reason: 'fs.writeFileSync is not allowed' },
    { pattern: /\bfs\s*\.\s*readdirSync\b/gi, reason: 'fs.readdirSync is not allowed' },
    { pattern: /\bfs\s*\.\s*unlinkSync\b/gi, reason: 'fs.unlinkSync is not allowed' },
    { pattern: /\bfs\s*\.\s*rmSync\b/gi, reason: 'fs.rmSync is not allowed' },
    // Dynamic code execution
    { pattern: /\beval\s*\(/gi, reason: 'eval() is not allowed' },
    { pattern: /\bnew\s+Function\s*\(/gi, reason: 'new Function() is not allowed' },
    { pattern: /\bFunction\s*\(\s*['"`]/gi, reason: 'Function constructor is not allowed' },
    { pattern: /\.\s*constructor\b/gi, reason: 'Access to .constructor is not allowed' },
    { pattern: /\bReflect\s*\.\s*(get|apply|construct|set)/gi, reason: 'Reflect metaprogramming is not allowed' },
    { pattern: /\bglobalThis\b/gi, reason: 'Access to globalThis is not allowed' },
    // Path disclosure / server introspection
    { pattern: /\b__dirname\b/gi, reason: 'Access to __dirname is not allowed' },
    { pattern: /\b__filename\b/gi, reason: 'Access to __filename is not allowed' },
    { pattern: /process\s*\.\s*cwd\s*\(\s*\)/gi, reason: 'Access to process.cwd() is not allowed' },
    { pattern: /process\s*\.\s*argv/gi, reason: 'Access to process.argv is not allowed' },
    { pattern: /\bimport\s*\.\s*meta/gi, reason: 'Access to import.meta is not allowed' },
    // Module loading — allow ONLY @playwright, block every other require/import form
    // (covers bracket, template-literal, variable and dynamic require/import that regex-by-string missed)
    { pattern: /\bimport\s*\(/gi, reason: 'Dynamic import() is not allowed' },
    { pattern: /\brequire\s*\(\s*(?!['"]@playwright)/gi, reason: 'Only require("@playwright/...") is permitted; loading other modules is not allowed' },
    { pattern: /\bimport\b[^;\n]*\bfrom\s+['"](?!@playwright)[^'"]+['"]/gi, reason: 'Only imports from "@playwright/..." are permitted' },
    { pattern: /\bimport\s+['"](?!@playwright)[^'"]+['"]/gi, reason: 'Only side-effect imports from "@playwright/..." are permitted' },
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
