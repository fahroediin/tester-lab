const { test, expect } = require('@playwright/test');

test('OSAcademy Login Test', async ({ page }) => {
  await page.goto('https://osacademy.net/AppCatalog/Login');
  await page.waitForLoadState('networkidle');

  // Step 1: Isi kolom username
  await page.getByPlaceholder('Username').fill('user@example.com');

  // Step 2: Isi kolom password
  await page.getByPlaceholder('Password').fill('DummyPassword123!');

  // Step 3: Klik tombol login
  await page.getByRole('button', { name: 'Login' }).first().click();

  // Step 4: Verifikasi URL beralih ke AppCatalog
  await expect(page).toHaveURL(new RegExp('https://osacademy.net/AppCatalog'));
});
