import type { DOMElementCandidate, SelectorType } from '../types/index.js';

/**
 * Determine Playwright selector strategy based on winning candidate metadata
 */
export function determineSelector(
  cand: DOMElementCandidate,
  target: string,
  action: string
): { selectorType: SelectorType; selectorValue: string; roleName?: string } {
  if (cand.testId) {
    return {
      selectorType: 'getByTestId',
      selectorValue: cand.testId
    };
  }

  // Only use getByLabel when there's a real HTML label association (label[for] or wrapping label).
  // Playwright getByLabel does NOT work with positional/sibling labels.
  if (cand.labelText && cand.hasDirectLabel) {
    return {
      selectorType: 'getByLabel',
      selectorValue: cand.labelText.trim()
    };
  }

  if (cand.placeholder) {
    return {
      selectorType: 'getByPlaceholder',
      selectorValue: cand.placeholder.trim()
    };
  }

  // For input/select/textarea with name attribute, use CSS name selector (very reliable)
  if (cand.name && ['input', 'select', 'textarea'].includes(cand.tagName)) {
    return {
      selectorType: 'locator',
      selectorValue: `${cand.tagName}[name="${cand.name}"]`
    };
  }

  if (cand.id) {
    return {
      selectorType: 'locator',
      selectorValue: `#${cand.id}`
    };
  }

  if (cand.role && (cand.innerText || cand.ariaLabel)) {
    const raw = cand.ariaLabel || cand.innerText;
    const cleanName = raw.replace(/[\uE000-\uF8FF\u2000-\u206F]/g, '').trim();
    return {
      selectorType: 'getByRole',
      selectorValue: cand.role as any,
      roleName: cleanName || target
    };
  }

  if (cand.name) {
    return {
      selectorType: 'locator',
      selectorValue: `[name="${cand.name}"]`
    };
  }

  if (cand.innerText) {
    const cleanText = cand.innerText.replace(/[\uE000-\uF8FF\u2000-\u206F]/g, '').trim();
    return {
      selectorType: 'getByText',
      selectorValue: cleanText.length > target.length * 1.5 ? target : (cleanText || target)
    };
  }

  return {
    selectorType: 'locator',
    selectorValue: `text="${target}"`
  };
}
