const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { describeMethod, fromPaymentIntent, fromInvoice } = require('../api/_lib/stripe-data');

const paidAt = new Date('2026-10-09T16:00:00Z');
const logoUrl = 'https://give.example/brand/astra-wordmark-white.png';

test('describeMethod covers cards, wallets, bank accounts and fallbacks', () => {
  assert.equal(describeMethod({ type: 'card', card: { display_brand: 'visa', last4: '4242' } }), 'Visa ending 4242');
  assert.equal(describeMethod({ type: 'card', card: { brand: 'amex', display_brand: 'american_express', last4: '0005' } }), 'American Express ending 0005');
  assert.equal(describeMethod({ type: 'card', card: { brand: 'visa', last4: '1111', wallet: { type: 'apple_pay' } } }), 'Apple Pay (Visa ending 1111)');
  assert.equal(describeMethod({ type: 'card', card: { brand: 'mastercard', last4: '4444', wallet: { type: 'google_pay' } } }), 'Google Pay (Mastercard ending 4444)');
  assert.equal(describeMethod({ type: 'us_bank_account', us_bank_account: { last4: '6789' } }), 'Bank account ending 6789');
  assert.equal(describeMethod({ type: 'link' }), 'Link');
  assert.equal(describeMethod('pm_123'), 'Online payment');
  assert.equal(describeMethod(null), 'Online payment');
});

test('describeMethod never prints "ending undefined" and title-cases brands', () => {
  assert.equal(describeMethod({ type: 'card', card: { display_brand: 'visa' } }), 'Visa');
  assert.equal(describeMethod({ type: 'card', card: { display_brand: 'diners' } }), 'Diners');
  assert.equal(describeMethod({ type: 'card', card: { display_brand: 'american_express', last4: '0005' } }), 'American Express ending 0005');
  assert.equal(describeMethod({ type: 'card', card: { brand: 'visa', wallet: { type: 'apple_pay' } } }), 'Apple Pay (Visa)');
  assert.equal(describeMethod({ type: 'us_bank_account', us_bank_account: {} }), 'Bank account');
  assert.equal(describeMethod({ type: 'card', card: {} }), 'Card');
});

test('fromPaymentIntent maps metadata, amount and fee', () => {
  const pi = {
    id: 'pi_3Qabcdefgh12345678', created: 1791590400, amount_received: 10330,
    metadata: { kind: 'once', designation: 'organizers', dedication: 'Priya', fee_cents: '330', name: 'Jane Doe', email: 'jane@example.org' },
    payment_method: { type: 'card', card: { display_brand: 'visa', last4: '4242' } },
  };
  assert.deepEqual(fromPaymentIntent(pi, { paidAt, logoUrl }), {
    email: 'jane@example.org', donorName: 'Jane Doe', receiptNo: 'AST-2026-12345678', date: paidAt,
    monthly: false, designation: 'organizers', dedication: 'Priya', method: 'Visa ending 4242',
    amountCents: 10330, feeCents: 330, logoUrl,
  });
});

test('fromPaymentIntent clamps the fee to 0..amount and rounds it', () => {
  const base = (fee) => ({ id: 'pi_1', created: 1791590400, amount_received: 1000, metadata: { fee_cents: fee } });
  assert.equal(fromPaymentIntent(base('-50'), { paidAt, logoUrl }).feeCents, 0);
  assert.equal(fromPaymentIntent(base('999999'), { paidAt, logoUrl }).feeCents, 1000);
  assert.equal(fromPaymentIntent(base('abc'), { paidAt, logoUrl }).feeCents, 0);
  assert.equal(fromPaymentIntent(base('86.6'), { paidAt, logoUrl }).feeCents, 87);
});

