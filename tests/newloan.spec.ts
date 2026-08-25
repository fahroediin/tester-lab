import { test, expect } from '@playwright/test';

test('Standard Web Login Verification', async ({ page }) => {
  // Set viewport if configured

  // Navigate to target URL
  await page.goto('https://dev.osacademy.net/LOSHome/EntryDataCustomer');
  await page.waitForLoadState('networkidle');

  // Helper function for dynamic form locators (OutSystems/Complex UI)
  async function action(type: 'select' | 'fill', label: string, value: string) {
    const tag = type === 'select' ? 'select' : 'input';
    const escapedLabel = label.replace(/'/g, "\\'");
    const xpath = `xpath=(//*[normalize-space(.)='${escapedLabel}' or normalize-space(.)='${escapedLabel} *' or normalize-space(.)='${escapedLabel}*'])[1]/following::${tag}[1]`;

    const target = page.locator(xpath);
    await target.waitFor({ state: 'attached', timeout: 15000 });

    if (type === 'select') {
      await target.selectOption(value, { force: true });
    } else {
      await target.fill(value, { force: true });
    }
  }

  // Step 1: Isi kolom username
  await page.getByLabel('Username', { exact: true }).fill('LOS_ADMIN');

  // Step 2: Isi kolom password
  await page.getByLabel('Password', { exact: true }).fill('P@ssword123');

  // Step 3: click -> Login
  await page.getByRole('button', { name: 'Login' }).first().click();

  // Step 4: [WARNING]: Low match score (0) for target: 'New Application'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'text="New Application"'. Using fallback text locator.
  await page.getByRole('button', { name: 'New Application' }).first().click();

  // Step 5: wait ->
  await page.waitForTimeout(3000);

  // Step 6: [WARNING]: Low match score (0) for target: 'Applicant Type'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Applicant Type'. Using fallback text locator.
  await action('select', 'Applicant Type', 'NTB');

  // Step 7: [WARNING]: Low match score (0) for target: 'CIF Number'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'CIF Number'. Using fallback text locator.
  await action('fill', 'CIF Number', '123');

  // Step 8: [WARNING]: Low match score (0) for target: 'Segment'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Segment'. Using fallback text locator.
  await action('select', 'Segment', 'Mikro');

  // Step 9: [WARNING]: Low match score (0) for target: 'Product Category'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Product Category'. Using fallback text locator.
  await action('select', 'Product Category', 'Collateral Loan');

  // Step 10: [WARNING]: Low match score (0) for target: 'Product'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Product'. Using fallback text locator.
  await action('select', 'Product', 'Kredit Agunan');

  // Step 11: [WARNING]: Low match score (0) for target: 'Source Code'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Source Code'. Using fallback text locator.
  await action('fill', 'Source Code', '12345');

  // Step 12: [WARNING]: Low match score (0) for target: 'Sales Code'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Sales Code'. Using fallback text locator.
  await action('fill', 'Sales Code', '12345');

  // Step 13: [WARNING]: Low match score (0) for target: 'Customer Type'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Customer Type'. Using fallback text locator.
  await action('select', 'Customer Type', 'Individu');

  // Step 14: [WARNING]: Low match score (0) for target: 'Insurance'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Insurance'. Using fallback text locator.
  await action('select', 'Insurance', 'Al-Amin');

  // Step 15: [WARNING]: Low match score (0) for target: 'Referal Code'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Referal Code'. Using fallback text locator.
  await action('fill', 'Referal Code', '123');

  // Step 16: [WARNING]: Low match score (0) for target: 'Marketing Code'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Marketing Code'. Using fallback text locator.
  await action('fill', 'Marketing Code', '456');

  // Step 17: [WARNING]: Low match score (0) for target: 'Loan Purpose'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Loan Purpose'. Using fallback text locator.
  await action('select', 'Loan Purpose', 'Konsumsi');

  // Step 18: [WARNING]: Low match score (0) for target: 'Tenor Proposed'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Tenor Proposed'. Using fallback text locator.
  await action('select', 'Tenor Proposed', '36');

  // Step 19: fill -> Requested Limit
  // [WARNING]: Low match score (0) for target: 'Requested Limit'. Using fallback text locator.
  await action('fill', 'Requested Limit', '20000000');

  // Step 20: Menyesuaikan dengan teks tombol asli di screenshot
  await page.getByRole('button', { name: 'Next' }).first().click();

  // Step 21: wait ->
  await page.waitForTimeout(6000);

  // Step 22: fill -> Full Name
  await page.getByPlaceholder('Search Loan Id or Full Name').fill('Thomas Shelby');

  // Step 23: [WARNING]: Low match score (0) for target: 'Gender'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Gender'. Using fallback text locator.
  await action('select', 'Gender', 'Laki-Laki');

  // Step 24: [WARNING]: Low match score (0) for target: 'Place of Birth'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Place of Birth'. Using fallback text locator.
  await action('fill', 'Place of Birth', 'New Jersey');

  // Step 25: [WARNING]: Low match score (0) for target: 'Date of Birth'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Date of Birth'. Using fallback text locator.
  await action('fill', 'Date of Birth', '1990-05-01');

  // Step 26: [WARNING]: Low match score (0) for target: 'Full Name ID'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Full Name ID'. Using fallback text locator.
  await action('fill', 'Full Name ID', 'Thomas Shelby');

  // Step 27: [WARNING]: Low match score (0) for target: 'ID Type'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'ID Type'. Using fallback text locator.
  await action('select', 'ID Type', 'KTP');

  // Step 28: [WARNING]: Low match score (0) for target: 'ID Card Number'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'ID Card Number'. Using fallback text locator.
  await action('fill', 'ID Card Number', '33011140501960000');

  // Step 29: [WARNING]: Low match score (0) for target: 'Mothers Maiden Name'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Mothers Maiden Name'. Using fallback text locator.
  await action('fill', 'Mothers Maiden Name', 'Clara Shelby');

  // Step 30: [WARNING]: Low match score (0) for target: 'Save As Draft'. Using fallback text locator.
  // [WARNING]: Low match score (0) for target: 'Save As Draft'. Using fallback text locator.
  await page.locator('text="Save As Draft"').click();

  // Step 31: wait ->
  await page.waitForTimeout(10000);
});
