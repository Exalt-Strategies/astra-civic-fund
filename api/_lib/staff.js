// Staff emails: a "new gift" alert for each donation and the Monday roundup.
// Both go only to ALERT_EMAIL, which must be an @astracivic.org address (fail closed: these emails name donors).
const { money } = require('./receipt');
const { DESIGNATIONS } = require('./gift');

const TZ = 'America/New_York';
const STAFF_DOMAIN = 'astracivic.org';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const flat = s => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim();
const nyTime = d => d.toLocaleString('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }) + ' Eastern';
const nyDay = d => d.toLocaleDateString('en-US', { timeZone: TZ, month: 'long', day: 'numeric', year: 'numeric' });
const nyKey = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const label = k => (Object.prototype.hasOwnProperty.call(DESIGNATIONS, k) ? DESIGNATIONS[k] : DESIGNATIONS.needed);

/** ALERT_EMAIL if it is a single address at the staff domain, otherwise null. */
function alertRecipient(env) {
  const v = String((env && env.ALERT_EMAIL) || '').trim().toLowerCase();
  const re = new RegExp(`^[^\\s@<>(),;:"]+@${STAFF_DOMAIN.replace('.', '\\.')}$`);
  return re.test(v) ? v : null;
}

function layout(title, intro, rowsHtml, footer) {
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1c1c1a;max-width:560px">`
    + `<div style="background:#405742;color:#f7f7f7;padding:14px 18px;font:600 15px Georgia,serif">${esc(title)}</div>`
    + `<div style="padding:16px 18px;background:#f7f7f7">`
    + (intro ? `<p style="margin:0 0 12px">${intro}</p>` : '')
    + rowsHtml
    + `<p style="margin:16px 0 0;color:#7b7666;font-size:12.5px">${esc(footer)}</p></div></div>`;
}
const table = rows => `<table cellpadding="0" style="border-collapse:collapse;width:100%">`
  + rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#5a574d;border-bottom:1px solid #d6d4c4;white-space:nowrap">${esc(k)}</td>`
    + `<td style="padding:6px 0;border-bottom:1px solid #d6d4c4">${esc(v)}</td></tr>`).join('') + `</table>`;

/**
 * One donation. `d` is the receipt data (fromPaymentIntent / fromInvoice);
 * `kind` is 'once', 'monthly-new' (first payment of a new monthly gift) or 'monthly-renewal'.
 */
