const test = require('node:test');
const assert = require('node:assert/strict');
const { fakeReq, fakeRes } = require('./helpers');
const webhook = require('../api/stripe-webhook');
const digestRoute = require('../api/weekly-digest');
const { alertRecipient, renderGiftAlert, buildDigest, renderDigest } = require('../api/_lib/staff');

const baseEnv = { STRIPE_WEBHOOK_SECRET: 'whsec_1', SITE_URL: 'https://astra.example', MANAGE_SECRET: 'm', ALERT_EMAIL: 'info@astracivic.org' };
const pi = {
  id: 'pi_3Qabcdefgh12345678', created: 1791590400, amount_received: 2500,
  metadata: { kind: 'once', designation: 'campus', dedication: 'Amma', fee_cents: '0', name: 'Priya Venkatesh', email: 'priya@example.org' },
  payment_method: { type: 'card', card: { display_brand: 'visa', last4: '4242' } },
};
const inv = {
  id: 'in_1Qzzzzzzzzabcdefgh', created: 1791590400, amount_paid: 1000, metadata: {}, billing_reason: 'subscription_create',
  customer_email: 'priya@example.org', customer_name: 'Priya Venkatesh',
  parent: { subscription_details: { subscription: 'sub_1', metadata: { kind: 'monthly', designation: 'needed', fee_cents: '0' } } },
};
const sub = { id: 'sub_1', customer: 'cus_1', metadata: { kind: 'monthly' }, default_payment_method: null, items: { data: [{ current_period_end: 1794268800 }] } };

function setup(event, objs, env = baseEnv, sendEmail) {
  const log = { sent: [], updates: [] };
  const stripe = {
    webhooks: { constructEvent: () => event },
    paymentIntents: { retrieve: async () => objs.pi, update: async (id, p) => log.updates.push(['pi', id, p]) },
    invoices: { retrieve: async () => objs.inv, update: async (id, p) => log.updates.push(['in', id, p]) },
    subscriptions: { retrieve: async () => objs.sub },
  };
  const h = webhook.make({ stripe: () => stripe, sendEmail: sendEmail || (async m => { log.sent.push(m); return { id: 'em' }; }), env });
  return { h, log };
}
const call = async h => { const res = fakeRes(); await h(fakeReq({ body: '{}', headers: { 'stripe-signature': 'good' } }), res); return res; };
const piEvent = { type: 'payment_intent.succeeded', created: 1791590400, data: { object: { id: pi.id } } };
const invEvent = { type: 'invoice.paid', created: 1791590400, data: { object: { id: inv.id } } };

test('alertRecipient only accepts a single @astracivic.org address', () => {
  assert.equal(alertRecipient({ ALERT_EMAIL: ' Info@AstraCivic.org ' }), 'info@astracivic.org');
  for (const v of ['', 'me@gmail.com', 'info@astracivic.org.evil.com', 'a@astracivic.org,b@x.com', 'info@sub.astracivic.org']) {
    assert.equal(alertRecipient({ ALERT_EMAIL: v }), null, v);
  }
  assert.equal(alertRecipient({}), null);
});

test('one-time gift: donor receipt, then one staff alert, both marked', async () => {
  const { h, log } = setup(piEvent, { pi });
  const res = await call(h);
  assert.equal(res.statusCode, 200);
  assert.equal(log.sent.length, 2);
  assert.equal(log.sent[0].to, 'priya@example.org');
  assert.equal(log.sent[1].to, 'info@astracivic.org');
  assert.equal(log.sent[1].idempotencyKey, 'gift-alert-pi_3Qabcdefgh12345678');
  assert.equal(log.sent[1].subject, 'New gift: $25.00 from Priya Venkatesh');
  assert.match(log.sent[1].text, /Directed to: Campus networks/);
  assert.match(log.sent[1].text, /In honor or memory of: Amma/);
  assert.deepEqual(log.updates, [['pi', pi.id, { metadata: { receipt_sent: '1' } }], ['pi', pi.id, { metadata: { alert_sent: '1' } }]]);
});

test('a retry after a failed alert sends only the alert, never a second receipt', async () => {
  const retried = { ...pi, metadata: { ...pi.metadata, receipt_sent: '1' } };
  const { h, log } = setup(piEvent, { pi: retried });
  await call(h);
  assert.equal(log.sent.length, 1);
  assert.equal(log.sent[0].to, 'info@astracivic.org');
});

test('nothing is sent once both receipt and alert are marked', async () => {
  const done = { ...pi, metadata: { ...pi.metadata, receipt_sent: '1', alert_sent: '1' } };
  const { h, log } = setup(piEvent, { pi: done });
  await call(h);
  assert.equal(log.sent.length, 0);
});

test('alert failure returns 500 so Stripe retries, with the receipt already marked', async () => {
  const sent = [], updates = [];
  const stripe = {
    webhooks: { constructEvent: () => piEvent },
    paymentIntents: { retrieve: async () => pi, update: async (id, p) => updates.push(p) },
  };
  const h = webhook.make({ stripe: () => stripe, env: baseEnv, sendEmail: async m => { if (m.to === 'info@astracivic.org') throw new Error('Resend 503'); sent.push(m); return {}; } });
  const orig = console.error; console.error = () => {};
  try { assert.equal((await call(h)).statusCode, 500); } finally { console.error = orig; }
  assert.equal(sent.length, 1);
  assert.deepEqual(updates, [{ metadata: { receipt_sent: '1' } }]);
});

