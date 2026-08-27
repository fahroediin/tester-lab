import { test, expect } from '@playwright/test';

test('DEV TERRAL', async ({ page }) => {
  // Set viewport if configured

  // Navigate to target URL
  await page.goto('https://devterral.osacademy.net/');
  await page.waitForLoadState('networkidle');

  // Maestro-like Auto-Wait and Scroll-Until-Visible Engine
  const maestro = {
    async interact(
      locator: any,
      action:
        | 'click'
        | 'fill'
        | 'select'
        | 'check'
        | 'uncheck'
        | 'upload'
        | 'assert_visible'
        | 'assert_text',
      value?: string,
      expectedText?: string
    ) {
      let lastError;
      for (let i = 0; i < 15; i++) {
        try {
          await locator.first().waitFor({ state: 'attached', timeout: 1500 });

          if (action === 'click') {
            await locator.first().click({ force: true, timeout: 2000 });
          } else if (action === 'fill') {
            await locator.first().fill(value!, { force: true, timeout: 2000 });
          } else if (action === 'select') {
            await locator.first().selectOption(value!, { force: true, timeout: 2000 });
          } else if (action === 'check') {
            await locator.first().check({ force: true, timeout: 2000 });
          } else if (action === 'uncheck') {
            await locator.first().uncheck({ force: true, timeout: 2000 });
          } else if (action === 'upload') {
            await locator.first().setInputFiles(value!, { timeout: 2000 });
          } else if (action === 'assert_visible') {
            await expect(locator.first()).toBeVisible({ timeout: 2000 });
          } else if (action === 'assert_text') {
            await expect(locator.first()).toContainText(new RegExp(expectedText || '', 'i'), {
              timeout: 2000
            });
          }
          return; // Success
        } catch (e) {
          lastError = e;
          // Scroll down slightly if element is not interactable or not found
          await page.evaluate(() => window.scrollBy(0, 400));
          await page.waitForTimeout(300); // Allow lazy-loaded elements to render
        }
      }
      throw new Error(
        `Maestro Auto-Scroll Timeout: Element not found or interactable. Last error: ${lastError?.message}`
      );
    }
  };

  // Helper for dynamic form locators (OutSystems/Complex UI)
  async function legacyAction(type: 'select' | 'fill', label: string, value: string) {
    const tag = type === 'select' ? 'select' : 'input';
    const escapedLabel = label.replace(/'/g, "\\'");
    const xpath = `xpath=((//*[normalize-space(.)='${escapedLabel}' or normalize-space(.)='${escapedLabel} *' or normalize-space(.)='${escapedLabel}*'])[1]/following::${tag}[1] | (//*[normalize-space(.)='${escapedLabel}' or normalize-space(.)='${escapedLabel} *' or normalize-space(.)='${escapedLabel}*'])[1]//${tag})[1]`;
    const target = page.locator(xpath);
    await maestro.interact(target, type, value);
  }

  console.log('__STEP_START__ 1');
  // Step 1: Isi kolom username

  await maestro.interact(page.getByPlaceholder(new RegExp('Username', 'i')), 'fill', 'Fieldman1');

  console.log('__STEP_START__ 2');
  // Step 2: Isi kolom password

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Password', 'i')),
    'fill',
    'Fieldman123!'
  );

  console.log('__STEP_START__ 3');
  // Step 3: Klik tombol login

  await maestro.interact(page.getByRole('button', { name: new RegExp('Login', 'i') }), 'click');

  console.log('__STEP_START__ 4');
  // Step 4: Verifikasi URL beralih ke work order on-going

  await expect(page).toHaveURL(new RegExp('/work-orders/ongoing', 'i'));

  console.log('__STEP_START__ 5');
  // Step 5: click -> Buat SPK

  await maestro.interact(page.getByRole('link', { name: new RegExp('Buat SPK', 'i') }), 'click');

  console.log('__STEP_START__ 6');
  // Step 6: fill -> Tanggal Order

  await legacyAction('fill', 'Tanggal Order', '2026-08-20');

  console.log('__STEP_START__ 7');
  // Step 7: fill -> Jenis Order

  await legacyAction('select', 'Jenis Order', 'Trucking & Material');

  console.log('__STEP_START__ 8');
  // Step 8: fill -> Nama Pelanggan

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik nama pelanggan...', 'i')),
    'fill',
    'JAMES ZHAO'
  );

  console.log('__STEP_START__ 9');
  // Step 9: wait -> jeda sebelum pilih pelanggan

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 10');
  // Step 10: click -> Pilih JAMES ZHAO
  // [WARNING]: Ambiguous Element Detected: Multiple candidates matched 'JAMES ZHAO' with score 40. Selected top-left element <div>.

  await maestro.interact(page.getByText(new RegExp('james zhao', 'i')), 'click');

  console.log('__STEP_START__ 11');
  // Step 11: wait -> jeda setelah pilih pelanggan

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 12');
  // Step 12: fill -> Lokasi Asal

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik lokasi asal...', 'i')),
    'fill',
    'Q BUKIT MUTIARA INDONESIA'
  );

  console.log('__STEP_START__ 13');
  // Step 13: wait -> jeda sebelum pilih lokasi asal

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 14');
  // Step 14: click -> Pilih Q BUKIT MUTIARA INDONESIA
  // [WARNING]: Ambiguous Element Detected: Multiple candidates matched 'Q BUKIT MUTIARA INDONESIA' with score 40. Selected top-left element <div>.

  await maestro.interact(page.getByText(new RegExp('q bukit mutiara indonesia', 'i')), 'click');

  console.log('__STEP_START__ 15');
  // Step 15: wait -> jeda setelah pilih lokasi asal

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 16');
  // Step 16: fill -> Lokasi Tujuan

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik lokasi tujuan...', 'i')),
    'fill',
    'PLANT BRIK SUNTER'
  );

  console.log('__STEP_START__ 17');
  // Step 17: wait -> jeda sebelum pilih lokasi tujuan

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 18');
  // Step 18: click -> Pilih PLANT BRIK SUNTER
  // [WARNING]: Ambiguous Element Detected: Multiple candidates matched 'PLANT BRIK SUNTER' with score 40. Selected top-left element <div>.

  await maestro.interact(page.getByText(new RegExp('plant brik sunter', 'i')), 'click');

  console.log('__STEP_START__ 19');
  // Step 19: wait -> jeda setelah pilih lokasi tujuan

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 20');
  // Step 20: fill -> Nama Material

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik nama material...', 'i')),
    'fill',
    'BATU ANDESIT'
  );

  console.log('__STEP_START__ 21');
  // Step 21: wait -> jeda sebelum pilih material

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 22');
  // Step 22: click -> Pilih BATU ANDESIT
  // [WARNING]: Ambiguous Element Detected: Multiple candidates matched 'BATU ANDESIT' with score 40. Selected top-left element <div>.

  await maestro.interact(page.getByText(new RegExp('batu andesit', 'i')), 'click');

  console.log('__STEP_START__ 23');
  // Step 23: wait -> jeda setelah pilih material

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 24');
  // Step 24: select -> Jenis Kendaraan

  await legacyAction('select', 'Jenis Kendaraan', 'Internal');

  console.log('__STEP_START__ 25');
  // Step 25: fill -> Nopol Kendaraan

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik no. polisi kendaraan...', 'i')),
    'fill',
    'B 9568 SYL'
  );

  console.log('__STEP_START__ 26');
  // Step 26: wait -> jeda sebelum pilih nopol

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 27');
  // Step 27: click -> Pilih B 9568 SYL
  // [WARNING]: Low match score (0) for target: 'B 9568 SYL'. Using fallback text locator.

  await maestro.interact(page.locator('text="B 9568 SYL"'), 'click');

  console.log('__STEP_START__ 28');
  // Step 28: wait -> jeda setelah pilih nopol

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 29');
  // Step 29: fill -> Nama Sopir

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik nama sopir...', 'i')),
    'fill',
    'RUSTAM'
  );

  console.log('__STEP_START__ 30');
  // Step 30: wait -> jeda sebelum pilih sopir

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 31');
  // Step 31: click -> Pilih RUSTAM
  // [WARNING]: Low match score (0) for target: 'RUSTAM'. Using fallback text locator.

  await maestro.interact(page.locator('text="RUSTAM"'), 'click');

  console.log('__STEP_START__ 32');
  // Step 32: wait -> jeda setelah pilih sopir

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 33');
  // Step 33: fill -> No. Surat Jalan

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik no. surat jalan...', 'i')),
    'fill',
    '135696'
  );

  console.log('__STEP_START__ 34');
  // Step 34: wait -> jeda sebelum pilih surat jalan

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 35');
  // Step 35: click -> Pilih 135696
  // [WARNING]: Low match score (0) for target: '135696'. Using fallback text locator.

  await maestro.interact(page.locator('text="135696"'), 'click');

  console.log('__STEP_START__ 36');
  // Step 36: wait -> jeda setelah pilih surat jalan

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 37');
  // Step 37: fill -> Nomor DO

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik nomor DO...', 'i')),
    'fill',
    '242304'
  );

  console.log('__STEP_START__ 38');
  // Step 38: wait -> jeda sebelum pilih nomor do

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 39');
  // Step 39: click -> Pilih 242304
  // [WARNING]: Low match score (0) for target: '242304'. Using fallback text locator.

  await maestro.interact(page.locator('text="242304"'), 'click');

  console.log('__STEP_START__ 40');
  // Step 40: wait -> jeda setelah pilih nomor do

  await page.waitForTimeout(1000);

  console.log('__STEP_START__ 41');
  // Step 41: check -> Uang Jalan Dimuka

  await maestro.interact(page.locator('input[name="has_travel_allowance"]'), 'click');

  console.log('__STEP_START__ 42');
  // Step 42: wait ->

  await page.waitForTimeout(1000);
});