function renderGiftAlert(d, kind) {
  const amount = money(d.amountCents) + (d.monthly ? '/month' : '');
  const what = kind === 'monthly-new' ? 'New monthly donor' : kind === 'monthly-renewal' ? 'Monthly gift renewed' : 'New gift';
  const rows = [
    ['Donor', flat(d.donorName) || '(no name)'],
    ['Email', flat(d.email) || '(none)'],
    ['Amount', amount],
    ['Type', kind === 'once' ? 'One-time' : kind === 'monthly-new' ? 'Monthly, first payment' : 'Monthly, renewal'],
    ['Directed to', label(d.designation)],
  ];
  if (flat(d.dedication)) rows.push(['In honor or memory of', flat(d.dedication)]);
  if (d.feeCents) rows.push(['Fee covered by donor', money(d.feeCents)]);
  rows.push(['Payment method', flat(d.method)], ['Receipt', d.receiptNo], ['Received', nyTime(d.date)]);
  const footer = 'Sent to info@astracivic.org for every gift on astracivic.org/donate. Donor details are private: please do not forward.';
  const subject = `${what}: ${amount} from ${flat(d.donorName).slice(0, 60) || 'a donor'}`;
  const text = [what, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', footer].join('\n');
  return { subject, html: layout(what, '', table(rows), footer), text };
}

/** Builds the week's numbers from Stripe. Window is the 7 days ending at `now`. */
async function buildDigest(s, now) {
  const to = Math.floor(now.getTime() / 1000);
  const from = to - 7 * 24 * 3600;
  const created = { gt: from, lte: to };
  const gifts = [];

  for await (const pi of s.paymentIntents.list({ created, limit: 100 })) {
    const m = pi.metadata || {};
    if (pi.status !== 'succeeded' || m.kind !== 'once') continue;
    gifts.push({ name: m.name || '(no name)', cents: pi.amount_received, monthly: false, designation: m.designation || 'needed' });
  }
  let newMonthly = 0;
  for await (const inv of s.invoices.list({ created, status: 'paid', limit: 100 })) {
    if (!inv.amount_paid) continue;
    const md = (inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.metadata) || {};
    gifts.push({ name: inv.customer_name || md.name || '(no name)', cents: inv.amount_paid, monthly: true, designation: md.designation || 'needed' });
    if (inv.billing_reason === 'subscription_create') newMonthly++;
  }
  let refundCents = 0, refunds = 0;
  for await (const r of s.refunds.list({ created, limit: 100 })) {
    if (r.status === 'succeeded' || r.status === 'pending') { refundCents += r.amount; refunds++; }
  }
  let cancellations = 0;
  for await (const sub of s.subscriptions.list({ status: 'canceled', limit: 100 })) {
    if (sub.canceled_at && sub.canceled_at > from && sub.canceled_at <= to) cancellations++;
  }
  let failed = 0;
  for await (const inv of s.invoices.list({ created, status: 'open', limit: 100 })) {
    if (inv.attempted && inv.attempt_count > 0) failed++;
  }
  let activeMonthly = 0, monthlyRunCents = 0;
  for await (const sub of s.subscriptions.list({ status: 'active', limit: 100, expand: ['data.items'] })) {
    activeMonthly++;
    const it = sub.items && sub.items.data && sub.items.data[0];
    if (it && it.price && it.price.unit_amount) monthlyRunCents += it.price.unit_amount * (it.quantity || 1);
  }

  const giftCents = gifts.reduce((a, g) => a + g.cents, 0);
  const byDesig = {};
  gifts.forEach(g => { byDesig[g.designation] = (byDesig[g.designation] || 0) + g.cents; });
  return {
    from: new Date(from * 1000), to: now,
    giftCount: gifts.length, giftCents, oneTime: gifts.filter(g => !g.monthly).length, monthlyPayments: gifts.filter(g => g.monthly).length,
    newMonthly, cancellations, failed, refunds, refundCents, activeMonthly, monthlyRunCents,
    top: gifts.slice().sort((a, b) => b.cents - a.cents).slice(0, 5),
    byDesignation: Object.entries(byDesig).sort((a, b) => b[1] - a[1]).map(([k, c]) => [label(k), c]),
  };
}

function renderDigest(d) {
  const range = `${nyDay(d.from)} to ${nyDay(d.to)}`;
  const subject = `Astra weekly roundup: ${d.giftCount} ${d.giftCount === 1 ? 'gift' : 'gifts'}, ${money(d.giftCents)}`;
  const rows = [
    ['Gifts received', `${d.giftCount} totalling ${money(d.giftCents)}`],
    ['One-time gifts', String(d.oneTime)],
    ['Monthly payments', String(d.monthlyPayments)],
    ['New monthly donors', String(d.newMonthly)],
    ['Monthly gifts canceled', String(d.cancellations)],
    ['Failed monthly payments', String(d.failed)],
    ['Refunds', d.refunds ? `${d.refunds} totalling ${money(d.refundCents)}` : '0'],
    ['Active monthly donors', `${d.activeMonthly} (${money(d.monthlyRunCents)} a month)`],
  ];
  const top = d.top.map(g => [money(g.cents) + (g.monthly ? '/month' : ''), flat(g.name)]);
  const footer = 'Sent every Monday to info@astracivic.org. Full details are in the Stripe dashboard under Payments.';
  const html = layout('Astra weekly roundup', esc(range), table(rows)
    + (top.length ? `<p style="margin:16px 0 6px;font-weight:700">Largest gifts</p>${table(top)}` : `<p style="margin:16px 0 0;color:#5a574d">No gifts this week.</p>`)
    + (d.byDesignation.length ? `<p style="margin:16px 0 6px;font-weight:700">By area</p>${table(d.byDesignation.map(([k, c]) => [k, money(c)]))}` : ''),
  footer);
  const text = [`Astra weekly roundup, ${range}`, '', ...rows.map(([k, v]) => `${k}: ${v}`), '',
    top.length ? 'Largest gifts:' : 'No gifts this week.', ...top.map(([a, n]) => `  ${a}  ${n}`),
    ...(d.byDesignation.length ? ['', 'By area:', ...d.byDesignation.map(([k, c]) => `  ${k}: ${money(c)}`)] : []),
    '', footer].join('\n');
  return { subject, html, text };
}

module.exports = { alertRecipient, renderGiftAlert, buildDigest, renderDigest, nyKey };
