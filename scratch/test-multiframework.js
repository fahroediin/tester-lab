import { TestScriptGenerator } from '../dist/index.js';

async function testMultiFramework() {
  const generator = new TestScriptGenerator();

  const baseDsl = {
    testSuite: 'Multi Framework Login Test',
    targetUrl: 'https://the-internet.herokuapp.com/login',
    steps: [
      { step: 1, action: 'fill', targetLabel: 'Username', value: 'tomsmith', description: 'Isi username' },
      { step: 2, action: 'fill', targetLabel: 'Password', value: 'SuperSecretPassword!', description: 'Isi password' },
      { step: 3, action: 'click', targetLabel: 'Login', description: 'Klik login' },
      { step: 4, action: 'assert_url', expected: '/secure', description: 'Verifikasi URL' }
    ]
  };

  console.log('=== TEST 1: CYPRESS ===');
  const cypressRes = await generator.generate({ ...baseDsl, framework: 'cypress', language: 'javascript' }, false);
  console.log(cypressRes.code);

  console.log('\n=== TEST 2: SELENIUM PYTHON ===');
  const seleniumRes = await generator.generate({ ...baseDsl, framework: 'selenium', language: 'python' }, false);
  console.log(seleniumRes.code);

  console.log('\n=== TEST 3: ROBOT FRAMEWORK ===');
  const robotRes = await generator.generate({ ...baseDsl, framework: 'robotframework', language: 'robot' }, false);
  console.log(robotRes.code);
}

testMultiFramework().catch(console.error);
