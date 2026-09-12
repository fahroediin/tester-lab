/*
 * tester-lab - Non-LLM Automated Test Script Generator
 * Copyright (c) 2026 Imam Fahrudin
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU Affero General Public License v3.0.
 * See the LICENSE file in the project root for full license text.
 */
/**
 * History edit service.
 *
 * Pure validation for editing a scenario's generated code in place (PATCH
 * /api/v1/history/:id/code). Lets the user tidy an already-generated script
 * without regenerating it, so Run Suite uses the edited version.
 *
 * Saving is NOT gated by the Playwright-only runner guard: any framework's
 * script may be edited and saved. The runner guard still applies at execution
 * time, so a saved non-Playwright script is stored but SKIPPED by Run Suite,
 * exactly as before. What saving does enforce is the same code sanitizer as the
 * run path, so an edit can never smuggle in a dangerous pattern.
 */

import { sanitizeCode } from '../../security/code-sanitizer.js';

export interface CodeEditValidation {
  /** True when the edit is accepted and safe to persist. */
  ok: boolean;
  /** The trimmed code to persist; present only when ok is true. */
  code?: string;
  /** Why the edit was rejected (empty/blank/non-string, or a sanitizer hit). */
  reason?: string;
  /** Human-readable sanitizer violations, when the edit was blocked by it. */
  violations?: string[];
}

/**
 * Validate an in-place code edit before it is written to a history record.
 *
 * - Non-string or empty/blank code is rejected (nothing runnable to save).
 * - Otherwise the trimmed code runs through the sanitizer; a hit rejects the
 *   edit and surfaces the violations, matching the run path.
 *
 * Pure; never throws.
 */
export function validateCodeEdit(code: unknown): CodeEditValidation {
  if (typeof code !== 'string' || !code.trim()) {
    return { ok: false, reason: 'Missing or empty field: code' };
  }

  const trimmed = code.trim();
  const sanitizeResult = sanitizeCode(trimmed);
  if (!sanitizeResult.safe) {
    return {
      ok: false,
      reason: 'Submitted code contains blocked patterns that are not allowed for security reasons.',
      violations: sanitizeResult.violations
    };
  }

  return { ok: true, code: trimmed };
}

/**
 * Decide a scenario's suite membership when it is moved via the /project
 * (a.k.a. /folder) endpoint.
 *
 * Placing a scenario at the project level means it is NOT in any suite: the
 * /project endpoint controls the project wrapper, the /suite endpoint controls
 * suite membership. So moving to the project level always clears the suite,
 * whether the destination project is a different one, the same one
 * ("Unassigned in <project>"), or uncategorized (no project).
 *
 * Returns the suite_id to persist: always null here. (A dedicated helper keeps
 * the intent explicit and unit-testable, and guards against the earlier bug
 * where the suite was kept when the destination project was unchanged.)
 */
export function resolveSuiteOnProjectMove(): null {
  return null;
}
