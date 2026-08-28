"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestScriptGenerator = exports.DryRunEngine = exports.CodeGenerator = exports.HeuristicMatcher = exports.DOMExtractor = exports.validateDSL = void 0;
const dsl_validator_js_1 = require("./validator/dsl-validator.js");
const dom_extractor_js_1 = require("./crawler/dom-extractor.js");
const heuristic_matcher_js_1 = require("./matcher/heuristic-matcher.js");
const code_generator_js_1 = require("./generator/code-generator.js");
const dry_run_engine_js_1 = require("./validator/dry-run-engine.js");
__exportStar(require("./types/index.js"), exports);
var dsl_validator_js_2 = require("./validator/dsl-validator.js");
Object.defineProperty(exports, "validateDSL", { enumerable: true, get: function () { return dsl_validator_js_2.validateDSL; } });
var dom_extractor_js_2 = require("./crawler/dom-extractor.js");
Object.defineProperty(exports, "DOMExtractor", { enumerable: true, get: function () { return dom_extractor_js_2.DOMExtractor; } });
var heuristic_matcher_js_2 = require("./matcher/heuristic-matcher.js");
Object.defineProperty(exports, "HeuristicMatcher", { enumerable: true, get: function () { return heuristic_matcher_js_2.HeuristicMatcher; } });
var code_generator_js_2 = require("./generator/code-generator.js");
Object.defineProperty(exports, "CodeGenerator", { enumerable: true, get: function () { return code_generator_js_2.CodeGenerator; } });
var dry_run_engine_js_2 = require("./validator/dry-run-engine.js");
Object.defineProperty(exports, "DryRunEngine", { enumerable: true, get: function () { return dry_run_engine_js_2.DryRunEngine; } });
class TestScriptGenerator {
    extractor = new dom_extractor_js_1.DOMExtractor();
    matcher = new heuristic_matcher_js_1.HeuristicMatcher();
    generator = new code_generator_js_1.CodeGenerator();
    dryRunner = new dry_run_engine_js_1.DryRunEngine();
    /**
     * Main pipeline: Validate DSL -> Crawl DOM & State Transition -> Heuristic Match -> Transpile Code -> Dry Run
     */
    async generate(dslInput, options = {}) {
        // 1. Validate DSL Input
        const validation = (0, dsl_validator_js_1.validateDSL)(dslInput);
        if (!validation.valid || !validation.data) {
            return {
                success: false,
                code: '',
                resolvedSteps: [],
                warnings: validation.errors || ['DSL Validation Failed'],
                logs: ['DSL Validation Failed']
            };
        }
        const config = validation.data;
        // 2. Extract DOM Candidates with State Transition Crawling
        console.log(`[Crawler] Navigating to ${config.targetUrl} & inspecting state transition DOM elements...`);
        const stepExtractions = await this.extractor.extractCandidatesForSteps(config, this.matcher, {
            viewport: config.viewport
        });
        const resolvedSteps = stepExtractions.map((res) => res.resolvedStep);
        console.log(`[Crawler] Completed extraction & heuristic matching for ${resolvedSteps.length} steps.`);
        // 3. Generate Code String & Format via Prettier
        console.log(`[Generator] Emitting code string via Handlebars & Prettier...`);
        const result = await this.generator.generateScript(config, resolvedSteps);
        // Save to file if output path specified
        if (options.outPath) {
            await this.generator.saveToFile(options.outPath, result.code);
            result.logs.push(`[Output] Script saved to file: ${options.outPath}`);
        }
        // 4. Dry-Run & Self-Healing Loop (Optional)
        if (options.dryRun) {
            console.log(`[Dry-Run] Executing generated script in headless mode for verification...`);
            const dryRunRes = await this.dryRunner.executeDryRun(config, resolvedSteps, result.code);
            result.dryRunPassed = dryRunRes.success;
            result.dryRunError = dryRunRes.error;
            if (dryRunRes.selfHealed) {
                result.logs.push(`[Dry-Run] Script self-healed successfully after fallback strategy!`);
                // Replace original code with healed code so user receives the working version
                if (dryRunRes.healedCode) {
                    result.code = dryRunRes.healedCode;
                    result.logs.push(`[Dry-Run] Output code updated to self-healed version.`);
                }
            }
        }
        return result;
    }
}
exports.TestScriptGenerator = TestScriptGenerator;
