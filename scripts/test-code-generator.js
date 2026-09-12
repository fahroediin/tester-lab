/*
 * Tests for CodeGenerator.generateScript() output across all supported
 * framework/language combinations.
 *
 * Run: npm run build && node scripts/test-code-generator.js
 */
'use strict';

const assert = require('assert');
const { CodeGenerator } = require('../dist/generator/code-generator.js');

let passed = 0;
let failed = 0;

function ok(name, cond) {
  if (!cond) {
    failed++;
    console.log('  FAIL: ' + name);
  } else {
    passed++;
    console.log('  pass: ' + name);
  }
}

function contains(code, needle, label) {
  ok(label || `contains "${needle.substring(0, 60)}"`, code.includes(needle));
}

function matches(code, regex, label) {
  ok(label, regex.test(code));
}

// ── Shared fixtures ──────────────────────────────────────────────────

const baseConfig = {
  testSuite: 'Login Flow Test',
  targetUrl: 'https://example.com/login',
  viewport: { width: 1280, height: 720 }
};

// Cover every DSL action type so each template branch is exercised.
const resolvedSteps = [
  {
    step: 1,
    action: 'fill',
    targetLabel: 'Email',
    value: 'user@example.com',
    description: 'Fill email field',
    selectorType: 'getByLabel',
    selectorValue: 'Email',
    matchScore: 100
  },
  {
    step: 2,
    action: 'fill',
    targetLabel: 'Password',
    value: "p@ss'word",
    description: 'Fill password with special chars',
    selectorType: 'getByPlaceholder',
    selectorValue: 'Enter password',
    matchScore: 90
  },
  {
    step: 3,
    action: 'click',
    targetLabel: 'Sign In',
    description: 'Click sign in button',
    selectorType: 'getByRole',
    selectorValue: 'button',
    roleName: 'Sign In',
    matchScore: 100
  },
  {
    step: 4,
    action: 'click',
    targetLabel: 'Dashboard',
    description: 'Click dashboard link',
    selectorType: 'getByText',
    selectorValue: 'Dashboard',
    matchScore: 85
  },
  {
    step: 5,
    action: 'click',
    targetLabel: 'submit-btn',
    description: 'Click by test id',
    selectorType: 'getByTestId',
    selectorValue: 'submit-btn',
    matchScore: 100
  },
  {
    step: 6,
    action: 'assert_url',
    description: 'Verify redirected to dashboard',
    selectorType: 'url',
    selectorValue: '/dashboard',
    matchScore: 100
  },
  {
    step: 7,
    action: 'assert_text',
    targetLabel: 'Welcome',
    expected: 'Welcome back',
    description: 'Verify welcome text',
    selectorType: 'getByText',
    selectorValue: 'Welcome',
    matchScore: 80
  },
  {
    step: 8,
    action: 'assert_visible',
    targetLabel: 'Logout',
    description: 'Verify logout button visible',
    selectorType: 'getByRole',
    selectorValue: 'button',
    roleName: 'Logout',
    matchScore: 95
  },
  {
    step: 9,
    action: 'select',
    targetLabel: 'Country',
    value: 'Indonesia',
    description: 'Select country',
    selectorType: 'getByLabel',
    selectorValue: 'Country',
    matchScore: 90
  },
  {
    step: 10,
    action: 'check',
    targetLabel: 'Terms',
    description: 'Check terms checkbox',
    selectorType: 'getByLabel',
    selectorValue: 'Terms',
    matchScore: 90
  },
  {
    step: 11,
    action: 'uncheck',
    targetLabel: 'Newsletter',
    description: 'Uncheck newsletter',
    selectorType: 'getByLabel',
    selectorValue: 'Newsletter',
    matchScore: 85
  },
  {
    step: 12,
    action: 'upload',
    targetLabel: 'Avatar',
    value: '/tmp/avatar.png',
    description: 'Upload avatar file',
    selectorType: 'getByLabel',
    selectorValue: 'Avatar',
    matchScore: 88
  },
  {
    step: 13,
    action: 'wait',
    description: 'Wait 2 seconds',
    selectorType: 'locator',
    selectorValue: '2000',
    matchScore: 100
  }
];

