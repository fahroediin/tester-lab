/*
 * tester-lab - Non-LLM Automated Test Script Generator
 * Copyright (c) 2026 Imam Fahrudin
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU Affero General Public License v3.0.
 * See the LICENSE file in the project root for full license text.
 */
import fs from 'fs';
import { validateDSL } from './validator/dsl-validator.js';
import { DOMExtractor } from './crawler/dom-extractor.js';
import { HeuristicMatcher } from './matcher/heuristic-matcher.js';
import { CodeGenerator } from './generator/code-generator.js';
import { DryRunEngine } from './validator/dry-run-engine.js';
import type { DSLConfig, GenerationResult, GenerationOptions, ResolvedStep } from './types/index.js';

export * from './types/index.js';
export { validateDSL } from './validator/dsl-validator.js';
export { DOMExtractor } from './crawler/dom-extractor.js';
export { HeuristicMatcher } from './matcher/heuristic-matcher.js';
export { CodeGenerator } from './generator/code-generator.js';
export { DryRunEngine } from './validator/dry-run-engine.js';

export class TestScriptGenerator {
  private extractor = new DOMExtractor();
  private matcher = new HeuristicMatcher();
  private generator = new CodeGenerator();
  private dryRunner = new DryRunEngine();

  /**
   * Main pipeline: Validate DSL -> Crawl DOM & State Transition -> Heuristic Match -> Transpile Code -> Dry Run
   */
  public async generate(
    dslInput: unknown,
    options: GenerationOptions = {}
  ): Promise<GenerationResult> {
    // 1. Validate DSL Input
    const validation = validateDSL(dslInput);
    if (!validation.valid || !validation.data) {
      return {
        success: false,
        code: '',
        resolvedSteps: [],
        warnings: validation.errors || ['DSL Validation Failed'],
        logs: ['DSL Validation Failed']
      };
    }

    const config: DSLConfig = validation.data;

    // 2. Extract DOM Candidates with State Transition Crawling
    console.log(`[Crawler] Navigating to ${config.targetUrl} & inspecting state transition DOM elements...`);
    const stepExtractions = await this.extractor.extractCandidatesForSteps(config, this.matcher, {
      viewport: config.viewport
    });

    const resolvedSteps: ResolvedStep[] = stepExtractions.map((res) => res.resolvedStep);
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
