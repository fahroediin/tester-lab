/*
 * Renders the Selenium Java (TestNG) template through the real CodeGenerator
 * with a login-style scenario, then asserts the emitted code is well-formed.
 * Run: node scripts/test-selenium-java.js
 */
'use strict';
const assert = require('assert');
const { CodeGenerator } = require('../dist/generator/code-generator.js');

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, 'FAILED: ' + name);
  passed++;
  console.log('  ✓ ' + name);
}

(async () => {
  const gen = new CodeGenerator();

  const config = {
    testSuite: 'Practice Test Automation Logins',
    targetUrl: 'https://practicetestautomation.com/practice-test-login/',
    framework: 'selenium',
    language: 'java'
  };

  // resolvedSteps as the heuristic matcher would produce for the login flow.
  const resolvedSteps = [
    { step: 1, action: 'fill', selectorType: 'getByLabel', selectorValue: 'Username', value: 'student', description: 'Mengisi kolom username' },
    { step: 2, action: 'fill', selectorType: 'getByLabel', selectorValue: 'Password', value: 'Password123', description: 'Mengisi kolom password' },
    { step: 3, action: 'click', selectorType: 'getByRole', roleName: 'Submit', selectorValue: 'Submit', description: 'Klik tombol login/submit' },
    { step: 4, action: 'assert_url', selectorType: 'locator', selectorValue: '/logged-in-successfully', description: 'Verifikasi URL' },
    { step: 5, action: 'wait', selectorType: 'locator', selectorValue: '1000', value: '1000', description: 'Jeda' },
    { step: 6, action: 'assert_text', selectorType: 'locator', expected: 'Logged In Successfully', description: 'Cek teks' }
  ];

  const result = await gen.generateScript(config, resolvedSteps);
  const code = result.code;

  console.log('\n[1] Structure');
  ok('generation succeeded', result.success !== false && !!code);
  ok('class name derived from test suite', code.includes('public class PracticeTestAutomationLoginsTest'));
  ok('uses TestNG @Test annotation', code.includes('@Test') && code.includes('org.testng.annotations.Test'));
  ok('has @BeforeMethod setUp', code.includes('@BeforeMethod') && code.includes('public void setUp()'));
  ok('has @AfterMethod tearDown with quit', code.includes('@AfterMethod') && code.includes('driver.quit()'));

  console.log('\n[2] Explicit wait strategy');
  ok('constructs WebDriverWait', code.includes('new WebDriverWait(driver, Duration.ofSeconds(10))'));
  ok('fill waits for visibility', code.includes('ExpectedConditions.visibilityOfElementLocated'));
  ok('click waits for clickability', code.includes('ExpectedConditions.elementToBeClickable'));
  ok('assert_url waits on urlContains', code.includes('ExpectedConditions.urlContains'));

  console.log('\n[3] Step correctness');
  ok('username label xpath present', code.includes("//label[contains(., 'Username')]/following::input[1]"));
  ok('sendKeys with the username value', code.includes('sendKeys("student")'));
  ok('submit click xpath present', code.includes("//button[contains(., 'Submit')] | //a[contains(., 'Submit')]"));
  ok('assert_url uses getCurrentUrl().contains', code.includes('driver.getCurrentUrl().contains("/logged-in-successfully")'));
  ok('wait uses Thread.sleep in ms (no /1000)', code.includes('Thread.sleep(1000L)'));
  ok('assert_text checks page source', code.includes('driver.getPageSource().contains("Logged In Successfully")'));

  console.log('\n[4] No cross-language leakage');
  ok('no Python send_keys', !code.includes('send_keys'));
  ok('no Cypress cy.', !code.includes('cy.'));
  ok('no Playwright page.', !code.includes('page.'));

  console.log('\n[5] Java class name safety (leading digit)');
  const numConfig = { ...config, testSuite: '123 Numeric Suite' };
  const numResult = await gen.generateScript(numConfig, [resolvedSteps[0]]);
  ok('leading-digit suite name gets Test prefix', numResult.code.includes('public class Test123NumericSuiteTest'));

  console.log(`\nALL SELENIUM JAVA VERIFICATIONS PASSED (${passed} assertions)\n`);
})().catch((e) => { console.error(e); process.exit(1); });