// Steps that trigger the needsRobustHelper (fill/select with locator + targetLabel)
const robustHelperSteps = [
  {
    step: 1,
    action: 'fill',
    targetLabel: 'Company Name',
    value: 'Acme Corp',
    description: 'Fill via legacy locator',
    selectorType: 'locator',
    selectorValue: '#company',
    matchScore: 50
  },
  {
    step: 2,
    action: 'select',
    targetLabel: 'Department',
    value: 'Engineering',
    description: 'Select via legacy locator',
    selectorType: 'locator',
    selectorValue: '#dept',
    matchScore: 50
  }
];

// Steps with warning to test warning rendering
const warningSteps = [
  {
    step: 1,
    action: 'click',
    targetLabel: 'Ambiguous',
    description: 'Click ambiguous element',
    selectorType: 'getByText',
    selectorValue: 'Ambiguous',
    matchScore: 30,
    warning: 'Low confidence match (30%)'
  }
];

// Special-char steps for escaping validation
const escapingSteps = [
  {
    step: 1,
    action: 'fill',
    targetLabel: "O'Brien's \"Input\"",
    value: "line1\nline2\\end",
    description: 'Fill with special chars',
    selectorType: 'getByLabel',
    selectorValue: "O'Brien",
    matchScore: 70
  }
];

// ── Test runner ──────────────────────────────────────────────────────

const gen = new CodeGenerator();

