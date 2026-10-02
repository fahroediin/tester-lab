/*
 * tester-lab - Non-LLM Automated Test Script Generator
 * Copyright (c) 2026 Imam Fahrudin
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU Affero General Public License v3.0.
 * See the LICENSE file in the project root for full license text.
 */
/**
 * Registration conflict guard.
 *
 * Pure decision for whether a new account may be created, given whether an
 * account with the same username and/or email already exists. The caller
 * performs the lookups (findUserByUsernameAsync / findUserByEmailAsync, both
 * case-insensitive via `ilike`) and passes only the booleans here, keeping this
 * unit testable without a database.
 *
 * - AC-01.04: an existing username is rejected with USERNAME_TAKEN_MESSAGE.
 * - AC-01.12: an existing email is rejected with EMAIL_TAKEN_MESSAGE.
 * - AC-01.13: email matching is case-insensitive — guaranteed by the caller's
 *   `ilike` lookup, so no extra logic is needed here.
 *
 * Username is checked first so the message is stable when both collide, matching
 * the order the fields are validated in the register route.
 */

/** AC-01.04 — message shown when the chosen username already exists. */
export const USERNAME_TAKEN_MESSAGE =
  'Username is already taken. Please choose another username.';

/** AC-01.12 — message shown when the chosen email is already registered. */
export const EMAIL_TAKEN_MESSAGE =
  'Email is already registered. Please use another email or sign in.';

export interface RegistrationConflictInput {
  /** True when an account with the same username already exists. */
  existingUsername: boolean;
  /** True when an account with the same email already exists. */
  existingEmail: boolean;
}

export interface RegistrationConflictResult {
  /** True when registration must be rejected. */
  conflict: boolean;
  /** The message to return (present only when conflict is true). */
  error?: string;
}

/**
 * Decide whether registration conflicts with an existing account. Pure; never
 * throws. Username takes precedence over email when both collide.
 */
export function checkRegistrationConflict(
  input: RegistrationConflictInput
): RegistrationConflictResult {
  if (input.existingUsername) {
    return { conflict: true, error: USERNAME_TAKEN_MESSAGE };
  }
  if (input.existingEmail) {
    return { conflict: true, error: EMAIL_TAKEN_MESSAGE };
  }
  return { conflict: false };
}
