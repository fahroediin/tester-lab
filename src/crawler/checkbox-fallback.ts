/*
 * tester-lab - Non-LLM Automated Test Script Generator
 * Copyright (c) 2026 Imam Fahrudin
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU Affero General Public License v3.0.
 * See the LICENSE file in the project root for full license text.
 */
/**
 * Checkbox check->click fallback.
 *
 * Playwright's `locator.check()` asserts the checkbox actually ends up checked.
 * Many modern UIs (React/Vue + Tailwind "accent-*" styled inputs) manage the
 * checked state in JS, so the native `checked` property may not flip in the way
 * check() expects — it then throws "Clicking the checkbox did not change its
 * state" even though a plain `.click()` would toggle it correctly.
 *
 * This module isolates the PURE decision — "is this the state-change error that
 * should trigger a click fallback?" — so it is unit-testable without a browser.
 * The caller (crawler dry-run and the generated runtime helper) uses it to fall
 * back to `.click()` only for this specific, benign case, never masking real
 * failures like timeouts, missing elements, or detached nodes.
 */

/** The substring Playwright uses for the "check didn't flip the box" error. */
const STATE_ERROR_NEEDLE = 'did not change its state';

/**
 * True when an error message indicates `check()`/`uncheck()` ran but the
 * checkbox state did not change (the React-checkbox case). Pure; never throws.
 */
export function isCheckboxStateError(message: unknown): boolean {
  if (typeof message !== 'string' || !message) return false;
  return message.toLowerCase().includes(STATE_ERROR_NEEDLE);
}
