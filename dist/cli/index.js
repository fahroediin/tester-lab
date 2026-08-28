#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const commander_1 = require("commander");
const index_js_1 = require("../index.js");
const dom_extractor_js_1 = require("../crawler/dom-extractor.js");
const program = new commander_1.Command();
program
    .name('test-gen')
    .description('Non-LLM Rule & Heuristic Based Automated Test Script Generator')
    .version('1.0.0');
program
    .command('generate')
    .description('Generate Playwright test script from business rule JSON DSL')
    .requiredOption('-c, --config <path>', 'Path to JSON/YAML DSL configuration file')
    .option('-o, --out <path>', 'Path to output generated test spec file (e.g. ./tests/login.spec.ts)')
    .option('-d, --dry-run', 'Execute dry-run validation after code generation', false)
    .action(async (options) => {
    try {
        const configPath = path_1.default.resolve(options.config);
        if (!fs_1.default.existsSync(configPath)) {
            console.error(`[ERROR] Config file not found at ${configPath}`);
            process.exit(1);
        }
        const rawJson = fs_1.default.readFileSync(configPath, 'utf-8');
        const dslInput = JSON.parse(rawJson);
        const generator = new index_js_1.TestScriptGenerator();
        const result = await generator.generate(dslInput, {
            outPath: options.out ? path_1.default.resolve(options.out) : undefined,
            dryRun: options.dryRun
        });
        if (!result.success) {
            console.error('\n[ERROR] Generation Failed with Errors:');
            result.warnings.forEach((w) => console.error(`  - ${w}`));
            process.exit(1);
        }
        console.log('\n================ GENERATION SUMMARY ================');
        result.logs.forEach((log) => console.log(`[PASS] ${log}`));
        if (result.warnings.length > 0) {
            console.log('\n[WARNING] Warnings:');
            result.warnings.forEach((w) => console.warn(`  [WARN] ${w}`));
        }
        if (options.dryRun) {
            console.log('\n================ DRY-RUN RESULT ================');
            if (result.dryRunPassed) {
                console.log('[PASS] Dry-Run Verification Passed!');
            }
            else {
                console.error(`[ERROR] Dry-Run Verification Failed: ${result.dryRunError}`);
            }
        }
        console.log('\n================ GENERATED CODE ================');
        console.log(result.code);
    }
    catch (err) {
        const error = err;
        console.error('\n[ERROR] Fatal CLI Error:', error.message || error);
        process.exit(1);
    }
});
program
    .command('inspect')
    .description('Inspect interactive DOM element candidates from target URL')
    .requiredOption('-u, --url <url>', 'Target webpage URL')
    .action(async (options) => {
    try {
        console.log(`Inspecting DOM elements for URL: ${options.url}...`);
        const extractor = new dom_extractor_js_1.DOMExtractor();
        const candidates = await extractor.extractCandidates(options.url);
        console.log(`\nFound ${candidates.length} interactive candidate elements:\n`);
        console.dir(candidates, { depth: null, colors: true });
    }
    catch (err) {
        const error = err;
        console.error('\n[ERROR] Fatal CLI Error:', error.message || error);
        process.exit(1);
    }
});
program.parse(process.argv);
