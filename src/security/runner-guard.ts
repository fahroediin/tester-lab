/*
 * tester-lab - Non-LLM Automated Test Script Generator
 * Copyright (c) 2026 Imam Fahrudin
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU Affero General Public License v3.0.
 * See the LICENSE file in the project root for full license text.
 */

export interface RunnerGuardCheck {
  allowed: boolean;
  reason?: string;
}

export const RUNNER_NON_PLAYWRIGHT_MESSAGE =
  'Sistem menolak menjalankan script. Hanya Playwright yang dieksekusi di server. Script dapat diunduh untuk dijalankan sendiri.';

/**
 * AC-14.10 & AC-14.11: Only Playwright test scripts are executed on the server.
 * All non-Playwright frameworks (Katalon, Selenium, Robot Framework, Cypress)
 * are rejected with an explicit notice to download the script for standalone execution.
 */
export function checkRunnerSupport(options: {
  framework?: string;
  language?: string;
  code?: string;
}): RunnerGuardCheck {
  const { framework, language, code = '' } = options;

  if (framework && framework !== 'playwright') {
    return {
      allowed: false,
      reason: RUNNER_NON_PLAYWRIGHT_MESSAGE
    };
  }

  if (language && !['typescript', 'javascript'].includes(language)) {
    return {
      allowed: false,
      reason: RUNNER_NON_PLAYWRIGHT_MESSAGE
    };
  }

  // Code inspection to guard against mislabeled payloads
  if (
    code.includes('com.kms.katalon') ||
    code.includes('*** Settings ***') ||
    code.includes('from selenium import') ||
    code.includes('import org.openqa.selenium') ||
    code.includes("require('cypress')") ||
    code.startsWith("describe('")
  ) {
    return {
      allowed: false,
      reason: RUNNER_NON_PLAYWRIGHT_MESSAGE
    };
  }

  return { allowed: true };
}
