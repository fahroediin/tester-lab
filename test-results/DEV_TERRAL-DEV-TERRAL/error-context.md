# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: DEV_TERRAL.spec.ts >> DEV TERRAL
- Location: tests\DEV_TERRAL.spec.ts:3:5

# Error details

```
Error: page.evaluate: Target page, context or browser has been closed
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test('DEV TERRAL', async ({ page }) => {
  4   |   // Set viewport if configured
  5   | 
  6   |   // Navigate to target URL
  7   |   await page.goto('https://devterral.osacademy.net/');
  8   |   await page.waitForLoadState('networkidle');
  9   | 
  10  |   // Maestro-like Auto-Wait and Scroll-Until-Visible Engine
  11  |   const maestro = {
  12  |     async interact(
  13  |       locator: any,
  14  |       action:
  15  |         | 'click'
  16  |         | 'fill'
  17  |         | 'select'
  18  |         | 'check'
  19  |         | 'uncheck'
  20  |         | 'upload'
  21  |         | 'assert_visible'
  22  |         | 'assert_text',
  23  |       value?: string,
  24  |       expectedText?: string
  25  |     ) {
  26  |       let lastError;
  27  |       for (let i = 0; i < 15; i++) {
  28  |         try {
  29  |           await locator.first().waitFor({ state: 'attached', timeout: 1500 });
  30  | 
  31  |           if (action === 'click') {
  32  |             await locator.first().click({ force: true, timeout: 2000 });
  33  |           } else if (action === 'fill') {
  34  |             await locator.first().fill(value!, { force: true, timeout: 2000 });
  35  |           } else if (action === 'select') {
  36  |             await locator.first().selectOption(value!, { force: true, timeout: 2000 });
  37  |           } else if (action === 'check') {
  38  |             await locator.first().check({ force: true, timeout: 2000 });
  39  |           } else if (action === 'uncheck') {
  40  |             await locator.first().uncheck({ force: true, timeout: 2000 });
  41  |           } else if (action === 'upload') {
  42  |             await locator.first().setInputFiles(value!, { timeout: 2000 });
  43  |           } else if (action === 'assert_visible') {
  44  |             await expect(locator.first()).toBeVisible({ timeout: 2000 });
  45  |           } else if (action === 'assert_text') {
  46  |             await expect(locator.first()).toContainText(new RegExp(expectedText || '', 'i'), {
  47  |               timeout: 2000
  48  |             });
  49  |           }
  50  |           return; // Success
  51  |         } catch (e) {
  52  |           lastError = e;
  53  |           // Scroll down slightly if element is not interactable or not found
> 54  |           await page.evaluate(() => window.scrollBy(0, 400));
      |                      ^ Error: page.evaluate: Target page, context or browser has been closed
  55  |           await page.waitForTimeout(300); // Allow lazy-loaded elements to render
  56  |         }
  57  |       }
  58  |       throw new Error(
  59  |         `Maestro Auto-Scroll Timeout: Element not found or interactable. Last error: ${lastError?.message}`
  60  |       );
  61  |     }
  62  |   };
  63  | 
  64  |   // Helper for dynamic form locators (OutSystems/Complex UI)
  65  |   async function legacyAction(type: 'select' | 'fill', label: string, value: string) {
  66  |     const tag = type === 'select' ? 'select' : 'input';
  67  |     const escapedLabel = label.replace(/'/g, "\\'");
  68  |     const xpath = `xpath=((//*[normalize-space(.)='${escapedLabel}' or normalize-space(.)='${escapedLabel} *' or normalize-space(.)='${escapedLabel}*'])[1]/following::${tag}[1] | (//*[normalize-space(.)='${escapedLabel}' or normalize-space(.)='${escapedLabel} *' or normalize-space(.)='${escapedLabel}*'])[1]//${tag})[1]`;
  69  |     const target = page.locator(xpath);
  70  |     await maestro.interact(target, type, value);
  71  |   }
  72  | 
  73  |   console.log('__STEP_START__ 1');
  74  |   // Step 1: Isi kolom username
  75  | 
  76  |   await maestro.interact(page.getByPlaceholder(new RegExp('Username', 'i')), 'fill', 'Fieldman1');
  77  | 
  78  |   console.log('__STEP_START__ 2');
  79  |   // Step 2: Isi kolom password
  80  | 
  81  |   await maestro.interact(
  82  |     page.getByPlaceholder(new RegExp('Password', 'i')),
  83  |     'fill',
  84  |     'Fieldman123!'
  85  |   );
  86  | 
  87  |   console.log('__STEP_START__ 3');
  88  |   // Step 3: Klik tombol login
  89  | 
  90  |   await maestro.interact(page.getByRole('button', { name: new RegExp('Login', 'i') }), 'click');
  91  | 
  92  |   console.log('__STEP_START__ 4');
  93  |   // Step 4: Verifikasi URL beralih ke work order on-going
  94  | 
  95  |   await expect(page).toHaveURL(new RegExp('/work-orders/ongoing', 'i'));
  96  | 
  97  |   console.log('__STEP_START__ 5');
  98  |   // Step 5: click -> Buat SPK
  99  | 
  100 |   await maestro.interact(page.getByRole('link', { name: new RegExp('Buat SPK', 'i') }), 'click');
  101 | 
  102 |   console.log('__STEP_START__ 6');
  103 |   // Step 6: fill -> Tanggal Order
  104 | 
  105 |   await legacyAction('fill', 'Tanggal Order', '2026-08-20');
  106 | 
  107 |   console.log('__STEP_START__ 7');
  108 |   // Step 7: fill -> Jenis Order
  109 | 
  110 |   await legacyAction('select', 'Jenis Order', 'Trucking & Material');
  111 | 
  112 |   console.log('__STEP_START__ 8');
  113 |   // Step 8: fill -> Nama Pelanggan
  114 | 
  115 |   await maestro.interact(
  116 |     page.getByPlaceholder(new RegExp('Ketik nama pelanggan...', 'i')),
  117 |     'fill',
  118 |     'JAMES ZHAO'
  119 |   );
  120 | 
  121 |   console.log('__STEP_START__ 9');
  122 |   // Step 9: wait -> jeda sebelum pilih pelanggan
  123 | 
  124 |   await page.waitForTimeout(1000);
  125 | 
  126 |   console.log('__STEP_START__ 10');
  127 |   // Step 10: click -> Pilih JAMES ZHAO
  128 |   // [WARNING]: Ambiguous Element Detected: Multiple candidates matched 'JAMES ZHAO' with score 40. Selected top-left element <div>.
  129 | 
  130 |   await maestro.interact(page.locator('text="JAMES ZHAO"'), 'click');
  131 | 
  132 |   console.log('__STEP_START__ 11');
  133 |   // Step 11: wait -> jeda setelah pilih pelanggan
  134 | 
  135 |   await page.waitForTimeout(1000);
  136 | 
  137 |   console.log('__STEP_START__ 12');
  138 |   // Step 12: fill -> Lokasi Asal
  139 | 
  140 |   await maestro.interact(
  141 |     page.getByPlaceholder(new RegExp('Ketik lokasi asal...', 'i')),
  142 |     'fill',
  143 |     'Q BUKIT MUTIARA INDONESIA'
  144 |   );
  145 | 
  146 |   console.log('__STEP_START__ 13');
  147 |   // Step 13: wait -> jeda sebelum pilih lokasi asal
  148 | 
  149 |   await page.waitForTimeout(1000);
  150 | 
  151 |   console.log('__STEP_START__ 14');
  152 |   // Step 14: click -> Pilih Q BUKIT MUTIARA INDONESIA
  153 | 
  154 |   await maestro.interact(page.getByRole('link', { name: new RegExp('Done', 'i') }), 'click');
```