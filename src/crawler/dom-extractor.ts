import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import type { DOMElementCandidate, DSLConfig, DSLStep, ResolvedStep } from '../types/index.js';
import { HeuristicMatcher } from '../matcher/heuristic-matcher.js';
import { extractCandidatesFromPage } from './dom-candidate-extractor.js';

export interface ExtractorOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeoutMs?: number;
}

export interface StepExtractionResult {
  step: DSLStep;
  candidates: DOMElementCandidate[];
  resolvedStep: ResolvedStep;
}

export class DOMExtractor {
  private browser: Browser | null = null;

  public async extractCandidates(
    url: string,
    options: ExtractorOptions = {}
  ): Promise<DOMElementCandidate[]> {
    const headless = options.headless ?? true;
    const viewport = options.viewport ?? { width: 1280, height: 720 };
    const timeout = options.timeoutMs ?? 30000;

    this.browser = await chromium.launch({ headless });
    const context = await this.browser.newContext({ viewport });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 1000 }).catch(() => {});
      await page.waitForSelector('input, button, form, a', { timeout: 2000 }).catch((e) => {
        console.warn('[Crawler] Wait for selector timed out:', e.message);
      });
      const candidates = await extractCandidatesFromPage(page);
      return candidates;
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }
  }

  /**
   * Interactive multi-step crawler: Executes steps on crawler page to transition DOM states
   */
  public async extractCandidatesForSteps(
    config: DSLConfig,
    matcher: HeuristicMatcher,
    options: ExtractorOptions = {}
  ): Promise<StepExtractionResult[]> {
    const headless = options.headless ?? true;
    const viewport = config.viewport || options.viewport || { width: 1280, height: 720 };
    const timeout = options.timeoutMs ?? 30000;

    this.browser = await chromium.launch({ headless });
    const context = await this.browser.newContext({ viewport });
    const page = await context.newPage();

    const results: StepExtractionResult[] = [];

    try {
      await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 1000 }).catch(() => {});
      await page.waitForSelector('input, button, form, a', { timeout: 2000 }).catch((e) => {
        console.warn('[Crawler] Wait for selector timed out during step execution:', e.message);
      });

      for (const step of config.steps) {
        // Extract current DOM state candidates
        const currentCandidates = await extractCandidatesFromPage(page);

        // Match current step against current candidates & page state URL
        const resolved = matcher.matchStep(step, currentCandidates, page.url());

        results.push({
          step,
          candidates: currentCandidates,
          resolvedStep: resolved
        });

        // Perform action on crawler page to transition DOM state for subsequent steps
        // IMPORTANT: Use resolved.action (auto-corrected by matcher) instead of step.action (original DSL)
        const effectiveAction = resolved.action;
        
        if (effectiveAction === 'wait') {
          const waitTime = parseInt(step.value || '1000', 10);
          await page.waitForTimeout(waitTime);
        } else if (resolved.matchScore > 0 && ['fill', 'click', 'select', 'check', 'uncheck', 'upload'].includes(effectiveAction)) {
          try {
            await this.performActionOnPage(page, { ...step, action: effectiveAction }, resolved);
            // Only wait heavily on clicks (page transitions). Fills and selects just need a short reactive delay.
            if (effectiveAction === 'click') {
              await page.waitForTimeout(1000); // short delay for heavy JS frameworks to finish rendering
            } else {
              await page.waitForTimeout(100); // short delay for frontend frameworks (React/Vue/OutSystems) reactivity
            }
          } catch (err) {
            console.warn(`[Crawler] Step ${step.step} state execution warning:`, err);
          }
        }
      }

      return results;
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }
  }

  private async performActionOnPage(page: Page, step: DSLStep, resolved: ResolvedStep): Promise<void> {
    const type = resolved.selectorType;
    const val = resolved.selectorValue;

    let locator;
    if (type === 'getByTestId') {
      locator = page.getByTestId(val).first();
    } else if (type === 'getByLabel') {
      locator = page.getByLabel(val).first();
    } else if (type === 'getByRole') {
      locator = page.getByRole(val as any, { name: resolved.roleName }).first();
    } else if (type === 'getByPlaceholder') {
      locator = page.getByPlaceholder(val).first();
    } else if (type === 'getByText') {
      locator = page.getByText(val).first();
    } else {
      locator = page.locator(val).first();
    }

    if (step.action === 'fill' && step.value) {
      await locator.fill('');
      await locator.pressSequentially(step.value, { delay: 50, timeout: 5000 });
    } else if (step.action === 'click') {
      // Use waitForURL pattern instead of deprecated waitForNavigation
      const currentUrl = page.url();
      try {
        await locator.click({ force: true, timeout: 3000 });
      } catch (e) {
        if (step.targetLabel) {
          try {
            await page.locator(`text="${step.targetLabel}"`).first().click({ force: true, timeout: 2000 });
          } catch (e2) {
            throw e;
          }
        } else {
          throw e;
        }
      }
      // Wait briefly for SPA reactivity
      await page.waitForTimeout(500);
    } else if (step.action === 'select' && step.value) {
      // Safety check: verify element is actually a <select> before calling selectOption
      const tagName = await locator.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
      if (tagName === 'select') {
        await locator.selectOption(step.value, { force: true, timeout: 5000 });
      } else {
        // Fallback: treat as fill for non-select elements (e.g., input[type=number], input[type=text])
        console.warn(`[Crawler] Step ${step.step}: Auto-fallback from selectOption to fill (element is <${tagName}>, not <select>)`);
        await locator.fill(step.value, { force: true, timeout: 5000 });
      }
    } else if (step.action === 'check') {
      await locator.check({ force: true, timeout: 5000 });
    } else if (step.action === 'uncheck') {
      await locator.uncheck({ force: true, timeout: 5000 });
    } else if ((step.action as string) === 'upload' && step.value) {
      await locator.setInputFiles(step.value, { timeout: 5000 }).catch((e) => {
        console.warn('[Crawler] File upload failed:', e.message);
      });
    }
  }
}
