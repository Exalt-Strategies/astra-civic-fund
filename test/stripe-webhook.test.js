const test = require('node:test');
const assert = require('node:assert/strict');
const { fakeReq, fakeRes } = require('./helpers');
const { readRaw } = require('../api/_lib/http');
const webhook = require('../api/stripe-webhook');

const env = { STRIPE_WEBHOOK_SECRET: 'whsec_1', SITE_URL: 'https://give.example', MANAGE_SECRET: 'm' };

function setup(event, { pi, inv, sub } = {}) {
  const log = { sent: [], updates: [] };
  const stripe = {
    webhooks: { constructEvent: (raw, sig, secret) => { if (sig !== 'good' || secret !== 'whsec_1') throw new Error('bad'); assert.ok(Buffer.isBuffer(raw)); return event; } },
    paymentIntents: { retrieve: async (id, o) => { assert.deepEqual(o, { expand: ['payment_method'] }); return pi; }, update: async (id, p) => log.updates.push(['pi', id, p]) },
    invoices: { retrieve: async () => inv, update: async (id, p) => log.updates.push(['in', id, p]) },
    subscriptions: { retrieve: async (id, o) => { assert.deepEqual(o, { expand: ['default_payment_method'] }); return sub; } },
  };
  const h = webhook.make({ stripe: () => stripe, sendEmail: async m => { log.sent.push(m); return { id: 'em' }; }, env });
  return { h, log };
}

const pi = {
  id: 'pi_3Qabcdefgh12345678', created: 1791590400, amount_received: 10330,
  metadata: { kind: 'once', designation: 'needed', dedication: '', fee_cents: '330', name: 'Jane Doe', email: 'jane@example.org' },
  payment_method: { type: 'card', card: { display_brand: 'visa', last4: '4242' } },
};

const sigHdr = { 'stripe-signature': 'good' };
function quiet(fn) {
  return async () => {
    const orig = console.error; const lines = [];
    console.error = (...a) => lines.push(a.join(' '));
    try { await fn(lines); } finally { console.error = orig; }
  };
}

test('rejects a bad signature with 400', async () => {
  const { h } = setup({});
  const res = fakeRes();
  await h(fakeReq({ body: '{}', headers: { 'stripe-signature': 'bad' } }), res);
  assert.equal(res.statusCode, 400);
});

