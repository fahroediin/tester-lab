/*
 * Tests for Katalon Studio (Groovy) template generation.
 * Asserts generated code is well-formed Groovy using WebUI keywords.
 * Run: node scripts/test-katalon.js
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { CodeGenerator } = require('../dist/generator/code-generator.js');

let passed = 0;
let failed = 0;

function ok(name, cond) {
  if (!cond) {
    failed++;
    console.log('  FAIL: ' + name);
  } else {
    passed++;
    console.log('  ✓ ' + name);
  }
}

(async () => {
  const gen = new CodeGenerator();

  const config = {
    testSuite: 'Katalon Login Flow',
    targetUrl: 'https://example.com/login',
    framework: 'katalon',
    language: 'groovy'
  };

  const resolvedSteps = [
    { step: 1, action: 'fill', selectorType: 'getByLabel', selectorValue: 'Username', value: 'qa_user', description: 'Fill username' },
    { step: 2, action: 'fill', selectorType: 'getByPlaceholder', selectorValue: 'Enter password', value: "p@ss'word", description: 'Fill password' },
    { step: 3, action: 'fill', selectorType: 'getByTestId', selectorValue: 'otp-input', value: '123456', description: 'Fill OTP' },
    { step: 4, action: 'fill', selectorType: 'locator', selectorValue: '#notes', value: 'test note', description: 'Fill notes' },
    { step: 5, action: 'click', selectorType: 'getByRole', roleName: 'Sign In', selectorValue: 'button', description: 'Click Sign In' },
    { step: 6, action: 'click', selectorType: 'getByText', selectorValue: 'Remember Me', description: 'Click Remember Me' },
    { step: 7, action: 'click', selectorType: 'getByTestId', selectorValue: 'submit-btn', description: 'Click submit' },
    { step: 8, action: 'select', selectorType: 'locator', selectorValue: '#country', value: 'Indonesia', description: 'Select country' },
    { step: 9, action: 'check', selectorType: 'locator', selectorValue: '#agree', description: 'Check agree' },
    { step: 10, action: 'uncheck', selectorType: 'locator', selectorValue: '#subscribe', description: 'Uncheck subscribe' },
    { step: 11, action: 'upload', selectorType: 'locator', selectorValue: '#file', value: '/path/doc.pdf', description: 'Upload file' },
    { step: 12, action: 'assert_url', selectorType: 'locator', selectorValue: '/dashboard', description: 'Verify dashboard URL' },
    { step: 13, action: 'assert_text', selectorType: 'locator', expected: 'Welcome back', description: 'Verify welcome text' },
    { step: 14, action: 'assert_visible', selectorType: 'getByTestId', selectorValue: 'dashboard-header', description: 'Verify header visible' },
    { step: 15, action: 'wait', selectorType: 'locator', selectorValue: '2000', description: 'Wait 2 seconds' }
  ];

  const result = await gen.generateScript(config, resolvedSteps);
  const code = result.code;

  console.log('\n[1] Structure & Imports');
  ok('generation succeeded', result.success === true && !!code);
  ok('imports WebUiBuiltInKeywords as WebUI', code.includes('import com.kms.katalon.core.webui.keyword.WebUiBuiltInKeywords as WebUI'));
  ok('imports TestObject', code.includes('import com.kms.katalon.core.testobject.TestObject'));
  ok('imports ConditionType', code.includes('import com.kms.katalon.core.testobject.ConditionType'));
  ok('has makeTestObject helper', code.includes('TestObject makeTestObject('));
  ok('opens browser', code.includes("WebUI.openBrowser('')"));
  ok('navigates to target URL', code.includes("WebUI.navigateToUrl('https://example.com/login')"));
  ok('closes browser at end', code.includes('WebUI.closeBrowser()'));

  console.log('\n[2] WebUI Keywords & Actions');
  ok('fill with getByLabel generates WebUI.setText with label xpath', code.includes("WebUI.setText(makeTestObject(\"//label[contains(., 'Username')]/following::input[1]\"), 'qa_user')"));
  ok('fill with getByPlaceholder generates WebUI.setText with placeholder xpath', code.includes("WebUI.setText(makeTestObject(\"//input[@placeholder='Enter password']\"),"));
  ok('fill with getByTestId generates WebUI.setText with data-testid', code.includes("WebUI.setText(makeTestObject(\"//*[@data-testid='otp-input']\"), '123456')"));
  ok('click with getByRole generates WebUI.click with button/a xpath', code.includes("WebUI.click(makeTestObject(\"//button[contains(., 'Sign In')] | //a[contains(., 'Sign In')]\"))"));
  ok('click with getByText generates WebUI.click with text() xpath', code.includes("WebUI.click(makeTestObject(\"//*[contains(text(), 'Remember Me')]\"))"));
  ok('select generates WebUI.selectOptionByLabel', code.includes("WebUI.selectOptionByLabel(makeTestObject('#country', 'css'), 'Indonesia', false)"));
  ok('check generates WebUI.check', code.includes("WebUI.check(makeTestObject('#agree', 'css'))"));
  ok('uncheck generates WebUI.uncheck', code.includes("WebUI.uncheck(makeTestObject('#subscribe', 'css'))"));
  ok('upload generates WebUI.uploadFile', code.includes("WebUI.uploadFile(makeTestObject('#file', 'css'), '/path/doc.pdf')"));
  ok('assert_url generates WebUI.verifyMatch', code.includes("WebUI.verifyMatch(WebUI.getUrl(), '.*' + '/dashboard' + '.*', true)"));
  ok('assert_text generates WebUI.verifyTextPresent', code.includes("WebUI.verifyTextPresent('Welcome back', false)"));
  ok('assert_visible generates WebUI.verifyElementPresent', code.includes("WebUI.verifyElementPresent(makeTestObject(\"//*[@data-testid='dashboard-header']\"), 10)"));
  ok('wait converts 2000ms to 2s for WebUI.delay', code.includes('WebUI.delay(2)'));

  console.log('\n[3] String Escaping (kLit)');
  ok('escapes single quote in value without breakout', code.includes("p@ss\\'word"));

  console.log('\n[4] No Cross-Language Leakage');
  ok('no Playwright page.', !code.includes('page.'));
  ok('no Cypress cy.', !code.includes('cy.'));
  ok('no Python self.driver', !code.includes('self.driver'));
  ok('no Robot Framework *** Test Cases ***', !code.includes('*** Test Cases ***'));

  console.log('\n[5] Katalon Groovy Reverse-Parsing (AC-11.12 to AC-11.16)');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf-8');
  const sandbox = {};
  const callArgsMatch = appJs.match(/function extractCallArgs[\s\S]*?\n    \}/);
  const parseGroovyMatch = appJs.match(/function parseGroovyToSteps[\s\S]*?\n    \}/);
  ok('found extractCallArgs in app.js', !!callArgsMatch);
  ok('found parseGroovyToSteps in app.js', !!parseGroovyMatch);

  vm.runInNewContext(callArgsMatch[0] + '\n' + parseGroovyMatch[0] + '\nsandbox.parseGroovyToSteps = parseGroovyToSteps;', { sandbox });
  const parseGroovyToSteps = sandbox.parseGroovyToSteps;

  const parsed = parseGroovyToSteps(code);
  ok('parses all 15 steps from generated script', parsed.length === 15);
  ok('step 1 fill label', parsed[0].action === 'fill' && parsed[0].targetLabel === 'Username' && parsed[0].value === 'qa_user' && parsed[0].description === 'Fill username');
  ok('step 2 fill unescapes quotes', parsed[1].action === 'fill' && parsed[1].targetLabel === 'Enter password' && parsed[1].value === "p@ss'word");
  ok('step 3 fill testid', parsed[2].action === 'fill' && parsed[2].targetLabel === 'otp-input' && parsed[2].value === '123456');
  ok('step 4 fill css', parsed[3].action === 'fill' && parsed[3].targetLabel === '#notes' && parsed[3].value === 'test note');
  ok('step 5 click role', parsed[4].action === 'click' && parsed[4].targetLabel === 'Sign In');
  ok('step 6 click text', parsed[5].action === 'click' && parsed[5].targetLabel === 'Remember Me');
  ok('step 7 click testid', parsed[6].action === 'click' && parsed[6].targetLabel === 'submit-btn');
  ok('step 8 select', parsed[7].action === 'select' && parsed[7].targetLabel === '#country' && parsed[7].value === 'Indonesia');
  ok('step 9 check', parsed[8].action === 'check' && parsed[8].targetLabel === '#agree');
  ok('step 10 uncheck', parsed[9].action === 'uncheck' && parsed[9].targetLabel === '#subscribe');
  ok('step 11 upload', parsed[10].action === 'upload' && parsed[10].targetLabel === '#file' && parsed[10].value === '/path/doc.pdf');
  ok('step 12 assert_url', parsed[11].action === 'assert_url' && parsed[11].value === '/dashboard');
  ok('step 13 assert_text', parsed[12].action === 'assert_text' && parsed[12].value === 'Welcome back');
  ok('step 14 assert_visible', parsed[13].action === 'assert_visible' && parsed[13].targetLabel === 'dashboard-header');
  ok('step 15 wait', parsed[14].action === 'wait' && parsed[14].value === '2000');

  // Test raw Katalon without step comments
  const rawScript = `
    WebUI.openBrowser('')
    WebUI.navigateToUrl('https://example.com/login')
    WebUI.setText(findTestObject('Page_Login/input_username'), 'admin')
    WebUI.click(findTestObject('Page_Login/btn_login'))
    WebUI.verifyTextPresent('Welcome', false)
    WebUI.delay(3)
    WebUI.closeBrowser()
  `;
  const parsedRaw = parseGroovyToSteps(rawScript);
  ok('parses raw script without step comments (4 steps)', parsedRaw.length === 4);
  ok('raw step 1 fill', parsedRaw[0].action === 'fill' && parsedRaw[0].targetLabel === 'input_username' && parsedRaw[0].value === 'admin');
  ok('raw step 2 click', parsedRaw[1].action === 'click' && parsedRaw[1].targetLabel === 'btn_login');
  ok('raw step 3 assert_text', parsedRaw[2].action === 'assert_text' && parsedRaw[2].value === 'Welcome');
  ok('raw step 4 wait', parsedRaw[3].action === 'wait' && parsedRaw[3].value === '3000');

  // Test empty/invalid
  ok('empty returns empty array', parseGroovyToSteps('').length === 0);
  ok('null returns empty array', parseGroovyToSteps(null).length === 0);

  console.log('\n' + '='.repeat(50));
  if (failed > 0) {
    console.log(`FAILED: ${failed} of ${passed + failed} assertions`);
    process.exit(1);
  } else {
    console.log(`ALL KATALON GROOVY VERIFICATIONS PASSED (${passed} assertions)\n`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
