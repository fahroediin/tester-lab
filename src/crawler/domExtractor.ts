import { chromium, Browser, Page } from 'playwright';
import { DOMElementCandidate, DSLConfig, DSLStep, ResolvedStep } from '../types/index.js';
import { HeuristicMatcher } from '../matcher/heuristicMatcher.js';

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
      await page.goto(url, { waitUntil: 'networkidle', timeout });
      await page.waitForSelector('input, button, form, a', { timeout: 5000 }).catch(() => {});
      const candidates = await this.extractCandidatesFromPage(page);
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
      await page.goto(config.targetUrl, { waitUntil: 'networkidle', timeout });
      await page.waitForSelector('input, button, form, a', { timeout: 5000 }).catch(() => {});

      for (const step of config.steps) {
        // Extract current DOM state candidates
        const currentCandidates = await this.extractCandidatesFromPage(page);

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
        if (resolved.matchScore > 0 && ['fill', 'click', 'select', 'check', 'uncheck', 'upload'].includes(effectiveAction)) {
          try {
            await this.performActionOnPage(page, { ...step, action: effectiveAction }, resolved);
            // Only wait heavily on clicks (page transitions). Fills and selects just need a short reactive delay.
            if (effectiveAction === 'click') {
              await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
              await page.waitForTimeout(1000); // hard delay for heavy JS frameworks to finish rendering
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
      locator = page.getByLabel(val, { exact: true }).first();
    } else if (type === 'getByRole') {
      locator = page.getByRole(val as any, { name: resolved.roleName }).first();
    } else if (type === 'getByPlaceholder') {
      locator = page.getByPlaceholder(val, { exact: true }).first();
    } else if (type === 'getByText') {
      locator = page.getByText(val).first();
    } else {
      locator = page.locator(val).first();
    }

    if (step.action === 'fill' && step.value) {
      await locator.fill(step.value, { force: true, timeout: 5000 });
    } else if (step.action === 'click') {
      // Use waitForURL pattern instead of deprecated waitForNavigation
      const currentUrl = page.url();
      await locator.click({ force: true, timeout: 5000 });
      // Wait briefly for potential navigation
      await page.waitForURL((url) => url.toString() !== currentUrl, { timeout: 3000 }).catch(() => {});
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
      await locator.setInputFiles(step.value, { timeout: 5000 }).catch(() => {});
    }
  }

  public async extractCandidatesFromPage(
    page: Page,
    iframeSelector?: string
  ): Promise<DOMElementCandidate[]> {
    const rawCandidates = await page.evaluate((frameSel) => {
      const doc = frameSel ? (document.querySelector(frameSel) as HTMLIFrameElement)?.contentDocument || document : document;

      const selectors = [
        'input',
        'button',
        'a',
        'select',
        'textarea',
        '[role]',
        '[data-testid]',
        '[data-test]',
        '[data-qa]',
        '[data-cy]',
        'label',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'span', 'div'
      ];

      const elements = Array.from(doc.querySelectorAll(selectors.join(',')));
      
      const results: Array<{
        tagName: string;
        id: string;
        name: string;
        testId: string;
        placeholder: string;
        ariaLabel: string;
        innerText: string;
        labelText: string;
        role: string;
        type: string;
        href?: string;
        value?: string;
        isVisible: boolean;
        isInIframe: boolean;
        iframeSelector?: string;
        boundingBox: { x: number; y: number; width: number; height: number };
      }> = [];

      for (const el of elements) {
        const htmlEl = el as HTMLElement;
        const rect = htmlEl.getBoundingClientRect();
        const style = window.getComputedStyle(htmlEl);
        const isVisible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';

        const tagName = htmlEl.tagName.toLowerCase();
        const id = htmlEl.id || '';
        const name = htmlEl.getAttribute('name') || '';
        const testId = 
          htmlEl.getAttribute('data-testid') || 
          htmlEl.getAttribute('data-test') || 
          htmlEl.getAttribute('data-qa') || 
          htmlEl.getAttribute('data-cy') || 
          htmlEl.getAttribute('data-testing') || '';
        
        const placeholder = htmlEl.getAttribute('placeholder') || '';
        const ariaLabel = htmlEl.getAttribute('aria-label') || htmlEl.getAttribute('aria-labelledby') || '';
        const innerText = (htmlEl.innerText || htmlEl.textContent || '').trim().replace(/\s+/g, ' ');
        
        let role = htmlEl.getAttribute('role') || '';
        if (!role) {
          if (tagName === 'button' || (tagName === 'input' && ['button', 'submit', 'reset'].includes(htmlEl.getAttribute('type') || ''))) {
            role = 'button';
          } else if (tagName === 'a' && htmlEl.hasAttribute('href')) {
            role = 'link';
          } else if (tagName === 'input' && (htmlEl.getAttribute('type') === 'checkbox')) {
            role = 'checkbox';
          } else if (tagName === 'input' && (htmlEl.getAttribute('type') === 'radio')) {
            role = 'radio';
          } else if (tagName === 'input' || tagName === 'textarea') {
            role = 'textbox';
          } else if (tagName === 'select') {
            role = 'combobox';
          }
        }

        const isInputControl = ['input', 'textarea', 'select'].includes(tagName) || ['textbox', 'combobox', 'searchbox', 'spinbutton', 'checkbox', 'radio'].includes(role);

        let labelText = '';
        if (isInputControl) {
          if (id) {
            const labelEl = doc.querySelector(`label[for="${id}"]`);
            if (labelEl) {
              labelText = (labelEl.textContent || '').trim();
            }
          }
          if (!labelText && htmlEl.closest('label')) {
            labelText = (htmlEl.closest('label')?.textContent || '').trim();
          }
          if (!labelText && htmlEl.previousElementSibling && htmlEl.previousElementSibling.tagName.toLowerCase() === 'label') {
            labelText = (htmlEl.previousElementSibling.textContent || '').trim();
          }
          // Tailwind/Modern UI pattern: <label></label><div><input></div>
          if (!labelText && htmlEl.parentElement && htmlEl.parentElement.previousElementSibling && htmlEl.parentElement.previousElementSibling.tagName.toLowerCase() === 'label') {
            labelText = (htmlEl.parentElement.previousElementSibling.textContent || '').trim();
          }
          // Deeper nesting pattern: <label></label><div><div><input></div></div>
          if (!labelText && htmlEl.parentElement && htmlEl.parentElement.parentElement && htmlEl.parentElement.parentElement.previousElementSibling && htmlEl.parentElement.parentElement.previousElementSibling.tagName.toLowerCase() === 'label') {
            labelText = (htmlEl.parentElement.parentElement.previousElementSibling.textContent || '').trim();
          }
          // Clean up asterisks usually used for required fields
          if (labelText) {
            labelText = labelText.replace(/\*/g, '').trim();
          }
          if (!labelText) {
            const parentContainer = htmlEl.closest('.form-group, .field, .input-group, .mb-3, .form-item, div');
            if (parentContainer) {
              const nearbyLabel = parentContainer.querySelector('label');
              if (nearbyLabel && (nearbyLabel as HTMLElement) !== htmlEl) {
                const labelFor = nearbyLabel.getAttribute('for');
                if (!labelFor || labelFor === id) {
                  labelText = (nearbyLabel.textContent || '').trim();
                }
              }
            }
          }
        }

        const type = htmlEl.getAttribute('type') || '';
        const href = htmlEl.getAttribute('href') || undefined;
        const value = (htmlEl as HTMLInputElement).value || undefined;

        const isInteractive = ['input', 'button', 'a', 'select', 'textarea'].includes(tagName) || 
                             role || testId || id || labelText || placeholder || ariaLabel;
        
        if (!isInteractive && innerText.length === 0) {
          continue;
        }

        if (['div', 'section', 'main', 'article'].includes(tagName) && !testId && !id && !role && innerText.length > 150) {
          continue;
        }

        results.push({
          tagName,
          id,
          name,
          testId,
          placeholder,
          ariaLabel,
          innerText,
          labelText,
          role,
          type,
          href,
          value,
          isVisible,
          isInIframe: !!frameSel,
          iframeSelector: frameSel,
          boundingBox: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        });
      }

      return results;
    }, iframeSelector);

    return rawCandidates.map((cand, idx) => ({
      ...cand,
      index: idx
    }));
  }
}
