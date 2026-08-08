import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    overflow: Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((element) => ({
        className: element.className,
        right: Math.round(element.getBoundingClientRect().right),
        tag: element.tagName,
      }))
      .filter((element) => element.right > window.innerWidth + 1)
      .slice(0, 5),
    viewport: window.innerWidth,
  }));
  expect(widths.body, JSON.stringify(widths.overflow)).toBeLessThanOrEqual(widths.viewport);
  expect(widths.document, JSON.stringify(widths.overflow)).toBeLessThanOrEqual(widths.viewport);
}

test('creates and settles a $1,000 order without allowing overpayment', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Full Name').fill('E2E Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('SecurePass123!');
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page
    .getByRole('link', { name: /New Order/ })
    .first()
    .click();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole('combobox', { name: 'Customer' }).click();
  await page.getByRole('button', { name: 'Add new customer' }).click();
  await page.getByLabel('Customer name').fill('Northstar Labs');
  await page.getByLabel('Mobile number').fill('+91 98765-43210');
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Add customer' }).click();
  await expect(page.getByRole('combobox', { name: 'Customer' })).toContainText('Northstar Labs');
  await page.setViewportSize({ width: 768, height: 900 });
  await expectNoHorizontalOverflow(page);
  await page.getByLabel('Due date').fill('2099-12-31');
  await page.getByLabel('Description').fill('Annual subscription');
  await page.getByLabel('Quantity').fill('1');
  await page.getByLabel('Unit price').fill('1000.00');
  await page.getByRole('button', { name: 'Create order' }).click();

  await expect(page.getByRole('heading', { name: /ORD-/ })).toBeVisible();
  const orderId = new URL(page.url()).pathname.split('/').at(-1);
  expect(orderId).toBeTruthy();
  await expect(page.getByText('+919876543210', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'New Order' }).click();
  await page.getByRole('combobox', { name: 'Customer' }).click();
  await page.getByRole('option', { name: /Northstar Labs/ }).click();
  await expect(page.getByRole('combobox', { name: 'Customer' })).toContainText('+919876543210');
  await page.getByLabel('Due date').fill('2099-12-31');
  await page.getByLabel('Description').fill('Follow-up service');
  await page.getByLabel('Quantity').fill('1');
  await page.getByLabel('Unit price').fill('100.00');
  await page.getByRole('button', { name: 'Create order' }).click();
  await expect(page.getByRole('heading', { name: /ORD-/ })).toBeVisible();
  await page.goto(`/orders/${orderId}`);

  await page.getByRole('button', { name: 'Record payment' }).first().click();
  await page.getByLabel('Amount').fill('400.00');
  await page.getByLabel('Note').fill('Deposit');
  await page.getByRole('button', { name: 'Record payment' }).last().click();
  await expect(page.getByText('Partially Paid')).toBeVisible();
  await expect(page.getByLabel('Order totals').getByText('$600.00', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Record payment' }).first().click();
  await page.getByLabel('Amount').fill('600.00');
  await page.getByRole('button', { name: 'Record payment' }).last().click();
  await expect(page.getByText('Paid', { exact: true })).toBeVisible();
  await expect(page.getByText('This order is fully paid.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Payment recorded/).first()).toBeVisible();

  const overpayment = await page.evaluate(async (id) => {
    const response = await fetch(`/api/v1/orders/${id}/payments`, {
      body: JSON.stringify({ amountCents: 100, date: '2026-08-08', note: 'Should fail' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    return { body: await response.json(), status: response.status };
  }, orderId);
  expect(overpayment).toMatchObject({
    status: 409,
    body: { error: { code: 'PAYMENT_EXCEEDS_BALANCE', maxAllowedCents: 0 } },
  });
  await expect(page.getByRole('button', { name: 'Delete' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect(page).toHaveURL(/\/exports$/);
  await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 15_000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/settleflow-orders-.*\.csv/);

  await page.getByRole('link', { name: 'Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible();
  await expect(page.getByText(/Export completed/).first()).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await expectNoHorizontalOverflow(page);
});

test('mobile navigation is keyboard and touch accessible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/signup');
  await page.getByLabel('Full Name').fill('Mobile Tester');
  await page.getByLabel('Email').fill(`mobile-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('SecurePass123!');
  await page.getByRole('button', { name: 'Create Account' }).click();

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeHidden();

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'New Order' }).click();
  await expect(page).toHaveURL(/\/orders\/new$/);
  await expect(page.getByRole('heading', { name: 'New order' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('authentication fields render cleanly at the minimum supported width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/signup');

  const name = page.getByRole('textbox', { name: 'Full name' });
  const email = page.getByRole('textbox', { name: 'Email address' });
  await expect(name).toBeVisible();
  await expect(email).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const icons = page.locator('form svg');
  await expect(icons.first()).toBeVisible();
  const iconBox = await icons.first().boundingBox();
  expect(iconBox?.width).toBeGreaterThanOrEqual(16);
  expect(iconBox?.width).toBeLessThanOrEqual(20);
});

test('signs in through the complete Google OAuth redirect flow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with Google' }).click();

  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Security' }).click();
  await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible();
  await expect(page.getByText('Google', { exact: true })).toBeVisible();
  await expect(page.getByText(/Google is your only sign-in method/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disconnect' })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
});
