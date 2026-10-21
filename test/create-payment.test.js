const test = require('node:test');
const assert = require('node:assert/strict');
const { fakeReq, fakeRes } = require('./helpers');
const createPayment = require('../api/create-payment');
const config = require('../api/config');

const body = { freq: 'once', amount: 100, coverFee: true, designation: 'organizers', name: 'Jane Doe', email: 'jane@example.org', dedication: '', employer: 'Acme' };

function fakeStripe(calls) {
  return {
    paymentIntents: { create: async p => { calls.push(['pi', p]); return { id: 'pi_3Qabcdefgh12345678', created: 1791590400, client_secret: 'pi_secret_1' }; } },
    customers: { create: async p => { calls.push(['cus', p]); return { id: 'cus_1' }; } },
    subscriptions: { create: async p => { calls.push(['sub', p]); return { id: 'sub_1', latest_invoice: { id: 'in_1Qzzzzzzzzabcdefgh', created: 1791590400, confirmation_secret: { client_secret: 'in_secret_1' } } }; } },
  };
}

function handler(calls, allow = () => true) {
  return createPayment.make({ stripe: () => fakeStripe(calls), allow, env: { STRIPE_MONTHLY_PRODUCT_ID: 'prod_1' } });
}

test('one-time gift creates a PaymentIntent for amount plus fee, with metadata', async () => {
  const calls = [];
  const res = fakeRes();
  await handler(calls)(fakeReq({ body }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { clientSecret: 'pi_secret_1', receiptNo: 'AST-2026-12345678' });
  const [kind, p] = calls[0];
  assert.equal(kind, 'pi');
  assert.equal(p.amount, 10330);
  assert.equal(p.currency, 'usd');
  assert.deepEqual(p.automatic_payment_methods, { enabled: true });
  assert.equal(p.receipt_email, undefined);
  assert.equal(p.metadata.kind, 'once');
  assert.equal(p.metadata.employer, 'Acme');
});

test('monthly gift creates customer and incomplete subscription on the monthly product', async () => {
  const calls = [];
  const res = fakeRes();
  await handler(calls)(fakeReq({ body: { ...body, freq: 'monthly', amount: 25, coverFee: false } }), res);
  assert.deepEqual(res.json(), { clientSecret: 'in_secret_1', receiptNo: 'AST-2026-ABCDEFGH' });
  assert.deepEqual(calls[0], ['cus', { name: 'Jane Doe', email: 'jane@example.org', metadata: { source: 'give' } }]);
  const sub = calls[1][1];
  assert.equal(sub.customer, 'cus_1');
  assert.deepEqual(sub.items, [{ price_data: { currency: 'usd', product: 'prod_1', unit_amount: 2500, recurring: { interval: 'month' } } }]);
  assert.equal(sub.payment_behavior, 'default_incomplete');
  assert.deepEqual(sub.payment_settings, { save_default_payment_method: 'on_subscription' });
  assert.deepEqual(sub.expand, ['latest_invoice.confirmation_secret']);
  assert.equal(sub.metadata.kind, 'monthly');
});

test('invalid input returns 400 without calling Stripe', async () => {
  const calls = [];
  const res = fakeRes();
  await handler(calls)(fakeReq({ body: { ...body, amount: 2 } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'Online gifts start at $5.');
  assert.equal(calls.length, 0);
});

test('rate limited requests get 429', async () => {
  const res = fakeRes();
  await handler([], () => false)(fakeReq({ body }), res);
  assert.equal(res.statusCode, 429);
});

test('GET is rejected and Stripe errors become a friendly 502', async () => {
  const res1 = fakeRes();
  await handler([])(fakeReq({ method: 'GET' }), res1);
  assert.equal(res1.statusCode, 405);
  const broken = createPayment.make({ stripe: () => ({ paymentIntents: { create: async () => { throw new Error('boom'); } } }), allow: () => true, env: {} });
  const res2 = fakeRes();
  const logged = [];
  const real = console.error;
  console.error = (...a) => { logged.push(a.join(' ')); };
  try { await broken(fakeReq({ body }), res2); } finally { console.error = real; }
  assert.equal(res2.statusCode, 502);
  assert.equal(res2.json().error, 'We could not start the payment. Please try again.');
  assert.match(logged.join('\n'), /name=Error/);
  assert.doesNotMatch(logged.join('\n'), /boom/);
});

test('monthly gift without STRIPE_MONTHLY_PRODUCT_ID fails closed without calling Stripe', async () => {
  const calls = [];
  const logged = [];
  const realError = console.error;
  console.error = (...args) => { logged.push(args.join(' ')); };
  try {
    const noProduct = createPayment.make({ stripe: () => fakeStripe(calls), allow: () => true, env: {} });
    const res = fakeRes();
    await noProduct(fakeReq({ body: { ...body, freq: 'monthly', amount: 25, coverFee: false } }), res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.json().error, 'We could not start the payment. Please try again.');
    assert.equal(calls.length, 0);
    assert.deepEqual(logged, ['create-payment: STRIPE_MONTHLY_PRODUCT_ID missing']);
  } finally {
    console.error = realError;
  }
});

test('config returns public keys only', async () => {
  const res = fakeRes();
  await config.make({ env: { STRIPE_PUBLISHABLE_KEY: 'pk_test_1', STRIPE_SECRET_KEY: 'sk_test_x' } })(fakeReq({ method: 'GET' }), res);
  assert.deepEqual(res.json(), { stripePk: 'pk_test_1' });
});

test('Stripe failures log type, code, status and request id but never the error message', async () => {
  const logged = [];
  const real = console.error;
  console.error = (...a) => { logged.push(a.join(' ')); };
  try {
    const boom = { paymentIntents: { create: async () => { throw Object.assign(new Error('No such customer jane@example.org'), { type: 'StripeInvalidRequestError', code: 'resource_missing', statusCode: 400, requestId: 'req_123' }); } } };
    const res = fakeRes();
    await createPayment.make({ stripe: () => boom, allow: () => true, env: {} })(fakeReq({ body }), res);
    assert.equal(res.statusCode, 502);
  } finally { console.error = real; }
  const all = logged.join('\n');
  assert.doesNotMatch(all, /jane@|No such customer/);
  assert.match(all, /type=StripeInvalidRequestError/);
  assert.match(all, /code=resource_missing/);
  assert.match(all, /status=400/);
  assert.match(all, /requestId=req_123/);
});
