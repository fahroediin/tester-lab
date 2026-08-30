/**
 * Tester Lab: In-Browser Event Recorder Agent
 * Injected automatically into the target application iframe to capture live user actions.
 */
(function() {
  if (window.__TESTER_LAB_RECORDER_ACTIVE__) return;
  window.__TESTER_LAB_RECORDER_ACTIVE__ = true;

  // Track debounced typing inputs
  const inputTimers = new Map();

  /**
   * Helper to extract the most descriptive human-readable label for any DOM element
   */
  function extractElementLabel(el) {
    if (!el) return 'Element';

    // 1. Associated <label> tag
    if (el.id) {
      const labelTag = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelTag && labelTag.textContent.trim()) {
        return labelTag.textContent.trim();
      }
    }

    // 2. Parent <label>
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent.trim()) {
      return parentLabel.textContent.trim();
    }

    // 3. Aria-label or Title
    const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('title');
    if (ariaLabel && ariaLabel.trim()) {
      return ariaLabel.trim();
    }

    // 4. Placeholder for inputs
    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) {
      return placeholder.trim();
    }

    // 5. Button or Link visible text
    if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') {
      const text = el.textContent.trim();
      if (text) {
        return text.length > 40 ? text.substring(0, 40) + '...' : text;
      }
    }

    // 6. Name, ID, or Value attribute
    if (el.getAttribute('name')) return el.getAttribute('name');
    if (el.id) return `#${el.id}`;
    if (el.value && typeof el.value === 'string' && el.value.length < 30) return el.value;

    return el.tagName.toLowerCase();
  }

  /**
   * Send recorded action payload to the Tester Lab parent window
   */
  function emitStep(action, targetLabel, value, description) {
    if (!window.parent || window.parent === window) return;

    window.parent.postMessage({
      type: 'TESTER_LAB_RECORD_STEP',
      payload: {
        action: action,
        targetLabel: targetLabel,
        value: value || '',
        description: description || `${action.toUpperCase()} on ${targetLabel}`
      }
    }, '*');
  }

  // 1. Handle Click Events
  document.addEventListener('click', function(e) {
    const el = e.target;
    if (!el || el === document.documentElement || el === document.body) return;

    const tagName = el.tagName;
    const type = (el.getAttribute('type') || '').toLowerCase();

    // Skip input clicks if they are text/password (input event will handle filling)
    if (tagName === 'INPUT' && (type === 'text' || type === 'password' || type === 'email' || type === 'number' || type === 'tel' || type === 'search')) {
      return;
    }

    // Checkbox / Radio
    if (tagName === 'INPUT' && (type === 'checkbox' || type === 'radio')) {
      const label = extractElementLabel(el);
      const isChecked = el.checked;
      emitStep(isChecked ? 'check' : 'uncheck', label, '', `${isChecked ? 'Check' : 'Uncheck'} ${label}`);
      return;
    }

    // Buttons, links, and clickable items
    const clickable = el.closest('button, a, [role="button"], input[type="submit"], input[type="button"]');
    const target = clickable || el;
    const label = extractElementLabel(target);

    emitStep('click', label, '', `Click ${label}`);
  }, true);

  // 2. Handle Text Input Events (Debounced)
  document.addEventListener('input', function(e) {
    const el = e.target;
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;

    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio' || type === 'button' || type === 'submit') return;

    const label = extractElementLabel(el);

    if (inputTimers.has(el)) {
      clearTimeout(inputTimers.get(el));
    }

    const timer = setTimeout(() => {
      const val = el.value || '';
      emitStep('fill', label, val, `Type ${val} into ${label}`);
      inputTimers.delete(el);
    }, 600);

    inputTimers.set(el, timer);
  }, true);

  // 3. Handle Select / Dropdown Changes
  document.addEventListener('change', function(e) {
    const el = e.target;
    if (!el || el.tagName !== 'SELECT') return;

    const label = extractElementLabel(el);
    const selectedOption = el.options[el.selectedIndex];
    const val = selectedOption ? (selectedOption.text || selectedOption.value) : el.value;

    emitStep('select', label, val, `Select ${val} from ${label}`);
  }, true);

  // Notify parent window that agent is active and ready
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'TESTER_LAB_RECORDER_READY' }, '*');
  }
})();