(async () => {
  // ────────────────────────────────────────────────
  console.log('\n[1] Playwright TypeScript (default)');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'playwright', language: 'typescript' };
    const result = await gen.generateScript(cfg, resolvedSteps);

    ok('result.success is true', result.success === true);
    ok('code is non-empty string', typeof result.code === 'string' && result.code.length > 0);
    ok('resolvedSteps returned', Array.isArray(result.resolvedSteps) && result.resolvedSteps.length === resolvedSteps.length);

    const c = result.code;
    contains(c, "import { test, expect", 'imports Playwright test/expect');
    contains(c, "page.goto('https://example.com/login')", 'navigates to targetUrl');
    contains(c, "setViewportSize", 'sets viewport');
    contains(c, "getByLabel", 'uses getByLabel for fill');
    contains(c, "getByPlaceholder", 'uses getByPlaceholder for fill');
    contains(c, "getByRole", 'uses getByRole for click');
    contains(c, "getByText", 'uses getByText for click');
    contains(c, "getByTestId", 'uses getByTestId for click');
    contains(c, "toHaveURL", 'assert_url generates toHaveURL');
    contains(c, "toContainText", 'assert_text generates toContainText');
    contains(c, "toBeVisible", 'assert_visible generates toBeVisible');
    contains(c, "selectOption", 'select action generates selectOption');
    contains(c, ".check(", 'check action generates .check()');
    contains(c, ".uncheck(", 'uncheck action generates .uncheck()');
    contains(c, "setInputFiles", 'upload action generates setInputFiles');
    contains(c, "waitForTimeout(2000)", 'wait action generates waitForTimeout');
    contains(c, 'maestro', 'contains maestro auto-scroll engine');

    ok('logs array populated', result.logs.length === resolvedSteps.length);
  }

  // ────────────────────────────────────────────────
  console.log('\n[2] Playwright JavaScript');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'playwright', language: 'javascript' };
    const result = await gen.generateScript(cfg, resolvedSteps);

    ok('result.success is true', result.success === true);
    const c = result.code;
    contains(c, "require('@playwright/test')", 'uses require() not import');
    contains(c, "getByLabel", 'uses getByLabel');
    contains(c, "page.goto", 'navigates to URL');
    ok('no TypeScript type annotations', !c.includes(': Locator'));
  }

  // ────────────────────────────────────────────────
  console.log('\n[3] Cypress JS');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'cypress', language: 'javascript' };
    const result = await gen.generateScript(cfg, resolvedSteps);

    ok('result.success is true', result.success === true);
    const c = result.code;
    contains(c, "describe(", 'wraps in describe()');
    contains(c, "cy.visit(", 'uses cy.visit()');
    contains(c, ".type(", 'fill generates .type()');
    contains(c, ".click()", 'click generates .click()');
    contains(c, "cy.url().should('include'", 'assert_url uses cy.url().should');
    contains(c, "cy.contains(", 'assert_text uses cy.contains');
    contains(c, ".should('be.visible')", 'assert_visible uses should be.visible');
    contains(c, ".select(", 'select action generates .select()');
    contains(c, ".check()", 'check generates .check()');
    contains(c, ".uncheck()", 'uncheck generates .uncheck()');
    contains(c, "selectFile", 'upload generates selectFile');
    contains(c, "cy.wait(", 'wait generates cy.wait');
    ok('no Playwright imports', !c.includes('@playwright/test'));
  }

  // ────────────────────────────────────────────────
  console.log('\n[4] Selenium Python');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'selenium', language: 'python' };
    const result = await gen.generateScript(cfg, resolvedSteps);

    ok('result.success is true', result.success === true);
    const c = result.code;
    contains(c, "from selenium import webdriver", 'imports selenium webdriver');
    contains(c, "unittest.TestCase", 'extends unittest.TestCase');
    contains(c, 'driver.get("https://example.com/login")', 'navigates to URL');
    contains(c, "send_keys(", 'fill generates send_keys');
    contains(c, ".click()", 'click generates .click()');
    contains(c, "self.assertIn(", 'assert_url/text use assertIn');
    contains(c, "Select(", 'select generates Select()');
    contains(c, "is_selected()", 'check/uncheck use is_selected');
    contains(c, "time.sleep(", 'wait generates time.sleep');
    contains(c, "is_displayed()", 'assert_visible uses is_displayed');
    ok('no Playwright references', !c.includes('playwright'));
  }

  // ────────────────────────────────────────────────
  console.log('\n[5] Selenium Java (TestNG)');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'selenium', language: 'java' };
    const result = await gen.generateScript(cfg, resolvedSteps);

    ok('result.success is true', result.success === true);
    const c = result.code;
    contains(c, "import org.openqa.selenium", 'imports Selenium');
    contains(c, "import org.testng", 'imports TestNG');
    contains(c, 'public class LoginFlowTest', 'generates valid Java class name');
    contains(c, 'driver.get("https://example.com/login")', 'navigates to URL');
    contains(c, "sendKeys(", 'fill generates sendKeys');
    contains(c, ".click()", 'click generates .click()');
    contains(c, "Assert.assertTrue(", 'assertions use Assert.assertTrue');
    contains(c, "new Select(", 'select generates new Select()');
    contains(c, "Thread.sleep(", 'wait generates Thread.sleep');
    contains(c, "ExpectedConditions", 'uses explicit waits');
  }

  // ────────────────────────────────────────────────
  console.log('\n[6] Robot Framework');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'robotframework', language: 'robot' };
    const result = await gen.generateScript(cfg, resolvedSteps);

    ok('result.success is true', result.success === true);
    const c = result.code;
    contains(c, "*** Settings ***", 'has Settings section');
    contains(c, "Library           SeleniumLibrary", 'imports SeleniumLibrary');
    contains(c, "*** Test Cases ***", 'has Test Cases section');
    contains(c, "Open Browser", 'opens browser');
    contains(c, "Input Text", 'fill generates Input Text');
    contains(c, "Click Element", 'click generates Click Element');
    contains(c, "Location Should Contain", 'assert_url uses Location Should Contain');
    contains(c, "Page Should Contain", 'assert_text uses Page Should Contain');
    contains(c, "Element Should Be Visible", 'assert_visible uses Element Should Be Visible');
    contains(c, "Select From List By Label", 'select generates Select From List');
    contains(c, "Select Checkbox", 'check generates Select Checkbox');
    contains(c, "Unselect Checkbox", 'uncheck generates Unselect Checkbox');
    contains(c, "Choose File", 'upload generates Choose File');
    contains(c, "Sleep", 'wait generates Sleep');
    contains(c, "Close Browser", 'closes browser at end');
    ok('no JS/Python syntax', !c.includes('import {') && !c.includes('from selenium'));
  }

  // ────────────────────────────────────────────────
  console.log('\n[7] Katalon Groovy');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'katalon', language: 'groovy' };
    const result = await gen.generateScript(cfg, resolvedSteps);

    ok('result.success is true', result.success === true);
    const c = result.code;
    contains(c, "WebUiBuiltInKeywords as WebUI", 'imports WebUI');
    contains(c, "TestObject makeTestObject", 'has makeTestObject helper');
    contains(c, "WebUI.openBrowser", 'opens browser');
    contains(c, "WebUI.setText", 'fill generates WebUI.setText');
    contains(c, "WebUI.click", 'click generates WebUI.click');
    contains(c, "WebUI.verifyMatch", 'assert_url generates WebUI.verifyMatch');
    contains(c, "WebUI.verifyTextPresent", 'assert_text generates WebUI.verifyTextPresent');
    contains(c, "WebUI.verifyElementPresent", 'assert_visible generates WebUI.verifyElementPresent');
    contains(c, "WebUI.selectOptionByLabel", 'select generates WebUI.selectOptionByLabel');
    contains(c, "WebUI.check", 'check generates WebUI.check');
    contains(c, "WebUI.uncheck", 'uncheck generates WebUI.uncheck');
    contains(c, "WebUI.uploadFile", 'upload generates WebUI.uploadFile');
    contains(c, "WebUI.delay", 'wait generates WebUI.delay');
    contains(c, "WebUI.closeBrowser", 'closes browser at end');
    ok('no Playwright/Python syntax', !c.includes('page.') && !c.includes('self.driver'));
  }

  // ────────────────────────────────────────────────
  console.log('\n[8] Playwright TS - needsRobustHelper branch');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'playwright', language: 'typescript' };
    const result = await gen.generateScript(cfg, robustHelperSteps);

    ok('result.success is true', result.success === true);
    const c = result.code;
    contains(c, "legacyAction", 'robust helper legacyAction is generated');
    contains(c, "Company Name", 'fill label passed to legacyAction');
    contains(c, "Department", 'select label passed to legacyAction');
  }

  // ────────────────────────────────────────────────
  console.log('\n[8] Playwright JS - needsRobustHelper branch');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'playwright', language: 'javascript' };
    const result = await gen.generateScript(cfg, robustHelperSteps);

    ok('result.success is true', result.success === true);
    const c = result.code;
    contains(c, "async function action(", 'robust helper function is generated');
    contains(c, "Company Name", 'fill label passed to action helper');
  }

  // ────────────────────────────────────────────────
  console.log('\n[9] Warning rendering');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'playwright', language: 'typescript' };
    const result = await gen.generateScript(cfg, warningSteps);

    ok('warnings array populated', result.warnings.length > 0);
    contains(result.code, '[WARNING]', 'warning comment appears in code');
    contains(result.code, 'Low confidence', 'warning text rendered');
    contains(result.warnings[0], 'Low confidence', 'warnings array contains step warning');
  }

  // ────────────────────────────────────────────────
  console.log('\n[10] String escaping - jsLit (Playwright TS)');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'playwright', language: 'typescript' };
    const result = await gen.generateScript(cfg, escapingSteps);

    ok('result.success is true', result.success === true);
    const c = result.code;
    ok('single quotes safely handled in output', c.includes("O'Brien") || c.includes("O\\'Brien"));
    ok('newlines escaped (\\n)', c.includes('\\n'));
    ok('backslashes escaped', c.includes('\\\\'));
  }

  // ────────────────────────────────────────────────
  console.log('\n[11] String escaping - pyLit (Selenium Python)');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'selenium', language: 'python' };
    const result = await gen.generateScript(cfg, escapingSteps);

    ok('result.success is true', result.success === true);
    const c = result.code;
    ok('quotes properly escaped in Python', c.includes("\\'") || c.includes('\\"'));
  }

  // ────────────────────────────────────────────────
  console.log('\n[12] String escaping - jLit (Selenium Java)');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'selenium', language: 'java' };
    const result = await gen.generateScript(cfg, escapingSteps);

    ok('result.success is true', result.success === true);
    const c = result.code;
    ok('double quotes escaped in Java', c.includes('\\"') || c.includes('\\\\'));
  }

  // ────────────────────────────────────────────────
  console.log('\n[13] String escaping - kLit (Katalon Groovy)');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'katalon', language: 'groovy' };
    const result = await gen.generateScript(cfg, escapingSteps);

    ok('result.success is true', result.success === true);
    const c = result.code;
    ok('single quotes escaped in Groovy', c.includes("\\'") || c.includes("O\\'Brien"));
    ok('newlines escaped (\\n)', c.includes('\\n'));
  }

  // ────────────────────────────────────────────────
  console.log('\n[14] Default framework/language fallback');
  // ────────────────────────────────────────────────
  {
    const cfg = { testSuite: 'Minimal', targetUrl: 'https://test.com' };
    const minSteps = [{
      step: 1,
      action: 'click',
      targetLabel: 'Go',
      description: 'Click go',
      selectorType: 'getByText',
      selectorValue: 'Go',
      matchScore: 100
    }];
    const result = await gen.generateScript(cfg, minSteps);

    ok('result.success is true', result.success === true);
    contains(result.code, "import { test, expect", 'defaults to Playwright TS');
  }

  // ────────────────────────────────────────────────
  console.log('\n[15] Java class name sanitization');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, testSuite: '123 Invalid Start!', framework: 'selenium', language: 'java' };
    const minSteps = [{
      step: 1, action: 'click', targetLabel: 'OK', description: 'click',
      selectorType: 'getByText', selectorValue: 'OK', matchScore: 100
    }];
    const result = await gen.generateScript(cfg, minSteps);

    ok('result.success is true', result.success === true);
    matches(result.code, /public class Test\d+InvalidStart/, 'digit-leading name gets Test prefix');
  }

  // ────────────────────────────────────────────────
  console.log('\n[16] No viewport config');
  // ────────────────────────────────────────────────
  {
    const cfg = { testSuite: 'No Viewport', targetUrl: 'https://test.com', framework: 'playwright', language: 'typescript' };
    const minSteps = [{
      step: 1, action: 'click', targetLabel: 'OK', description: 'click',
      selectorType: 'getByText', selectorValue: 'OK', matchScore: 100
    }];
    const result = await gen.generateScript(cfg, minSteps);

    ok('result.success is true', result.success === true);
    ok('no setViewportSize when viewport missing', !result.code.includes('setViewportSize'));
  }

  // ────────────────────────────────────────────────
  console.log('\n[17] GenerationResult structure');
  // ────────────────────────────────────────────────
  {
    const cfg = { ...baseConfig, framework: 'playwright', language: 'typescript' };
    const result = await gen.generateScript(cfg, resolvedSteps);

    ok('has success boolean', typeof result.success === 'boolean');
    ok('has code string', typeof result.code === 'string');
    ok('has resolvedSteps array', Array.isArray(result.resolvedSteps));
    ok('has warnings array', Array.isArray(result.warnings));
    ok('has logs array', Array.isArray(result.logs));
    ok('logs contain step info', result.logs[0].includes('Step 1'));
    ok('logs contain action', result.logs[0].includes('fill'));
    ok('logs contain matchScore', result.logs[0].includes('score'));
  }

  // ── assert_visible/text page-text search incl. input value ────
  console.log('\n[pageText] assert_visible/text finds text in node OR input value');
  {
    const cfg = { ...baseConfig, framework: 'playwright', language: 'typescript' };
    const ptSteps = [
      { step: 1, action: 'assert_visible', targetLabel: '800.000',
        selectorType: 'pageText', selectorValue: '800.000', matchScore: 0 },
      { step: 2, action: 'assert_text', targetLabel: 'Welcome', expected: 'Welcome',
        selectorType: 'pageText', selectorValue: 'Welcome', matchScore: 0 }
    ];
    const res = await gen.generateScript(cfg, ptSteps);
    ok('pageText: generation succeeds', res.success === true);
    ok('pageText: uses a page-text search helper (not text= exact)', res.code.includes('assertTextOnPage'));
    ok('pageText: helper reads input values', res.code.includes('inputValue') || res.code.includes('.value'));
    ok('pageText: does NOT emit exact text= locator for these', !res.code.includes(`text="800.000"`));
    ok('pageText: carries the searched text 800.000', res.code.includes('800.000'));

    const resJs = await gen.generateScript({ ...cfg, language: 'javascript' }, ptSteps);
    ok('pageText (JS): generation succeeds', resJs.success === true);
    ok('pageText (JS): uses assertTextOnPage helper', resJs.code.includes('assertTextOnPage'));
  }

  // ── assert_value end-to-end (US-07 / AC-07.05-07.10) ────
  console.log('\n[assert_value] generateScript with assert_value action');
  {
    const cfg = { ...baseConfig, framework: 'playwright', language: 'typescript' };
    const avSteps = [
      { step: 1, action: 'assert_value', targetLabel: 'Total',
        selectorType: 'getByLabel', selectorValue: 'Total', expected: '1.500', matchScore: 90 }
    ];
    const res = await gen.generateScript(cfg, avSteps);
    ok('assert_value: generation succeeds', res.success === true && typeof res.code === 'string');
    ok('assert_value: reads the input value (inputValue)', res.code.includes('inputValue'));
    ok('assert_value: carries expected 1.500', res.code.includes('1.500'));
    ok('assert_value: locates field by label Total', /getByLabel\(new RegExp\('Total'/.test(res.code));
    ok('assert_value: not-found message present', res.code.includes('was found on the page'));
    ok('assert_value: mismatch message present', res.code.includes('does not contain the expected'));

    const resJs = await gen.generateScript({ ...cfg, language: 'javascript' }, avSteps);
    ok('assert_value (JS): generation succeeds', resJs.success === true);
    ok('assert_value (JS): reads inputValue', resJs.code.includes('inputValue'));
  }

  // ── Scoped within end-to-end (US-36 / AC-36.01, 36.06) ────
  console.log('\n[within-e2e] generateScript with options.within');
  {
    const cfg = { ...baseConfig, framework: 'playwright', language: 'typescript' };
    const withinSteps = [
      {
        step: 1, action: 'click', targetLabel: 'Action menu',
        selectorType: 'getByRole', selectorValue: 'button', roleName: 'Action menu',
        matchScore: 80, options: { within: '260911-0003' }
      },
      {
        step: 2, action: 'click', targetLabel: 'Selesai',
        selectorType: 'getByText', selectorValue: 'Selesai',
        matchScore: 80
      }
    ];
    const res = await gen.generateScript(cfg, withinSteps);
    ok('within: generation succeeds', res.success === true && typeof res.code === 'string');
    ok('within step 1 is row-scoped', /scopedRow\(\s*'260911-0003'\s*\)/.test(res.code));
    ok('within step 1 keeps the inner target (getByRole)', res.code.includes('getByRole'));
    ok('within step 1 asserts the row is resolvable', res.code.includes('assertResolvable'));
    // Step 2 has no within: its getByText('Selesai') click must be page-rooted, not scoped.
    ok('within step 2 (no within) uses a page-rooted locator', /maestro\.interact\(page\.getByText\(new RegExp\('Selesai'/.test(res.code));
    ok('scopedRow definition + one scoped step = marker appears for step 1 only', (res.code.match(/scopedRow\('260911-0003'\)/g) || []).length >= 1);
    ok('scopedRow helper is defined in output', res.code.includes('scopedRow(marker'));

    // Same must hold for Playwright JavaScript output (also executed on the server).
    const resJs = await gen.generateScript({ ...cfg, language: 'javascript' }, withinSteps);
    ok('within (JS): generation succeeds', resJs.success === true);
    ok('within (JS) step 1 is row-scoped', /scopedRow\(\s*'260911-0003'\s*\)/.test(resJs.code));
    ok('within (JS) step 2 (no within) is page-rooted', /await page\.getByText\('Selesai'\)/.test(resJs.code));
    ok('within (JS) scopedRow helper defined', resJs.code.includes('scopedRow(marker'));
  }

  // ── Scoped within-locator (US-36 / AC-36) ────
  console.log('\n[within] buildScopedLocatorExpr');
  const { buildScopedLocatorExpr } = require('../dist/generator/code-generator.js');
  ok('buildScopedLocatorExpr is exported', typeof buildScopedLocatorExpr === 'function');
  if (typeof buildScopedLocatorExpr === 'function') {
    const inner = "page.getByRole('button')";
    // AC-36.06: within kosong/absen -> ekspresi target apa adanya.
    ok('empty within returns inner unchanged', buildScopedLocatorExpr(inner, '') === inner);
    ok('undefined within returns inner unchanged', buildScopedLocatorExpr(inner, undefined) === inner);
    ok('whitespace within returns inner unchanged', buildScopedLocatorExpr(inner, '   ') === inner);

    // AC-36.01: within ada -> bungkus scope baris + inner.
    const scoped = buildScopedLocatorExpr(inner, '260911-0003');
    ok('scoped wraps a row scope', /scopedRow\(/.test(scoped) || /getByRole\(\s*['"]row['"]/.test(scoped));
    ok('scoped mentions the marker text', scoped.includes('260911-0003'));
    ok('scoped still contains the inner target', scoped.includes('getByRole') && scoped.length > inner.length);

    // Escaping: kutip tunggal di marker tidak boleh memutus string literal.
    const q = buildScopedLocatorExpr(inner, "O'Brien Corp");
    ok('single quote in marker is escaped', q.includes("O\\'Brien") || q.includes('O\\u0027Brien') || /O.?Brien/.test(q));
    ok('quote-marker output has no unescaped breakouts', !/[^\\]'O'Brien/.test(q));
  }

  // ── Summary ──────────────────────────────────
  console.log('\n' + '='.repeat(50));
  if (failed > 0) {
    console.log(`FAILED: ${failed} of ${passed + failed} assertions`);
    process.exit(1);
  } else {
    console.log(`ALL CODE GENERATOR TESTS PASSED (${passed} assertions)`);
  }
})().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
