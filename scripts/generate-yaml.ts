import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { TestScriptGenerator } from '../src/index';

async function run() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npm run gen-yaml <path-to-yaml>');
    process.exit(1);
  }

  const yamlContent = fs.readFileSync(path.resolve(file), 'utf8');
  const dslPayload = yaml.load(yamlContent) as any;
  
  // Transform YAML to API JSON format
  dslPayload.steps = dslPayload.steps.map((s: any, i: number) => {
    const stepObj: any = {
      step: i + 1,
      action: s.action,
      description: s.description,
      targetLabel: s.targetLabel
    };
    if (s.action === 'fill' || s.action === 'select' || s.action === 'upload') stepObj.value = s.value;
    if (s.action === 'assert_url' || s.action === 'assert_text') stepObj.expected = s.value;
    if (s.action === 'wait') stepObj.value = s.value;
    return stepObj;
  });

  const generator = new TestScriptGenerator();
  const outPath = file.replace('.yaml', '.spec.ts');
  
  console.log('Generating script... This may take up to 45 seconds (bypassing Nginx proxy).');
  const result = await generator.generate(dslPayload, { dryRun: false, outPath });
  
  if (result.success) {
    console.log('\n[SUCCESS] Script generated at:', outPath);
  } else {
    console.log('\n[FAILED]', result.warnings);
  }
}

run();
