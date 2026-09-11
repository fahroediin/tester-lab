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
  ok('raw step 1 fill cleaned target', parsedRaw[0].action === 'fill' && parsedRaw[0].targetLabel === 'username' && parsedRaw[0].value === 'admin');
  ok('raw step 2 click cleaned target', parsedRaw[1].action === 'click' && parsedRaw[1].targetLabel === 'login');
  ok('raw step 3 assert_text', parsedRaw[2].action === 'assert_text' && parsedRaw[2].value === 'Welcome');
  ok('raw step 4 wait', parsedRaw[3].action === 'wait' && parsedRaw[3].value === '3000');

  // Test native Katalon Studio script (tests/Script1782801212727.groovy)
  const nativeScriptPath = path.join(__dirname, '..', 'tests', 'Script1782801212727.groovy');
  if (fs.existsSync(nativeScriptPath)) {
    const nativeCode = fs.readFileSync(nativeScriptPath, 'utf-8');
    const parsedNative = parseGroovyToSteps(nativeCode);
    ok('native Katalon parses 6 steps', parsedNative.length === 6);
    ok('native step 1 waitForElementVisible', parsedNative[0].action === 'assert_visible' && parsedNative[0].targetLabel === 'Username');
    ok('native step 2 setText', parsedNative[1].action === 'fill' && parsedNative[1].targetLabel === 'Username' && parsedNative[1].value === 'adhy.surnanto');
    ok('native step 3 setEncryptedText', parsedNative[2].action === 'fill' && parsedNative[2].targetLabel === 'Password' && parsedNative[2].value === 'DKZg8gTnVzw=');
    ok('native step 4 button_Login click', parsedNative[3].action === 'click' && parsedNative[3].targetLabel === 'Login');
    ok('native step 5 multiline waitForElementVisible', parsedNative[4].action === 'assert_visible' && parsedNative[4].targetLabel === 'Risk Control Unit Application');
    ok('native step 6 doubleClick', parsedNative[5].action === 'click' && parsedNative[5].targetLabel === 'Risk Control Unit Application');
  }

  console.log('\n[6] Native Katalon Robustness (FailureHandling, GlobalVariable, callTestCase, CustomKeywords, unquoted vars)');
  const nativeRobust = `
import static com.kms.katalon.core.testobject.ObjectRepository.findTestObject
import com.kms.katalon.core.model.FailureHandling as FailureHandling
import com.kms.katalon.core.webui.keyword.WebUiBuiltInKeywords as WebUI
import internal.GlobalVariable as GlobalVariable

WebUI.openBrowser('', FailureHandling.STOP_ON_FAILURE)
WebUI.navigateToUrl(GlobalVariable.G_SiteURL)
WebUI.callTestCase(findTestCase('Login/Do Login'), [:], FailureHandling.STOP_ON_FAILURE)
WebUI.waitForElementClickable(findTestObject('Master Page/Menu/elCreate'), 0)
WebUI.click(findTestObject('Master Page/Menu/elCreate'), FailureHandling.CONTINUE_ON_FAILURE)
WebUI.setText(findTestObject('Create Issue/elSummary'), fixed_summary, FailureHandling.STOP_ON_FAILURE)
CustomKeywords.'com.jira.JSelect.selectByText'('Priority', 'Low')
WebUI.verifyElementText(findTestObject('Create Issue/elTitle'), 'Create issue')
WebUI.setText(findTestObject('Login Page/input_username'), 'admin', FailureHandling.STOP_ON_FAILURE)
WebUI.closeBrowser()
`;
  const robust = parseGroovyToSteps(nativeRobust);
  const hasWarn = (s) => !!s.warning;
  ok('waitForElementClickable becomes assert_visible for elCreate',
     robust.some(s => s.action === 'assert_visible' && s.targetLabel === 'elCreate'));
  ok('verifyElementText becomes assert_text "Create issue"',
     robust.some(s => s.action === 'assert_text' && s.value === 'Create issue'));
  ok('click with FailureHandling arg still reads elCreate target',
     robust.some(s => s.action === 'click' && s.targetLabel === 'elCreate'));
  ok('setText with trailing FailureHandling keeps value=admin',
     robust.some(s => s.action === 'fill' && s.targetLabel === 'username' && s.value === 'admin'));
  ok('unquoted Groovy variable value is flagged with a warning',
     robust.some(s => s.action === 'fill' && s.targetLabel === 'elSummary' && hasWarn(s)));
  ok('callTestCase produces a flagged/unsupported step',
     robust.some(s => hasWarn(s) && /callTestCase/i.test(s.warning || '')));
  ok('CustomKeywords produces a flagged/unsupported step',
     robust.some(s => hasWarn(s) && /CustomKeywords/i.test(s.warning || '')));

  console.log('\n[7] Import Warning Summary (reported to user, not silently dropped)');
  const summaryMatch = appJs.match(/function summarizeImportWarnings[\s\S]*?\n    \}/);
  ok('found summarizeImportWarnings in app.js', !!summaryMatch);
  if (summaryMatch) {
    vm.runInNewContext(summaryMatch[0] + '\nsandbox.summarize = summarizeImportWarnings;', { sandbox });
    const summarize = sandbox.summarize;
    ok('no warnings -> null summary', summarize(robust.filter(s => !s.warning).map(s => ({ action: s.action }))) === null);
    const summary = summarize(robust);
    ok('counts the 3 flagged steps from native fixture', typeof summary === 'string' && /3/.test(summary));
    ok('summary mentions manual attention', typeof summary === 'string' && /manual|attention|review/i.test(summary));
  }

  // Helper: pull a top-level (4-space indented) function body out of app.js and
  // eval it into our sandbox, returning the callable.
  function loadFn(name) {
    const re = new RegExp('function ' + name + '[\\s\\S]*?\\n    \\}');
    const m = appJs.match(re);
    ok('found ' + name + ' in app.js', !!m);
    if (!m) return null;
    vm.runInNewContext(m[0] + '\nsandbox.__fn = ' + name + ';', { sandbox });
    return sandbox.__fn;
  }

  console.log('\n[8] parseRsSelector — semantic mapping from Object Repository .rs');
  const parseRsSelector = loadFn('parseRsSelector');
  if (parseRsSelector) {
    // Real CURA input_username.rs: placeholder(false), id(false), name(false),
    // xpath(true) = id("txt-username"). Priority says placeholder wins over all.
    const rsFull = `<?xml version="1.0" encoding="UTF-8"?>
<WebElementEntity>
   <name>input_username</name>
   <webElementProperties><isSelected>true</isSelected><matchCondition>equals</matchCondition><name>tag</name><type>Main</type><value>input</value></webElementProperties>
   <webElementProperties><isSelected>true</isSelected><matchCondition>equals</matchCondition><name>xpath</name><type>Main</type><value>id("txt-username")</value></webElementProperties>
   <webElementProperties><isSelected>false</isSelected><matchCondition>equals</matchCondition><name>name</name><type>Main</type><value>username</value></webElementProperties>
   <webElementProperties><isSelected>false</isSelected><matchCondition>equals</matchCondition><name>id</name><type>Main</type><value>txt-username</value></webElementProperties>
   <webElementProperties><isSelected>false</isSelected><matchCondition>equals</matchCondition><name>placeholder</name><type>Main</type><value>Username</value></webElementProperties>
</WebElementEntity>`;
    const rFull = parseRsSelector(rsFull);
    ok('placeholder wins priority over id/name/xpath',
       rFull && rFull.kind === 'getByPlaceholder' && rFull.value === 'Username');

    const rsId = `<WebElementEntity>
   <webElementProperties><isSelected>true</isSelected><name>id</name><value>txt-user</value></webElementProperties>
   <webElementProperties><isSelected>true</isSelected><name>xpath</name><value>id("txt-user")</value></webElementProperties>
</WebElementEntity>`;
    const rId = parseRsSelector(rsId);
    ok('id maps to css #id when no placeholder', rId && rId.kind === 'css' && rId.value === '#txt-user');

    const rsName = `<WebElementEntity>
   <webElementProperties><isSelected>true</isSelected><name>name</name><value>email</value></webElementProperties>
</WebElementEntity>`;
    const rName = parseRsSelector(rsName);
    ok('name maps to css [name="..."]', rName && rName.kind === 'css' && rName.value === '[name="email"]');

    const rsXpath = `<WebElementEntity>
   <webElementProperties><isSelected>true</isSelected><name>xpath</name><value>id("only-xpath")</value></webElementProperties>
</WebElementEntity>`;
    const rXpath = parseRsSelector(rsXpath);
    ok('lone xpath id("x") normalizes to //*[@id=\'x\']',
       rXpath && rXpath.kind === 'xpath' && rXpath.value === "//*[@id='only-xpath']");

    const rsPlainXpath = `<WebElementEntity>
   <webElementProperties><isSelected>true</isSelected><name>xpath</name><value>//div[@class='x']</value></webElementProperties>
</WebElementEntity>`;
    const rPlain = parseRsSelector(rsPlainXpath);
    ok('plain // xpath is used as-is', rPlain && rPlain.kind === 'xpath' && rPlain.value === "//div[@class='x']");

    const rsEmpty = `<WebElementEntity><name>nothing</name></WebElementEntity>`;
    ok('no usable property -> null', parseRsSelector(rsEmpty) === null);
    ok('garbage input -> null (no throw)', parseRsSelector('not xml at all') === null);
    ok('null input -> null (no throw)', parseRsSelector(null) === null);
  }

  console.log('\n[9] buildRsIndex — normalize object paths');
  const buildRsIndex = loadFn('buildRsIndex');
  if (buildRsIndex) {
    const idx = buildRsIndex([
      { path: 'Object Repository/Login Page/input_username.rs', content: '<a/>' },
      { path: 'Object Repository/Master/Menu/elCreate.rs', content: '<b/>' },
      { path: 'Test Cases/foo.groovy', content: 'ignore me' }
    ]);
    ok('buildRsIndex returns a Map-like object', idx && typeof idx.get === 'function' && typeof idx.size === 'number');
    ok('strips Object Repository/ prefix and .rs suffix',
       idx.get('Login Page/input_username') === '<a/>');
    ok('keeps nested path', idx.get('Master/Menu/elCreate') === '<b/>');
    ok('ignores non-.rs entries', !idx.has('Test Cases/foo') && idx.size === 2);
  }

  console.log('\n[10] rsResolver end-to-end via parseGroovyToSteps(code, resolver)');
  // makeRsResolver calls parseRsSelector, so both must share one eval scope
  // (in production they live in the same closure; the harness isolates them).
  let makeRsResolver = null;
  const mkMatch = appJs.match(/function makeRsResolver[\s\S]*?\n    \}/);
  const rsMatch = appJs.match(/function parseRsSelector[\s\S]*?\n    \}/);
  ok('found makeRsResolver in app.js', !!mkMatch);
  if (mkMatch && rsMatch) {
    vm.runInNewContext(rsMatch[0] + '\n' + mkMatch[0] + '\nsandbox.mk = makeRsResolver;', { sandbox });
    makeRsResolver = sandbox.mk;
  }
  if (makeRsResolver && parseRsSelector) {
    const rsIndex = new Map([
      ['Login Page/input_username', `<WebElementEntity><webElementProperties><isSelected>false</isSelected><name>placeholder</name><value>Username</value></webElementProperties></WebElementEntity>`]
    ]);
    const resolver = makeRsResolver(rsIndex);
    const scriptWithRepo = `
WebUI.openBrowser('')
WebUI.setText(findTestObject('Login Page/input_username'), 'admin')
WebUI.click(findTestObject('Unknown Page/missing_object'))
WebUI.closeBrowser()
`;
    const resolved = parseGroovyToSteps(scriptWithRepo, resolver);
    const fillStep = resolved.find(s => s.action === 'fill');
    ok('resolved fill uses .rs placeholder as target, not object name',
       !!fillStep && fillStep.targetLabel === 'Username');
    const clickStep = resolved.find(s => s.action === 'click');
    ok('unresolved object falls back to cleaned name (no crash)',
       !!clickStep && clickStep.targetLabel === 'missing_object');
    // Regression guard within this block: same script WITHOUT resolver = old behavior
    const noResolver = parseGroovyToSteps(scriptWithRepo);
    ok('without resolver, fill target is object name (backward compatible)',
       noResolver.find(s => s.action === 'fill').targetLabel === 'username');
  }

  console.log('\n[11] findKatalonTestCases — detect .groovy in Scripts/ AND Test Cases/');
  const findKatalonTestCases = loadFn('findKatalonTestCases');
  if (findKatalonTestCases) {
    // Real Katalon Studio layout: Groovy lives under Scripts/<name>/Script*.groovy,
    // Test Cases/ holds only .tc metadata.
    const realProject = [
      'Test Generate Code Tester-Lab/Test Cases/Buat SPK DEV TERRAL.tc',
      'Test Generate Code Tester-Lab/Scripts/Buat SPK DEV TERRAL/Script1789118376776.groovy',
      'Test Generate Code Tester-Lab/Object Repository/Page_Login - BDS/input_Username.rs',
      'Test Generate Code Tester-Lab/.classpath',
      'Test Generate Code Tester-Lab/build.gradle'
    ];
    const foundReal = findKatalonTestCases(realProject);
    ok('finds the Scripts/ groovy as a test case',
       Array.isArray(foundReal) && foundReal.some(tc => tc.path.endsWith('Script1789118376776.groovy')));
    ok('test case name derived from Scripts/ folder',
       foundReal.some(tc => tc.name === 'Buat SPK DEV TERRAL'));
    ok('does not list .tc or .classpath as a test case',
       foundReal.every(tc => tc.path.endsWith('.groovy')));

    // Legacy/sample layout: .groovy directly under Test Cases/
    const legacy = [
      'Proj/Test Cases/Login Flow.groovy',
      'Proj/Object Repository/x.rs'
    ];
    const foundLegacy = findKatalonTestCases(legacy);
    ok('finds .groovy under Test Cases/ (legacy layout)',
       foundLegacy.some(tc => tc.path.endsWith('Login Flow.groovy') && tc.name === 'Login Flow'));

    // Both layouts present: dedup, both found
    const both = [
      'P/Scripts/A/Script1.groovy',
      'P/Test Cases/B.groovy'
    ];
    const foundBoth = findKatalonTestCases(both);
    ok('supports both layouts at once', foundBoth.length === 2);

    // No groovy anywhere -> empty
    ok('no groovy -> empty list', findKatalonTestCases(['P/build.gradle', 'P/x.rs']).length === 0);
    ok('null input -> empty list (no throw)', findKatalonTestCases(null).length === 0);
  }

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
