"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractCandidatesFromPage = extractCandidatesFromPage;
async function extractCandidatesFromPage(page, iframeSelector) {
    const rawCandidates = await page.evaluate((frameSel) => {
        const doc = frameSel ? document.querySelector(frameSel)?.contentDocument || document : document;
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
        const results = [];
        for (const el of elements) {
            const htmlEl = el;
            const rect = htmlEl.getBoundingClientRect();
            const style = window.getComputedStyle(htmlEl);
            const isVisible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            const tagName = htmlEl.tagName.toLowerCase();
            const id = htmlEl.id || '';
            const name = htmlEl.getAttribute('name') || '';
            const testId = htmlEl.getAttribute('data-testid') ||
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
                }
                else if (tagName === 'a' && htmlEl.hasAttribute('href')) {
                    role = 'link';
                }
                else if (tagName === 'input' && (htmlEl.getAttribute('type') === 'checkbox')) {
                    role = 'checkbox';
                }
                else if (tagName === 'input' && (htmlEl.getAttribute('type') === 'radio')) {
                    role = 'radio';
                }
                else if (tagName === 'input' || tagName === 'textarea') {
                    role = 'textbox';
                }
                else if (tagName === 'select') {
                    role = 'combobox';
                }
            }
            const isInputControl = ['input', 'textarea', 'select'].includes(tagName) || ['textbox', 'combobox', 'searchbox', 'spinbutton', 'checkbox', 'radio'].includes(role);
            let labelText = '';
            let hasDirectLabel = false;
            if (isInputControl) {
                if (id) {
                    const labelEl = doc.querySelector(`label[for="${id}"]`);
                    if (labelEl) {
                        labelText = (labelEl.textContent || '').trim();
                        hasDirectLabel = true;
                    }
                }
                if (!labelText && htmlEl.closest('label')) {
                    labelText = (htmlEl.closest('label')?.textContent || '').trim();
                    hasDirectLabel = true;
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
                        if (nearbyLabel && nearbyLabel !== htmlEl) {
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
            const value = htmlEl.value || undefined;
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
                hasDirectLabel,
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
