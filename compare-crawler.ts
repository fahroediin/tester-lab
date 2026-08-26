
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const FIRECRAWL_API_KEY = 'fc-792369e9d29740d1a8a458d6f3f820bd';

async function runFirecrawl() {
  console.log('Running Firecrawl...');
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: 'https://devterral.osacademy.net/',
      actions: [
        { type: 'write', text: 'Fieldman1', selector: 'input[placeholder="Username"]' },
        { type: 'write', text: 'Fieldman123!', selector: 'input[placeholder="Password"]' },
        { type: 'click', selector: 'button' },
        { type: 'wait', milliseconds: 3000 },
        { type: 'click', selector: 'text="Buat SPK"' },
        { type: 'wait', milliseconds: 5000 }
      ],
      formats: ['html', 'extract'],
      extract: {
        schema: {
          type: 'object',
          properties: {
            formFields: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  labelText: { type: 'string' },
                  inputName: { type: 'string' },
                  inputId: { type: 'string' },
                  type: { type: 'string' }
                }
              }
            }
          }
        }
      }
    })
  });

  const data = await response.json();
  fs.writeFileSync('firecrawl_output.json', JSON.stringify(data, null, 2));
  console.log('Firecrawl output saved to firecrawl_output.json');
}

async function runOurCrawler() {
  console.log('Running Our Crawler (Playwright)...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://devterral.osacademy.net/');
  await page.getByPlaceholder('Username').fill('Fieldman1');
  await page.getByPlaceholder('Password').fill('Fieldman123!');
  await page.getByRole('button', { name: 'Login' }).first().click();
  
  await page.waitForURL('**/work-orders/ongoing');
  await page.getByRole('link', { name: 'Buat SPK' }).first().click();
  
  await page.waitForTimeout(5000);
  
  const html = await page.content();
  fs.writeFileSync('our_crawler_dom.html', html);
  console.log('Our crawler DOM saved to our_crawler_dom.html');
  
  await browser.close();
}

async function main() {
  await runOurCrawler();
  await runFirecrawl();
}

main().catch(console.error);
