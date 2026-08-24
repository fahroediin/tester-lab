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
    
    // Exact match using normalize-space(.) prevents "Product Category" from swallowing "Product"
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

  // Step 4: Klik tombol Add New Application
  // [WARNING]: Low match score (0) for target: 'New Application'. Using fallback text locator.
  await page.locator('text="New Application"').click();

  // Step 5: wait ->
  await page.waitForTimeout(3000);

  // Step 6: select -> Application Type
  // [WARNING]: Low match score (0) for target: 'Applicant Type'. Using fallback text locator.
  await action('select', 'Applicant Type', 'NTB');

  // Step 7: fill -> CIF Number
  // [WARNING]: Low match score (0) for target: 'CIF Number'. Using fallback text locator.
  await action('fill', 'CIF Number', '321323');

  // Step 8: select -> Segment
  // [WARNING]: Low match score (0) for target: 'Segment'. Using fallback text locator.
  await action('select', 'Segment', 'Mikro');

  // Step 9: select -> Product Category
  // [WARNING]: Low match score (0) for target: 'Product Category'. Using fallback text locator.
  await action('select', 'Product Category', 'Collateral Loan');

  // Step 10: select -> Product
  // [WARNING]: Low match score (0) for target: 'Product'. Using fallback text locator.
  await action('select', 'Product', 'Kredit Agunan');

  // Step 11: fill -> Source Code
  // [WARNING]: Low match score (0) for target: 'Source Code'. Using fallback text locator.
  await action('fill', 'Source Code', '12345');

  // Step 12: fill -> Sales Code
  // [WARNING]: Low match score (0) for target: 'Sales Code'. Using fallback text locator.
  await action('fill', 'Sales Code', '12345');

  // Step 13: select -> Customer Type
  // [WARNING]: Low match score (0) for target: 'Customer Type'. Using fallback text locator.
  await action('select', 'Customer Type', 'Individu');

  // Step 14: select -> Insurance
  // [WARNING]: Low match score (0) for target: 'Insurance'. Using fallback text locator.
  await action('select', 'Insurance', 'Al-Amin');

  // Step 15: fill -> Referal Code
  // [WARNING]: Low match score (0) for target: 'Referal Code'. Using fallback text locator.
  await action('fill', 'Referal Code', '12345');

  // Step 16: fill -> Marketing Code
  // [WARNING]: Low match score (0) for target: 'Marketing Code'. Using fallback text locator.
  await action('fill', 'Marketing Code', '12345');

  // Step 17: select -> Loan Purpose
  // [WARNING]: Low match score (0) for target: 'Loan Purpose'. Using fallback text locator.
  await action('select', 'Loan Purpose', 'Konsumsi');

  // Step 18: select -> Tenor Proposed
  // [WARNING]: Low match score (0) for target: 'Tenor Proposed'. Using fallback text locator.
  await action('select', 'Tenor Proposed', '36');

  // Step 19: fill -> Request Limit
  // [WARNING]: Low match score (0) for target: 'Requested Limit'. Using fallback text locator.
  await action('fill', 'Requested Limit', '20000000');

  // Step 20: click -> Next
  await page.getByRole('button', { name: 'go to next page' }).first().click();

  // Step 21: wait ->
  await page.waitForTimeout(3000);

  // Step 22: fill -> Full Name
  await page.getByPlaceholder('Search Loan Id or Full Name').fill('Thomas Shelby');

  // Step 23: select -> Gender
  // [WARNING]: Low match score (0) for target: 'Gender'. Using fallback text locator.
  await action('select', 'Gender', 'Laki-Laki');

  // Step 24: fill -> Place of Birth
  // [WARNING]: Low match score (0) for target: 'Place of Birth'. Using fallback text locator.
  await action('fill', 'Place of Birth', 'New Jersey');

  // Step 25: fill -> Date of Birth
  // [WARNING]: Low match score (0) for target: 'Date of Birth'. Using fallback text locator.
  await action('fill', 'Date of Birth', '1990-05-01');

  // Step 26: fill -> Full Name ID
  // [WARNING]: Low match score (0) for target: 'Full Name ID'. Using fallback text locator.
  await action('fill', 'Full Name ID', 'Jhon Shelby');

  // Step 27: select -> ID Type
  // [WARNING]: Low match score (0) for target: 'ID Type'. Using fallback text locator.
  await action('select', 'ID Type', 'KTP');

  // Step 28: fill -> ID Card Number
  // [WARNING]: Low match score (0) for target: 'ID Card Number'. Using fallback text locator.
  await action('fill', 'ID Card Number', '33011140501960000');

  // Step 29: fill -> Mothers Maiden Name
  // [WARNING]: Low match score (0) for target: 'Mothers Maiden Name'. Using fallback text locator.
  await action('fill', 'Mothers Maiden Name', 'Clara Shelby');

  // Step 30: click -> Save As Draft
  // [WARNING]: Low match score (0) for target: 'Save As Draft'. Using fallback text locator.
  await page.locator('text="Save As Draft"').click();

  // Step 31: wait ->
  await page.waitForTimeout(10000);
});