test('payment_intent.succeeded sends one receipt and marks it sent', async () => {
  const event = { type: 'payment_intent.succeeded', created: 1791590400, data: { object: { id: pi.id } } };
  const { h, log } = setup(event, { pi });
  const res = fakeRes();
  await h(fakeReq({ body: '{}', headers: { 'stripe-signature': 'good' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(log.sent.length, 1);
  assert.equal(log.sent[0].to, 'jane@example.org');
  assert.equal(log.sent[0].idempotencyKey, 'receipt-pi_3Qabcdefgh12345678');
  assert.match(log.sent[0].html, /\$103\.30/);
  assert.match(log.sent[0].html, /https:\/\/give\.example\/brand\/astra-wordmark-white\.png/);
  assert.deepEqual(log.updates, [['pi', pi.id, { metadata: { receipt_sent: '1' } }]]);
});

test('skips intents that are not ours or already receipted', async () => {
  for (const meta of [{ ...pi.metadata, kind: undefined }, { ...pi.metadata, receipt_sent: '1' }]) {
    const { h, log } = setup({ type: 'payment_intent.succeeded', created: 1, data: { object: { id: pi.id } } }, { pi: { ...pi, metadata: meta } });
    const res = fakeRes();
    await h(fakeReq({ body: '{}', headers: { 'stripe-signature': 'good' } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(log.sent.length, 0);
  }
});

test('invoice.paid sends a monthly receipt with a signed manage link', async () => {
  const inv = {
    id: 'in_1Qzzzzzzzzabcdefgh', created: 1791590400, amount_paid: 2586, metadata: {},
    customer_email: 'jane@example.org', customer_name: 'Jane Doe',
    parent: { subscription_details: { subscription: 'sub_1', metadata: { kind: 'monthly', designation: 'world', fee_cents: '86', name: 'Jane Doe', email: 'jane@example.org' } } },
  };
  const sub = { id: 'sub_1', customer: 'cus_1', metadata: { kind: 'monthly' }, default_payment_method: null, items: { data: [{ current_period_end: 1794268800 }] } };
  const { h, log } = setup({ type: 'invoice.paid', created: 1791590400, data: { object: { id: inv.id } } }, { inv, sub });
  const res = fakeRes();
  await h(fakeReq({ body: '{}', headers: { 'stripe-signature': 'good' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(log.sent.length, 1);
  assert.equal(log.sent[0].idempotencyKey, 'receipt-in_1Qzzzzzzzzabcdefgh');
  assert.match(log.sent[0].html, /href="https:\/\/give\.example\/api\/portal\?t=[^"]+"/);
  assert.deepEqual(log.updates, [['in', inv.id, { metadata: { receipt_sent: '1' } }]]);
});

test('ignores zero-amount and non-CYP invoices', async () => {
  const sub = { id: 'sub_1', customer: 'cus_1', metadata: {}, items: { data: [] } };
  for (const inv of [
    { id: 'in_a', amount_paid: 0, metadata: {}, parent: { subscription_details: { subscription: 'sub_1', metadata: { kind: 'monthly' } } } },
    { id: 'in_b', amount_paid: 500, metadata: {}, parent: { subscription_details: { subscription: 'sub_1', metadata: {} } } },
    { id: 'in_c', amount_paid: 500, metadata: {}, parent: null },
  ]) {
    const { h, log } = setup({ type: 'invoice.paid', created: 1, data: { object: { id: inv.id } } }, { inv, sub });
    const res = fakeRes();
    await h(fakeReq({ body: '{}', headers: { 'stripe-signature': 'good' } }), res);
    assert.equal(log.sent.length, 0, inv.id);
  }
});

test('returns 500 when sending fails so Stripe retries', quiet(async () => {
  const event = { type: 'payment_intent.succeeded', created: 1, data: { object: { id: pi.id } } };
  const stripe = {
    webhooks: { constructEvent: () => event },
    paymentIntents: { retrieve: async () => pi, update: async () => { throw new Error('should not mark'); } },
  };
  const h = webhook.make({ stripe: () => stripe, sendEmail: async () => { throw new Error('resend down'); }, env });
  const res = fakeRes();
  await h(fakeReq({ body: '{}', headers: { 'stripe-signature': 'good' } }), res);
  assert.equal(res.statusCode, 500);
}));

test('stripe() configuration error returns 500 instead of crashing', quiet(async () => {
  const h = webhook.make({ stripe: () => { throw new Error('STRIPE_SECRET_KEY is not configured'); }, sendEmail: async () => {}, env });
  const res = fakeRes();
  await h(fakeReq({ body: '{}', headers: sigHdr }), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.json(), { error: 'Webhook handler failed' });
}));

test('missing signature header or oversized body returns 400 Bad signature', quiet(async () => {
  const { h } = setup({});
  let res = fakeRes();
  await h(fakeReq({ body: '{}' }), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json(), { error: 'Bad signature' });
  res = fakeRes();
  await h(fakeReq({ body: 'x'.repeat(1_000_001), headers: sigHdr }), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json(), { error: 'Bad signature' });
}));

test('missing STRIPE_WEBHOOK_SECRET returns 500 without verifying', quiet(async lines => {
  let called = false;
  const stripe = { webhooks: { constructEvent: () => { called = true; return {}; } } };
  const h = webhook.make({ stripe: () => stripe, sendEmail: async () => {}, env: { ...env, STRIPE_WEBHOOK_SECRET: '' } });
  const res = fakeRes();
  await h(fakeReq({ body: '{}', headers: sigHdr }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(called, false);
  assert.ok(lines.includes('stripe-webhook: STRIPE_WEBHOOK_SECRET missing'));
}));

test('receipt with no valid email logs the id only, marks nothing, returns 200', quiet(async lines => {
  const noEmail = { ...pi, metadata: { ...pi.metadata, email: '' } };
  const { h, log } = setup({ type: 'payment_intent.succeeded', created: 1791590400, data: { object: { id: pi.id } } }, { pi: noEmail });
  const res = fakeRes();
  await h(fakeReq({ body: '{}', headers: sigHdr }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(log.sent.length, 0);
  assert.equal(log.updates.length, 0);
  const out = lines.join('\n');
  assert.ok(out.includes(pi.id));
  assert.ok(!/Jane|\$|10330|103\.30/.test(out));
}));

test('other event types are ignored with 200', async () => {
  const { h, log } = setup({ type: 'charge.refunded', created: 1, data: { object: { id: 'ch_1' } } });
  const res = fakeRes();
  await h(fakeReq({ body: '{}', headers: sigHdr }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(log.sent.length, 0);
});

test('invoice with a blank customer_email and no metadata email logs the id only and sends nothing', quiet(async lines => {
  const inv = {
    id: 'in_blank', created: 1, amount_paid: 2586, metadata: {}, customer_email: '   ', customer_name: 'Jane Doe',
    parent: { subscription_details: { subscription: 'sub_1', metadata: { kind: 'monthly', designation: 'world', fee_cents: '86', name: 'Jane Doe' } } },
  };
  const sub = { id: 'sub_1', customer: 'cus_1', metadata: { kind: 'monthly' }, default_payment_method: null, items: { data: [{ current_period_end: 1794268800 }] } };
  const { h, log } = setup({ type: 'invoice.paid', created: 1, data: { object: { id: inv.id } } }, { inv, sub });
  const res = fakeRes();
  await h(fakeReq({ body: '{}', headers: sigHdr }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(log.sent.length, 0);
  assert.equal(log.updates.length, 0);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('in_blank'));
  assert.ok(!/Jane|\$|2586/.test(lines[0]));
}));

test('payment intent with a malformed email sends nothing and marks nothing', quiet(async lines => {
  const bad = { ...pi, metadata: { ...pi.metadata, email: 'not-an-email' } };
  const { h, log } = setup({ type: 'payment_intent.succeeded', created: 1, data: { object: { id: pi.id } } }, { pi: bad });
  const res = fakeRes();
  await h(fakeReq({ body: '{}', headers: sigHdr }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(log.sent.length, 0);
  assert.equal(log.updates.length, 0);
  assert.ok(!lines.join('\n').includes('not-an-email'));
}));

test('missing SITE_URL returns 500 before verifying', quiet(async lines => {
  let called = false;
  const stripe = { webhooks: { constructEvent: () => { called = true; return {}; } } };
  const h = webhook.make({ stripe: () => stripe, sendEmail: async () => {}, env: { ...env, SITE_URL: '' } });
  const res = fakeRes();
  await h(fakeReq({ body: '{}', headers: sigHdr }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(called, false);
  assert.ok(lines.includes('stripe-webhook: SITE_URL missing'));
}));

test('invoice with a non-monthly kind in its details returns before retrieving the subscription', async () => {
  const inv = { id: 'in_x', amount_paid: 500, metadata: {}, parent: { subscription_details: { subscription: 'sub_1', metadata: { kind: 'once' } } } };
  let retrieved = false;
  const { h, log } = setup({ type: 'invoice.paid', created: 1, data: { object: { id: inv.id } } }, { inv, sub: {} });
  const orig = h;
  const stripe = {
    webhooks: { constructEvent: () => ({ type: 'invoice.paid', created: 1, data: { object: { id: inv.id } } }) },
    invoices: { retrieve: async () => inv },
    subscriptions: { retrieve: async () => { retrieved = true; return {}; } },
  };
  const h2 = webhook.make({ stripe: () => stripe, sendEmail: async () => {}, env });
  const res = fakeRes();
  await h2(fakeReq({ body: '{}', headers: sigHdr }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(retrieved, false);
  assert.equal(log.sent.length, 0);
  void orig;
});

const invoiceFixture = () => ({
  inv: {
    id: 'in_1Qzzzzzzzzabcdefgh', created: 1791590400, amount_paid: 2586, metadata: {},
    customer_email: 'jane@example.org', customer_name: 'Jane Doe',
    parent: { subscription_details: { subscription: 'sub_1', metadata: { kind: 'monthly', designation: 'world', fee_cents: '86', name: 'Jane Doe', email: 'jane@example.org' } } },
  },
  sub: { id: 'sub_1', customer: 'cus_1', metadata: { kind: 'monthly' }, default_payment_method: null, items: { data: [{ current_period_end: 1794268800 }] } },
});

test('two deliveries of the same invoice event produce byte-identical receipts', async () => {
  const { inv, sub } = invoiceFixture();
  const event = { type: 'invoice.paid', created: 1791590400, data: { object: { id: inv.id } } };
  const realNow = Date.now;
  const htmls = [];
  try {
    for (const offset of [0, 5000, 3 * 24 * 3600 * 1000]) {
      Date.now = () => realNow() + offset;
      const { h, log } = setup(event, { inv, sub });
      const res = fakeRes();
      await h(fakeReq({ body: '{}', headers: sigHdr }), res);
      assert.equal(res.statusCode, 200);
      htmls.push([log.sent[0].html, log.sent[0].text]);
    }
  } finally { Date.now = realNow; }
  assert.deepEqual(htmls[1], htmls[0]);
  assert.deepEqual(htmls[2], htmls[0]);
});

test('the manage link in an invoice receipt is a portal token that expires 7 days after the event', async () => {
  const { verify } = require('../api/_lib/token');
  const { inv, sub } = invoiceFixture();
  const { h, log } = setup({ type: 'invoice.paid', created: 1791590400, data: { object: { id: inv.id } } }, { inv, sub });
  await h(fakeReq({ body: '{}', headers: sigHdr }), fakeRes());
  const t = decodeURIComponent(/portal\?t=([^"&\s]+)/.exec(log.sent[0].html)[1]);
  const p = verify(t, 'm', () => 1791590400 * 1000);
  assert.deepEqual({ c: p.c, k: p.k, exp: p.exp }, { c: 'cus_1', k: 'portal', exp: 1791590400 + 7 * 24 * 3600 });
});

test('handler failures log fixed text plus Stripe type, code, status and request id, never the message', quiet(async lines => {
  const stripe = {
    webhooks: { constructEvent: () => ({ type: 'payment_intent.succeeded', created: 1, data: { object: { id: 'pi_x' } } }) },
    paymentIntents: { retrieve: async () => { throw Object.assign(new Error('secret jane@example.org'), { type: 'StripeAPIError', code: 'api_error', statusCode: 500, requestId: 'req_9' }); } },
  };
  const h = webhook.make({ stripe: () => stripe, sendEmail: async () => {}, env });
  const res = fakeRes();
  await h(fakeReq({ body: '{}', headers: sigHdr }), res);
  assert.equal(res.statusCode, 500);
  const all = lines.join('\n');
  assert.doesNotMatch(all, /secret|jane@/);
  assert.match(all, /type=StripeAPIError/);
  assert.match(all, /requestId=req_9/);
  assert.match(all, /payment_intent\.succeeded/);
}));

test('the stripe client failing to build logs without the message', quiet(async lines => {
  const h = webhook.make({ stripe: () => { throw new Error('sk_live_SECRET'); }, sendEmail: async () => {}, env });
  const res = fakeRes();
  await h(fakeReq({ body: '{}', headers: sigHdr }), res);
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(lines.join('\n'), /sk_live/);
}));

test('unreadable body logs only the error name before returning 400 Bad signature', quiet(async lines => {
  const { h } = setup({});
  const req = fakeReq({ body: '{}', headers: sigHdr });
  await readRaw(req);
  const res = fakeRes();
  await h(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json(), { error: 'Bad signature' });
  assert.deepEqual(lines, ['stripe-webhook: could not read body Error']);
}));

test('oversized body logs the reason without any body content', quiet(async lines => {
  const { h } = setup({});
  const res = fakeRes();
  await h(fakeReq({ body: 'x'.repeat(1_000_001), headers: sigHdr }), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(lines, ['stripe-webhook: could not read body Error']);
  assert.doesNotMatch(lines.join('\n'), /xxxx/);
}));