test('no alert when ALERT_EMAIL is missing or outside astracivic.org', async () => {
  for (const ALERT_EMAIL of [undefined, 'someone@gmail.com']) {
    const { h, log } = setup(piEvent, { pi }, { ...baseEnv, ALERT_EMAIL });
    const orig = console.error; console.error = () => {};
    try { await call(h); } finally { console.error = orig; }
    assert.equal(log.sent.length, 1);
    assert.equal(log.sent[0].to, 'priya@example.org');
  }
});

test('first monthly payment alerts as a new monthly donor; renewals say renewed', async () => {
  const a = setup(invEvent, { inv, sub });
  await call(a.h);
  assert.equal(a.log.sent.length, 2);
  assert.equal(a.log.sent[1].subject, 'New monthly donor: $10.00/month from Priya Venkatesh');
  const b = setup(invEvent, { inv: { ...inv, billing_reason: 'subscription_cycle' }, sub });
  await call(b.h);
  assert.match(b.log.sent[1].subject, /^Monthly gift renewed: \$10\.00\/month/);
});

test('alert text never carries line breaks into the subject', () => {
  const r = renderGiftAlert({ donorName: 'A\r\nBcc: x@y.z', email: 'a@b.c', amountCents: 500, monthly: false, designation: 'needed', method: 'Visa', receiptNo: 'AST-1', date: new Date(0) }, 'once');
  assert.doesNotMatch(r.subject, /[\r\n]/);
});

function fakeStripeForDigest(now) {
  const t = s => Math.floor(now.getTime() / 1000) - s;
  const list = items => () => (async function* () { for (const i of items) yield i; })();
  return {
    paymentIntents: { list: list([
      { status: 'succeeded', amount_received: 50000, metadata: { kind: 'once', name: 'Priya Venkatesh', designation: 'campus' } },
      { status: 'succeeded', amount_received: 2500, metadata: { kind: 'once', name: 'Arjun Rao' } },
      { status: 'requires_payment_method', amount_received: 0, metadata: { kind: 'once', name: 'Failed' } },
      { status: 'succeeded', amount_received: 1000, metadata: {} }, // a subscription's own payment intent: counted via its invoice
    ]) },
    invoices: { list: p => list(p.status === 'paid'
      ? [{ amount_paid: 1000, billing_reason: 'subscription_create', customer_name: 'Meera Iyer', parent: { subscription_details: { metadata: { designation: 'organizers' } } } }]
      : [{ attempted: true, attempt_count: 1 }])() },
    refunds: { list: list([{ status: 'succeeded', amount: 500 }]) },
    subscriptions: { list: p => list(p.status === 'canceled'
      ? [{ canceled_at: t(3600) }, { canceled_at: t(30 * 24 * 3600) }]
      : [{ items: { data: [{ price: { unit_amount: 1000 }, quantity: 1 }] } }, { items: { data: [{ price: { unit_amount: 2500 }, quantity: 1 }] } }])() },
  };
}

test('weekly digest counts the week from Stripe', async () => {
  const now = new Date('2026-11-02T14:00:00Z');
  const d = await buildDigest(fakeStripeForDigest(now), now);
  assert.equal(d.giftCount, 3);
  assert.equal(d.giftCents, 53500);
  assert.equal(d.oneTime, 2);
  assert.equal(d.monthlyPayments, 1);
  assert.equal(d.newMonthly, 1);
  assert.equal(d.cancellations, 1);
  assert.equal(d.failed, 1);
  assert.equal(d.refundCents, 500);
  assert.equal(d.activeMonthly, 2);
  assert.equal(d.monthlyRunCents, 3500);
  assert.equal(d.top[0].name, 'Priya Venkatesh');
  const r = renderDigest(d);
  assert.equal(r.subject, 'Astra weekly roundup: 3 gifts, $535.00');
  assert.match(r.text, /Active monthly donors: 2 \(\$35\.00 a month\)/);
  assert.match(r.text, /Campus networks: \$500\.00/);
});

test('weekly digest route: requires the cron secret, sends once to ALERT_EMAIL', async () => {
  const now = new Date('2026-11-02T14:00:00Z');
  const env = { CRON_SECRET: 'x'.repeat(32), ALERT_EMAIL: 'info@astracivic.org' };
  const sent = [];
  const h = digestRoute.make({ stripe: () => fakeStripeForDigest(now), sendEmail: async m => { sent.push(m); return { id: 'e' }; }, env, now: () => now });

  let res = fakeRes();
  await h(fakeReq({ method: 'GET', headers: { authorization: 'Bearer wrong' } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(sent.length, 0);

  res = fakeRes();
  await h(fakeReq({ method: 'GET', headers: { authorization: `Bearer ${env.CRON_SECRET}` } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'info@astracivic.org');
  assert.equal(sent[0].idempotencyKey, 'weekly-digest-2026-11-02');
});

test('weekly digest route fails closed without a cron secret or a valid recipient', async () => {
  const orig = console.error; console.error = () => {};
  try {
    for (const env of [{ ALERT_EMAIL: 'info@astracivic.org' }, { CRON_SECRET: 'short', ALERT_EMAIL: 'info@astracivic.org' }, { CRON_SECRET: 'x'.repeat(32), ALERT_EMAIL: 'me@gmail.com' }]) {
      const sent = [];
      const h = digestRoute.make({ stripe: () => ({}), sendEmail: async m => sent.push(m), env, now: () => new Date() });
      const res = fakeRes();
      await h(fakeReq({ method: 'GET', headers: { authorization: `Bearer ${env.CRON_SECRET}` } }), res);
      assert.ok(res.statusCode >= 500 || res.statusCode === 401, JSON.stringify(env));
      assert.equal(sent.length, 0);
    }
  } finally { console.error = orig; }
});