test('fromInvoice reads subscription metadata from invoice.parent and next date from items', () => {
  const inv = {
    id: 'in_1Qzzzzzzzzabcdefgh', created: 1791590400, amount_paid: 2586,
    customer_email: 'jane@example.org', customer_name: 'Jane Doe',
    parent: { subscription_details: { subscription: 'sub_1', metadata: { kind: 'monthly', designation: 'world', dedication: '', fee_cents: '86', name: 'Jane Doe', email: 'jane@example.org' } } },
  };
  const sub = {
    id: 'sub_1', customer: 'cus_1', metadata: {},
    default_payment_method: { type: 'us_bank_account', us_bank_account: { last4: '6789' } },
    items: { data: [{ current_period_end: 1794268800 }] },
  };
  const d = fromInvoice(inv, sub, { paidAt, logoUrl, manageUrl: 'https://give.example/api/portal?t=x' });
  assert.equal(d.receiptNo, 'AST-2026-ABCDEFGH');
  assert.equal(d.monthly, true);
  assert.equal(d.designation, 'world');
  assert.equal(d.amountCents, 2586);
  assert.equal(d.feeCents, 86);
  assert.equal(d.method, 'Bank account ending 6789');
  assert.equal(d.nextDate.toISOString(), '2026-11-10T00:00:00.000Z');
  assert.equal(d.manageUrl, 'https://give.example/api/portal?t=x');
  assert.equal(d.email, 'jane@example.org');
});

test('fromInvoice falls back to subscription metadata and safe defaults', () => {
  const inv = { id: 'in_2', created: 1791590400, amount_paid: 1000, customer_email: 'a@b.co', parent: null };
  const sub = { id: 'sub_2', customer: 'cus_2', metadata: { designation: 'office', name: 'Sam Lee' }, default_payment_method: null, items: { data: [] } };
  const d = fromInvoice(inv, sub, { paidAt, logoUrl, manageUrl: '' });
  assert.equal(d.donorName, 'Sam Lee');
  assert.equal(d.designation, 'office');
  assert.equal(d.feeCents, 0);
  assert.equal(d.method, 'Online payment');
  assert.equal(d.nextDate, undefined);
});

test('fromInvoice merges subscription metadata when the invoice snapshot is empty or partial', () => {
  const inv = {
    id: 'in_3', created: 1791590400, amount_paid: 2586, customer_email: 'jane@example.org',
    parent: { subscription_details: { subscription: 'sub_3', metadata: {} } },
  };
  const sub = { id: 'sub_3', customer: 'cus_3', metadata: { designation: 'organizers', fee_cents: '86', dedication: 'Priya' }, default_payment_method: null, items: { data: [] } };
  const d = fromInvoice(inv, sub, { paidAt, logoUrl, manageUrl: '' });
  assert.equal(d.designation, 'organizers');
  assert.equal(d.feeCents, 86);
  assert.equal(d.dedication, 'Priya');
});

test('fromInvoice clamps the fee to 0..amount and rounds it', () => {
  const sub = { id: 'sub_4', customer: 'cus_4', metadata: {}, default_payment_method: null, items: { data: [] } };
  const withFee = (fee, amount = 1000) => ({ id: 'in_4', created: 1791590400, amount_paid: amount, parent: { subscription_details: { metadata: { fee_cents: fee } } } });
  assert.equal(fromInvoice(withFee('-50'), sub, { paidAt, logoUrl, manageUrl: '' }).feeCents, 0);
  assert.equal(fromInvoice(withFee('999999'), sub, { paidAt, logoUrl, manageUrl: '' }).feeCents, 1000);
  assert.equal(fromInvoice(withFee('abc'), sub, { paidAt, logoUrl, manageUrl: '' }).feeCents, 0);
  assert.equal(fromInvoice(withFee('86.6'), sub, { paidAt, logoUrl, manageUrl: '' }).feeCents, 87);
});

test('getStripe throws a clear error without STRIPE_SECRET_KEY and pins the API version', () => {
  const modPath = path.join(__dirname, '..', 'api', '_lib', 'stripe.js');
  const saved = process.env.STRIPE_SECRET_KEY;
  try {
    delete process.env.STRIPE_SECRET_KEY;
    delete require.cache[modPath];
    const { getStripe } = require(modPath);
    assert.throws(() => getStripe(), { message: 'STRIPE_SECRET_KEY is not configured' });

    process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
    delete require.cache[modPath];
    const fresh = require(modPath);
    assert.equal(fresh.getStripe().getApiField('version'), '2026-09-30.endive');
  } finally {
    if (saved === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = saved;
    delete require.cache[modPath];
  }
});
