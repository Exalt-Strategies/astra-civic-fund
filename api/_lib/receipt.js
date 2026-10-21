const fs = require('fs');
const path = require('path');
const { DESIGNATIONS } = require('./gift');

const TEMPLATE = fs.readFileSync(path.join(__dirname, '..', '..', 'emails', 'receipt.html'), 'utf8');
const TZ = 'America/New_York';

const money = c => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = d => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ });
const monthYear = d => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: TZ });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const flat = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

function receiptNo(id, createdSec) {
  const year = new Date(createdSec * 1000).getUTCFullYear();
  return `AST-${year}-${String(id).replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase()}`;
}

function fill(tpl, vars) {
  return tpl
    .replace(/<!--IF (\w+)-->([\s\S]*?)<!--END \1-->/g, (_, k, body) => (vars[k] ? body : ''))
    .replace(/\{\{(\w+)\}\}/g, (_, k) => esc(vars[k] == null ? '' : vars[k]));
}

function renderReceipt(d) {
  const amount = money(d.amountCents);
  const kind = d.monthly ? 'monthly gift' : 'gift';
  const donorName = String(d.donorName || '').trim();
  // The monthly block needs both a next date and a manage link; without them it is omitted.
  const showMonthly = Boolean(d.monthly && d.nextDate && d.manageUrl);
  const vars = {
    subject: d.monthly
      ? `Your ${monthYear(d.date)} receipt from Astra Civic Fund`
      : 'Your receipt from Astra Civic Fund',
    preheader: `Thank you for your ${kind} of ${amount}. Your receipt is inside.`,
    first_name: donorName.split(/\s+/)[0] || 'friend',
    donor_name: donorName || 'Friend',
    intro: `We received your ${kind} of ${amount} on ${day(d.date)}. This email is your receipt.`,
    receipt_no: d.receiptNo,
    date: day(d.date),
    gift_type: d.monthly ? 'Monthly' : 'One-time',
    designation: Object.prototype.hasOwnProperty.call(DESIGNATIONS, d.designation) ? DESIGNATIONS[d.designation] : DESIGNATIONS.needed,
    dedication: d.dedication || '',
    method: d.method,
    amount,
    fee: d.feeCents ? money(d.feeCents) : '',
    monthly: showMonthly ? '1' : '',
    next_date: d.nextDate ? day(d.nextDate) : '',
    manage_url: d.manageUrl || '',
    logo_url: d.logoUrl,
  };

  const text = [
    `Thank you, ${vars.first_name}.`,
    '',
    vars.intro,
    '',
    `Receipt number: ${vars.receipt_no}`,
    `Date received: ${vars.date}`,
    `Donor: ${flat(vars.donor_name)}`,
    `Type of gift: ${vars.gift_type}`,
    `Directed to: ${vars.designation}`,
    flat(vars.dedication) ? `In honor or memory of: ${flat(vars.dedication)}` : null,
    `Payment method: ${flat(vars.method)}`,
    `Amount received: ${amount}${vars.fee ? ` (includes ${vars.fee} you added to cover processing fees)` : ''}`,
    '',
    'Astra Civic Fund is a 501(c)(4) social welfare organization. Contributions to Astra Civic Fund are not tax-deductible as charitable contributions for federal income tax purposes. No goods or services were provided in exchange for this contribution.',
    showMonthly ? `\nYour next gift of ${amount} is scheduled for ${vars.next_date}. Manage your monthly gift: ${vars.manage_url}` : null,
    '',
    'Questions? Reply to this email or write to info@astracivic.org.',
    'Astra Civic Fund · astracivic.org',
  ].filter(l => l !== null).join('\n');

  return { subject: vars.subject, html: fill(TEMPLATE, vars), text };
}

const PROD_BASE = 'https://astracivic.org';
function emailAssetBase(env) {
  const base = String((env && (env.EMAIL_ASSET_URL || env.SITE_URL)) || '').replace(/\/+$/, '');
  if (!base || /^http:\/\/(localhost|127\.)/i.test(base)) return PROD_BASE;
  return base;
}
const emailLogoUrl = env => `${emailAssetBase(env)}/brand/astra-wordmark-white.png`;

module.exports = { receiptNo, money, renderReceipt, emailAssetBase, emailLogoUrl };
