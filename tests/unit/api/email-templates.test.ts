import { describe, expect, it } from 'vitest';

import {
  escapeEmailHtml,
  exportReadyEmail,
  orderOverdueEmail,
  paymentRecordedEmail,
  welcomeEmail,
} from '../../../apps/api/src/emails/templates.js';

const appOrigin = 'https://settleflow.example.com';

describe('transactional email templates', () => {
  it('escapes user-controlled values before rendering HTML', () => {
    expect(escapeEmailHtml(`<script>alert("x")</script> & O'Reilly`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; O&#039;Reilly',
    );

    const email = welcomeEmail({
      appOrigin,
      displayName: '<img src=x onerror=alert(1)> User',
    });
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).toContain('&lt;img');
  });

  it('renders a responsive branded welcome email with a text fallback', () => {
    const email = welcomeEmail({ appOrigin, displayName: 'Praveen Gupta' });

    expect(email.subject).toBe('Welcome to SettleFlow');
    expect(email.html).toContain('SettleFlow');
    expect(email.html).toContain('Create your first order');
    expect(email.html).toContain('https://settleflow.example.com/orders/new');
    expect(email.html).toContain('@media only screen and (max-width: 620px)');
    expect(email.text).toContain('Hi Praveen');
  });

  it('renders payment, export and overdue templates with actionable details', () => {
    const payment = paymentRecordedEmail({
      amountMinor: 40_000,
      appOrigin,
      orderId: 'order-1',
      orderNumber: 'ORD-1001',
    });
    expect(payment.subject).toBe('Payment recorded for ORD-1001');
    expect(payment.html).toContain('₹400.00');
    expect(payment.html).toContain('https://settleflow.example.com/orders/order-1');

    const exportEmail = exportReadyEmail({
      appOrigin,
      fileName: 'settleflow-orders.csv',
    });
    expect(exportEmail.html).toContain('settleflow-orders.csv');
    expect(exportEmail.html).toContain('24 hours');
    expect(exportEmail.text).toContain('https://settleflow.example.com/exports');

    const overdue = orderOverdueEmail({
      appOrigin,
      customer: 'Acme & Sons',
      dueDate: '2026-08-08',
      orderId: 'order-2',
      orderNumber: 'ORD-1002',
    });
    expect(overdue.subject).toBe('ORD-1002 is overdue');
    expect(overdue.html).toContain('Acme &amp; Sons');
    expect(overdue.html).toContain('Aug 08, 2026');
  });
});
