"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.determineSelector = determineSelector;
/**
 * Determine Playwright selector strategy based on winning candidate metadata
 */
function determineSelector(cand, target, action) {
    if (cand.testId) {
        return {
            selectorType: 'getByTestId',
            selectorValue: cand.testId
        };
    }
    // For interactive ARIA roles (radio, checkbox, button, link, option, tab), getByRole is the most robust and standard
    const isEligibleRole = cand.role && (['radio', 'checkbox', 'button', 'link', 'option', 'tab'].includes(cand.role) ||
        (cand.role === 'combobox' && cand.tagName !== 'select' && (cand.ariaLabel || cand.hasDirectLabel)));
    if (isEligibleRole && (cand.ariaLabel || cand.labelText || cand.innerText)) {
        const raw = (cand.hasDirectLabel && cand.labelText) ? cand.labelText : (cand.ariaLabel || cand.innerText);
        const cleanName = raw.replace(/[\uE000-\uF8FF\u2000-\u206F]/g, '').trim();
        return {
            selectorType: 'getByRole',
            selectorValue: cand.role,
            roleName: cleanName || target
        };
    }
    // Use getByLabel ONLY when the label is genuinely associated (label[for], wrapping label,
    // aria-label, or aria-labelledby). A merely nearby/sibling <label> without a `for` attribute
    // is NOT matched by Playwright's getByLabel, so fall through to placeholder/name/role for those
    // (prevents e.g. a placeholder-only login field being resolved to a non-matching getByLabel).
    if ((cand.hasDirectLabel && cand.labelText) || cand.ariaLabel) {
        const labelValue = (cand.hasDirectLabel && cand.labelText) ? cand.labelText : cand.ariaLabel;
        return {
            selectorType: 'getByLabel',
            selectorValue: labelValue.trim()
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
            selectorValue: cand.role,
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
