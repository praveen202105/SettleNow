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

const fakeRazorpayCheckout = String.raw`
(() => {
  async function hmac(secret, value) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
    return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  class FakeRazorpay {
    constructor(options) {
      this.options = options;
      this.handlers = {};
    }
    on(event, handler) {
      this.handlers[event] = handler;
    }
    async open() {
      const orderId = this.options.order_id;
      const suffix = orderId.replace(/^order_test_/, '');
      if (window.__settleflowRazorpayOutcome === 'failure') {
        const paymentId = 'pay_test_failed_' + suffix;
        const rawBody = JSON.stringify({
          event: 'payment.failed',
          payload: { payment: { entity: {
            amount: this.options.amount,
            currency: 'INR',
            id: paymentId,
            method: 'upi',
            order_id: orderId,
            status: 'failed'
          } } }
        });
        const signature = await hmac('test_webhook_secret', rawBody);
        await fetch('/api/v1/webhooks/razorpay', {
          body: rawBody,
          headers: {
            'content-type': 'application/json',
            'x-razorpay-event-id': 'event_test_failed_' + suffix,
            'x-razorpay-signature': signature
          },
          method: 'POST'
        });
        this.handlers['payment.failed']?.({ error: { description: 'Simulated failure' } });
        return;
      }
      const paymentId = 'pay_test_' + this.options.amount + '_' + suffix;
      const signature = await hmac('test_checkout_secret', orderId + '|' + paymentId);
      this.options.handler({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      });
    }
  }
  window.Razorpay = FakeRazorpay;
})();
`;

async function installFakeRazorpay(page: Page) {
  await page.route('https://checkout.razorpay.com/v1/checkout.js', (route) =>
    route.fulfill({ body: fakeRazorpayCheckout, contentType: 'application/javascript' }),
  );
}

test('creates and settles a ₹1,000 order without allowing overpayment', async ({ page }) => {
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

  await page.getByRole('button', { name: 'Record offline payment' }).first().click();
  await page.getByLabel('Amount').fill('400.00');
  await page.getByLabel('Note').fill('Deposit');
  await page.getByRole('button', { name: 'Record offline payment' }).last().click();
  await expect(page.getByText('Partially Paid')).toBeVisible();
  await expect(page.getByLabel('Order totals').getByText('₹600.00', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Record offline payment' }).first().click();
  await page.getByLabel('Amount').fill('600.00');
  await page.getByRole('button', { name: 'Record offline payment' }).last().click();
  await expect(page.getByText('Paid', { exact: true })).toBeVisible();
  await expect(page.getByText('This order is fully paid.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Payment recorded/).first()).toBeVisible();

  const overpayment = await page.evaluate(async (id) => {
    const response = await fetch(`/api/v1/orders/${id}/payments`, {
      body: JSON.stringify({ amountMinor: 100, date: '2026-08-08', note: 'Should fail' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    return { body: await response.json(), status: response.status };
  }, orderId);
  expect(overpayment).toMatchObject({
    status: 409,
    body: { error: { code: 'PAYMENT_EXCEEDS_BALANCE', maxAllowedMinor: 0 } },
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

test('shares a public link and completes failed, partial and full Razorpay test checkouts', async ({
  browser,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/signup');
  await page.getByLabel('Full Name').fill('Online Owner');
  await page.getByLabel('Email').fill(`online-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('SecurePass123!');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible();

  const orderId = await page.evaluate(async () => {
    const customerResponse = await fetch('/api/v1/customers', {
      body: JSON.stringify({ mobile: '+919811112222', name: 'Northstar Payments' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!customerResponse.ok) {
      throw new Error(`Customer creation failed: ${await customerResponse.text()}`);
    }
    const customer = (await customerResponse.json()) as { data: { id: string } };
    const orderResponse = await fetch('/api/v1/orders', {
      body: JSON.stringify({
        customerId: customer.data.id,
        dueDate: '2099-12-31',
        lineItems: [{ description: 'Online settlement', quantity: 1, unitPriceMinor: 100_000 }],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!orderResponse.ok) {
      throw new Error(`Order creation failed: ${await orderResponse.text()}`);
    }
    const order = (await orderResponse.json()) as { data: { id: string } };
    return order.data.id;
  });
  await page.goto(`/orders/${orderId}`);
  await page.getByRole('button', { name: /Payment link/ }).click();
  await page.getByRole('button', { name: 'Create payment link' }).click();
  const paymentLink = await page.getByLabel('Generated payment link').inputValue();
  expect(paymentLink).toMatch(/\/pay\/[A-Za-z0-9_-]+$/);
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
  const whatsappHref = await page
    .getByRole('link', { name: 'Share on WhatsApp' })
    .getAttribute('href');
  expect(whatsappHref).toContain('wa.me/919811112222');
  expect(whatsappHref).toContain(encodeURIComponent(paymentLink));

  const customerContext = await browser.newContext({ viewport: { width: 320, height: 800 } });
  const customerPage = await customerContext.newPage();
  await installFakeRazorpay(customerPage);
  await customerPage.goto(paymentLink);
  await expect(customerPage).toHaveURL(/\/pay\/session\/[a-f0-9-]+$/);
  await expect(customerPage.getByText('For N•••••')).toBeVisible();
  await expect(customerPage.getByText('+919811112222')).toHaveCount(0);
  await expect(customerPage.getByText(/no real money will be charged/i)).toBeVisible();
  await expectNoHorizontalOverflow(customerPage);

  await customerPage.evaluate(() => {
    (window as Window & { __settleflowRazorpayOutcome?: string }).__settleflowRazorpayOutcome =
      'failure';
  });
  await customerPage.getByLabel('Amount to pay').fill('400.00');
  await customerPage.getByRole('button', { name: 'Pay securely in test mode' }).click();
  await expect(customerPage.getByText(/test payment failed/i)).toBeVisible({ timeout: 15_000 });

  await customerPage.evaluate(() => {
    (window as Window & { __settleflowRazorpayOutcome?: string }).__settleflowRazorpayOutcome =
      'success';
  });
  await customerPage.getByRole('button', { name: 'Pay securely in test mode' }).click();
  await expect(customerPage.getByText(/₹400.00 test payment was recorded/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(customerPage.getByText('₹600.00', { exact: true })).toBeVisible();

  await customerPage.getByLabel('Amount to pay').fill('600.00');
  await customerPage.getByRole('button', { name: 'Pay securely in test mode' }).click();
  await expect(customerPage.getByRole('heading', { name: 'Payment complete' })).toBeVisible({
    timeout: 15_000,
  });
  await expectNoHorizontalOverflow(customerPage);
  await customerContext.close();

  await page.reload();
  await expect(page.getByText('Paid', { exact: true })).toBeVisible();
  await expect(page.locator('table').getByText('Razorpay test', { exact: true })).toHaveCount(2);
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
