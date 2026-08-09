import { formatDate, formatInr } from '@settleflow/shared';

export interface EmailContent {
  html: string;
  subject: string;
  text: string;
}

interface EmailLayoutInput extends Omit<EmailContent, 'html'> {
  accentBackground: string;
  accentColor: string;
  badge: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  headline: string;
  preheader: string;
}

const brandBlue = '#1d4ed8';

export function escapeEmailHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function appLink(appOrigin: string, path: string): string {
  return new URL(path, appOrigin).toString();
}

function detailRows(rows: Array<{ label: string; value: string }>): string {
  return rows
    .map(
      ({ label, value }) => `
        <tr>
          <td style="padding:10px 12px;color:#64748b;font-size:13px;line-height:20px;border-bottom:1px solid #e2e8f0;">
            ${escapeEmailHtml(label)}
          </td>
          <td align="right" style="padding:10px 12px;color:#0f172a;font-size:14px;font-weight:700;line-height:20px;border-bottom:1px solid #e2e8f0;">
            ${escapeEmailHtml(value)}
          </td>
        </tr>`,
    )
    .join('');
}

function detailsCard(rows: Array<{ label: string; value: string }>): string {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;border-collapse:separate;overflow:hidden;">
      ${detailRows(rows)}
    </table>`;
}

function renderEmailLayout(input: EmailLayoutInput): EmailContent {
  const title = escapeEmailHtml(input.subject);
  const preheader = escapeEmailHtml(input.preheader);
  const ctaUrl = escapeEmailHtml(input.ctaUrl);

  return {
    subject: input.subject,
    text: input.text,
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${title}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .email-shell { width: 100% !important; }
        .email-body { padding: 28px 20px !important; }
        .email-header { padding: 22px 20px !important; }
        .email-footer { padding: 20px !important; }
        .email-cta { display: block !important; text-align: center !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;color:#0f172a;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f1f5f9;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" class="email-shell" width="600" cellspacing="0" cellpadding="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;border-collapse:separate;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.06);">
            <tr>
              <td class="email-header" style="padding:24px 32px;background:${brandBlue};">
                <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td width="44" height="44" align="center" valign="middle" style="width:44px;height:44px;background:#ffffff;border-radius:12px;color:${brandBlue};font-size:15px;font-weight:800;letter-spacing:-0.4px;">SF</td>
                    <td style="padding-left:13px;">
                      <div style="color:#ffffff;font-size:22px;font-weight:800;line-height:26px;letter-spacing:-0.5px;">SettleFlow</div>
                      <div style="margin-top:2px;color:#dbeafe;font-size:12px;line-height:17px;">Orders &amp; settlements</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="email-body" style="padding:36px 40px 40px;">
                <span style="display:inline-block;padding:6px 10px;background:${input.accentBackground};color:${input.accentColor};border-radius:999px;font-size:12px;font-weight:800;line-height:16px;letter-spacing:0.4px;text-transform:uppercase;">${escapeEmailHtml(input.badge)}</span>
                <h1 style="margin:18px 0 10px;color:#0f172a;font-size:28px;font-weight:800;line-height:35px;letter-spacing:-0.7px;">${escapeEmailHtml(input.headline)}</h1>
                ${input.bodyHtml}
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:28px;border-collapse:separate;">
                  <tr>
                    <td style="background:${brandBlue};border-radius:10px;">
                      <a class="email-cta" href="${ctaUrl}" style="display:inline-block;padding:13px 20px;color:#ffffff;font-size:15px;font-weight:750;line-height:20px;text-decoration:none;border-radius:10px;">${escapeEmailHtml(input.ctaLabel)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:19px;">If the button does not work, copy this link into your browser:<br><a href="${ctaUrl}" style="color:${brandBlue};word-break:break-all;">${ctaUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td class="email-footer" style="padding:22px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#64748b;font-size:12px;line-height:19px;">This transactional email was sent because this address owns a SettleFlow account.</p>
                <p style="margin:8px 0 0;color:#94a3b8;font-size:12px;line-height:18px;">&copy; ${new Date().getUTCFullYear()} SettleFlow</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

export function welcomeEmail(input: { appOrigin: string; displayName: string }): EmailContent {
  const firstName = input.displayName.trim().split(/\s+/)[0] || 'there';
  const ordersUrl = appLink(input.appOrigin, '/orders/new');
  const bodyHtml = `
    <p style="margin:0;color:#475569;font-size:16px;line-height:25px;">Hi ${escapeEmailHtml(firstName)}, your workspace is ready. SettleFlow keeps every order, partial payment and outstanding balance in one clear place.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:26px 0 0;border-collapse:collapse;">
      <tr>
        <td width="36" valign="top" style="padding:0 12px 16px 0;"><div style="width:30px;height:30px;background:#dbeafe;color:${brandBlue};border-radius:9px;text-align:center;font-size:14px;font-weight:800;line-height:30px;">1</div></td>
        <td valign="top" style="padding:2px 0 16px;color:#334155;font-size:14px;line-height:22px;"><strong style="color:#0f172a;">Create an order</strong><br>Add a customer once and reuse their profile later.</td>
      </tr>
      <tr>
        <td width="36" valign="top" style="padding:0 12px 16px 0;"><div style="width:30px;height:30px;background:#dcfce7;color:#166534;border-radius:9px;text-align:center;font-size:14px;font-weight:800;line-height:30px;">2</div></td>
        <td valign="top" style="padding:2px 0 16px;color:#334155;font-size:14px;line-height:22px;"><strong style="color:#0f172a;">Record settlements</strong><br>Track partial payments without allowing overpayment.</td>
      </tr>
      <tr>
        <td width="36" valign="top" style="padding:0 12px 0 0;"><div style="width:30px;height:30px;background:#fef3c7;color:#92400e;border-radius:9px;text-align:center;font-size:14px;font-weight:800;line-height:30px;">3</div></td>
        <td valign="top" style="padding:2px 0 0;color:#334155;font-size:14px;line-height:22px;"><strong style="color:#0f172a;">Stay in control</strong><br>Use activity history, overdue status and CSV exports.</td>
      </tr>
    </table>`;

  return renderEmailLayout({
    accentBackground: '#dbeafe',
    accentColor: '#1e40af',
    badge: 'Welcome',
    bodyHtml,
    ctaLabel: 'Create your first order',
    ctaUrl: ordersUrl,
    headline: 'You are ready to settle smarter.',
    preheader: 'Your SettleFlow workspace is ready.',
    subject: 'Welcome to SettleFlow',
    text: `Hi ${firstName},\n\nYour SettleFlow workspace is ready. Create your first order: ${ordersUrl}\n\nTrack orders, partial payments, balances, activity and exports in one place.`,
  });
}

export function paymentRecordedEmail(input: {
  amountMinor: number;
  appOrigin: string;
  orderId: string;
  orderNumber: string;
}): EmailContent {
  const amount = formatInr(input.amountMinor);
  const orderUrl = appLink(input.appOrigin, `/orders/${input.orderId}`);
  return renderEmailLayout({
    accentBackground: '#dcfce7',
    accentColor: '#166534',
    badge: 'Payment received',
    bodyHtml: `
      <p style="margin:0;color:#475569;font-size:16px;line-height:25px;">A new payment has been safely recorded in your workspace.</p>
      ${detailsCard([
        { label: 'Amount received', value: amount },
        { label: 'Order', value: input.orderNumber },
        { label: 'Status', value: 'Payment recorded' },
      ])}`,
    ctaLabel: 'View order',
    ctaUrl: orderUrl,
    headline: `${amount} payment recorded`,
    preheader: `${amount} was recorded for ${input.orderNumber}.`,
    subject: `Payment recorded for ${input.orderNumber}`,
    text: `A payment of ${amount} was recorded for ${input.orderNumber}.\n\nView order: ${orderUrl}`,
  });
}

export function exportReadyEmail(input: { appOrigin: string; fileName: string }): EmailContent {
  const exportsUrl = appLink(input.appOrigin, '/exports');
  return renderEmailLayout({
    accentBackground: '#dbeafe',
    accentColor: '#1e40af',
    badge: 'Export ready',
    bodyHtml: `
      <p style="margin:0;color:#475569;font-size:16px;line-height:25px;">Your order report has finished processing and is ready to download.</p>
      ${detailsCard([
        { label: 'File', value: input.fileName },
        { label: 'Format', value: 'CSV' },
        { label: 'Availability', value: '24 hours' },
      ])}`,
    ctaLabel: 'Download your export',
    ctaUrl: exportsUrl,
    headline: 'Your order export is ready.',
    preheader: `${input.fileName} is ready to download for 24 hours.`,
    subject: 'Your SettleFlow export is ready',
    text: `Your SettleFlow order export ${input.fileName} is ready for 24 hours.\n\nDownload it here: ${exportsUrl}`,
  });
}

export function orderOverdueEmail(input: {
  appOrigin: string;
  customer: string;
  dueDate: string;
  orderId: string;
  orderNumber: string;
}): EmailContent {
  const orderUrl = appLink(input.appOrigin, `/orders/${input.orderId}`);
  const dueDate = formatDate(input.dueDate);
  return renderEmailLayout({
    accentBackground: '#fef3c7',
    accentColor: '#92400e',
    badge: 'Action needed',
    bodyHtml: `
      <p style="margin:0;color:#475569;font-size:16px;line-height:25px;">This order has passed its due date and still has an outstanding balance.</p>
      ${detailsCard([
        { label: 'Order', value: input.orderNumber },
        { label: 'Customer', value: input.customer },
        { label: 'Due date', value: dueDate },
      ])}`,
    ctaLabel: 'Review settlement',
    ctaUrl: orderUrl,
    headline: `${input.orderNumber} is overdue.`,
    preheader: `${input.orderNumber} for ${input.customer} is overdue.`,
    subject: `${input.orderNumber} is overdue`,
    text: `${input.orderNumber} for ${input.customer} was due on ${dueDate} and still has an outstanding balance.\n\nReview settlement: ${orderUrl}`,
  });
}
