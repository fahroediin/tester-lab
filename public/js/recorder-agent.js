/**
 * Tester Lab: In-Browser Event Recorder Agent
 * Injected automatically into target applications (iframe or popup window) to capture live user actions.
 */
(function() {
  if (window.__TESTER_LAB_RECORDER_ACTIVE__) return;
  window.__TESTER_LAB_RECORDER_ACTIVE__ = true;

  const inputTimers = new Map();
  let localStepCount = 0;

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

  function updateFloatingBadge(desc) {
    localStepCount++;
    try {
      let badge = document.getElementById('__tester_lab_recorder_badge__');
      if (!badge && document.body) {
        badge = document.createElement('div');
        badge.id = '__tester_lab_recorder_badge__';
        badge.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#0f172a;color:#38bdf8;padding:8px 14px;border-radius:8px;font-family:sans-serif,system-ui;font-size:12px;font-weight:500;box-shadow:0 6px 20px rgba(0,0,0,0.35);border:1px solid rgba(56,189,248,0.3);pointer-events:none;';
        document.body.appendChild(badge);
      }
      if (badge) {
        badge.textContent = `Tester Lab Recording: ${localStepCount} step(s) captured`;
      }
    } catch {
      // Ignore DOM sandbox restrictions
    }
  }

  /**
   * Send recorded action payload to the Tester Lab parent/opener window
   */
  function emitStep(action, targetLabel, value, description) {
    const parentWin = (window.opener && window.opener !== window) ? window.opener : (window.parent && window.parent !== window ? window.parent : null);
    if (!parentWin) return;

    parentWin.postMessage({
      type: 'TESTER_LAB_RECORD_STEP',
      payload: {
        action: action,
        targetLabel: targetLabel,
        value: value || '',
        description: description || `${action.toUpperCase()} on ${targetLabel}`
      }
    }, '*');

    updateFloatingBadge(description);
  }

  function flushInput(el) {
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio' || type === 'button' || type === 'submit') return;

    if (inputTimers.has(el)) {
      clearTimeout(inputTimers.get(el));
      inputTimers.delete(el);
    }
    const val = el.value || '';
    if (val !== undefined && val !== null) {
      const label = extractElementLabel(el);
      emitStep('fill', label, val, `Type ${val} into ${label}`);
    }
  }

  // 1. Handle Click Events
  document.addEventListener('click', function(e) {
    const el = e.target;
    if (!el || el === document.documentElement || el === document.body) return;

    const tagName = el.tagName;
    const type = (el.getAttribute('type') || '').toLowerCase();

    // Skip input clicks if they are text/password
    if (tagName === 'INPUT' && (type === 'text' || type === 'password' || type === 'email' || type === 'number' || type === 'tel' || type === 'search')) {
      return;
    }

    // Flush any focused inputs before recording click
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && activeEl !== el) {
      flushInput(activeEl);
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

    if (inputTimers.has(el)) {
      clearTimeout(inputTimers.get(el));
    }

    const timer = setTimeout(() => {
      flushInput(el);
    }, 400);

    inputTimers.set(el, timer);
  }, true);

  // 3. Handle Blur and Change on Input
  document.addEventListener('change', function(e) {
    const el = e.target;
    if (!el) return;

    if (el.tagName === 'SELECT') {
      const label = extractElementLabel(el);
      const selectedOption = el.options[el.selectedIndex];
      const val = selectedOption ? (selectedOption.text || selectedOption.value) : el.value;
      emitStep('select', label, val, `Select ${val} from ${label}`);
      return;
    }

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      flushInput(el);
    }
  }, true);

  document.addEventListener('blur', function(e) {
    const el = e.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      flushInput(el);
    }
  }, true);

  // 4. Handle Form Submit
  document.addEventListener('submit', function(e) {
    const activeEl = document.activeElement;
    if (activeEl) {
      flushInput(activeEl);
    }
  }, true);

  // Ready signal
  const parentWin = (window.opener && window.opener !== window) ? window.opener : (window.parent && window.parent !== window ? window.parent : null);
  if (parentWin) {
    parentWin.postMessage({ type: 'TESTER_LAB_RECORDER_READY' }, '*');
  }
})();
