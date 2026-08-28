import { test, expect } from '@playwright/test';

test('DEV TERRAL', async ({ page }) => {
  // Set explicit timeout for long E2E flows
  test.setTimeout(180000);

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
    'BANGKIT JAYA SAMPURNA, PT'
  );

  console.log('__STEP_START__ 9');
  // Step 9: wait -> jeda sebelum pilih pelanggan

  await page.waitForTimeout(500);

  console.log('__STEP_START__ 10');
  // Step 10: click -> Pilih BANGKIT JAYA SAMPURNA, PT
  // [WARNING]: Ambiguous Element Detected: Multiple candidates matched 'BANGKIT JAYA SAMPURNA, PT' with score 40. Selected top-left element <div>.

  await maestro.interact(page.getByText(new RegExp('bangkit jaya sampurna, pt', 'i')), 'click');

  console.log('__STEP_START__ 11');
  // Step 11: fill -> Lokasi Asal

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik lokasi asal...', 'i')),
    'fill',
    'Q BUKIT MUTIARA INDONESIA'
  );

  console.log('__STEP_START__ 12');
  // Step 12: wait -> jeda sebelum pilih lokasi asal

  await page.waitForTimeout(500);

  console.log('__STEP_START__ 13');
  // Step 13: click -> Pilih Q BUKIT MUTIARA INDONESIA
  // [WARNING]: Ambiguous Element Detected: Multiple candidates matched 'Q BUKIT MUTIARA INDONESIA' with score 40. Selected top-left element <div>.

  await maestro.interact(page.getByText(new RegExp('q bukit mutiara indonesia', 'i')), 'click');

  console.log('__STEP_START__ 14');
  // Step 14: fill -> Lokasi Tujuan

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik lokasi tujuan...', 'i')),
    'fill',
    'PLANT BRIK SUNTER'
  );

  console.log('__STEP_START__ 15');
  // Step 15: wait -> jeda sebelum pilih lokasi tujuan

  await page.waitForTimeout(500);

  console.log('__STEP_START__ 16');
  // Step 16: click -> Pilih PLANT BRIK SUNTER
  // [WARNING]: Ambiguous Element Detected: Multiple candidates matched 'PLANT BRIK SUNTER' with score 40. Selected top-left element <div>.

  await maestro.interact(page.getByText(new RegExp('plant brik sunter', 'i')), 'click');

  console.log('__STEP_START__ 17');
  // Step 17: fill -> Nama Material

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik nama material...', 'i')),
    'fill',
    'BATU ANDESIT'
  );

  console.log('__STEP_START__ 18');
  // Step 18: wait -> jeda sebelum pilih material

  await page.waitForTimeout(500);

  console.log('__STEP_START__ 19');
  // Step 19: click -> Pilih BATU ANDESIT
  // [WARNING]: Ambiguous Element Detected: Multiple candidates matched 'BATU ANDESIT' with score 40. Selected top-left element <div>.

  await maestro.interact(page.getByText(new RegExp('batu andesit', 'i')), 'click');

  console.log('__STEP_START__ 20');
  // Step 20: select -> Jenis Kendaraan

  await legacyAction('select', 'Jenis Kendaraan', 'Internal');

  console.log('__STEP_START__ 21');
  // Step 21: fill -> Nopol Kendaraan

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik no. polisi kendaraan...', 'i')),
    'fill',
    'B 9888 LZ'
  );

  console.log('__STEP_START__ 22');
  // Step 22: wait -> jeda sebelum pilih nopol

  await page.waitForTimeout(500);

  console.log('__STEP_START__ 23');
  // Step 23: click -> B 9888 LZ
  // [WARNING]: Ambiguous Element Detected: Multiple candidates matched 'B 9888 LZ' with score 65. Selected top-left element <div>.

  await maestro.interact(page.getByText(new RegExp('B 9888 LZ', 'i')), 'click');

  console.log('__STEP_START__ 24');
  // Step 24: fill -> Nama Sopir

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik nama sopir...', 'i')),
    'fill',
    'MUHAMAD NUR'
  );

  console.log('__STEP_START__ 25');
  // Step 25: wait -> jeda sebelum pilih sopir

  await page.waitForTimeout(500);

  console.log('__STEP_START__ 26');
  // Step 26: click -> MUHAMAD NUR
  // [WARNING]: Ambiguous Element Detected: Multiple candidates matched 'MUHAMAD NUR' with score 40. Selected top-left element <div>.

  await maestro.interact(page.getByText(new RegExp('muhamad nur', 'i')), 'click');

  console.log('__STEP_START__ 27');
  // Step 27: fill -> No. Surat Jalan

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik no. surat jalan...', 'i')),
    'fill',
    '135622'
  );

  console.log('__STEP_START__ 28');
  // Step 28: fill -> Nomor DO

  await maestro.interact(
    page.getByPlaceholder(new RegExp('Ketik nomor DO...', 'i')),
    'fill',
    '242504'
  );

  console.log('__STEP_START__ 29');
  // Step 29: check -> Uang Jalan Dimuka

  await maestro.interact(page.locator('input[name="has_travel_allowance"]'), 'click');

  console.log('__STEP_START__ 30');
  // Step 30: click -> Simpan

  await maestro.interact(page.getByRole('button', { name: new RegExp('Simpan', 'i') }), 'click');

  console.log('__STEP_START__ 31');
  // Step 31: wait ->

  await page.waitForTimeout(500);

  console.log('__STEP_START__ 32');
  // Step 32: click -> Kirim

  await maestro.interact(page.getByRole('button', { name: new RegExp('Kirim', 'i') }), 'click');
});
