const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLimiter } = require('../api/_lib/ratelimit');
const { sign, verify } = require('../api/_lib/token');
const { sendEmail } = require('../api/_lib/mail');

test('limiter allows up to the limit per window, per key', () => {
  let t = 0;
  const allow = makeLimiter({ limit: 2, windowMs: 1000, now: () => t });
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), false);
  assert.equal(allow('b'), true);
  t = 1001;
  assert.equal(allow('a'), true);
});

test('limiter rejects invalid limit and windowMs', () => {
  assert.throws(() => makeLimiter({ limit: 0, windowMs: 1000 }));
  assert.throws(() => makeLimiter({ limit: NaN, windowMs: 1000 }));
  assert.throws(() => makeLimiter({ limit: 1, windowMs: 0 }));
  assert.throws(() => makeLimiter({ limit: 1, windowMs: -5 }));
});

test('limiter evicts expired keys past 5000 instead of clearing live counters', () => {
  let t = 0;
  const allow = makeLimiter({ limit: 1, windowMs: 1000, now: () => t });
  for (let i = 0; i < 5000; i++) assert.equal(allow('old' + i), true); // t=0
  t = 500;
  assert.equal(allow('a'), true); // size 5001 -> evicts oldest-inserted, 'a' is live
  assert.equal(allow('a'), false); // still within its window
  t = 1200;
  assert.equal(allow('b'), true); // expired 'old*' keys get evicted, 'a' (ts 500) stays
  assert.equal(allow('a'), false); // must not be reset while still within the window
  t = 1600;
  assert.equal(allow('a'), true); // window has passed, no longer limited
});

test('tokens round-trip and reject tampering, wrong secret and expiry', () => {
  let t = 1_000_000;
  const tok = sign({ c: 'cus_123' }, 's3cret', 60, () => t);
  assert.equal(verify(tok, 's3cret', () => t).c, 'cus_123');
  assert.equal(verify(tok, 'other', () => t), null);
  const i = tok.lastIndexOf('.') + 1;
  const flipped = tok.slice(0, i) + (tok[i] === 'A' ? 'B' : 'A') + tok.slice(i + 1);
  assert.equal(verify(flipped, 's3cret', () => t), null);
  assert.equal(verify('garbage', 's3cret', () => t), null);
  assert.equal(verify(undefined, 's3cret', () => t), null);
  t += 61_000;
  assert.equal(verify(tok, 's3cret', () => t), null);
});

test('sign refuses an empty secret', () => {
  assert.throws(() => sign({ c: 'x' }, '', 60), /Signing secret is not configured/);
});

test('verify rejects tokens with extra dot-separated parts', () => {
  const t = 1_000_000;
  const tok = sign({ c: 'cus_123' }, 's3cret', 60, () => t);
  assert.equal(verify(tok + '.x', 's3cret', () => t), null);
});

test('verify rejects a payload swapped under the original signature', () => {
  const t = 1_000_000;
  const a = sign({ c: 'cus_A' }, 's3cret', 60, () => t);
  const b = sign({ c: 'cus_B' }, 'other-secret', 60, () => t);
  const swapped = b.split('.')[0] + '.' + a.split('.')[1];
  assert.equal(verify(swapped, 's3cret', () => t), null);
});

test('verify accepts a token exactly at exp and rejects one second later', () => {
  let t = 1_000_000;
  const tok = sign({ c: 'cus_123' }, 's3cret', 60, () => t);
  const exp = Math.floor(t / 1000) + 60;
  assert.equal(verify(tok, 's3cret', () => exp * 1000).c, 'cus_123');
  assert.equal(verify(tok, 's3cret', () => (exp + 1) * 1000), null);
});

test('sendEmail posts to Resend with idempotency key and sender', async () => {
  let call;
  const fetch = async (url, opts) => { call = { url, opts }; return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) }; };
  const env = { RESEND_API_KEY: 're_test', RECEIPT_FROM: 'CYP <giving@x.org>', RECEIPT_REPLY_TO: 'me@x.org' };
  const out = await sendEmail({ to: 'jane@example.org', subject: 'S', html: '<p>h</p>', text: 't', idempotencyKey: 'receipt-pi_1' }, { fetch, env });
  assert.deepEqual(out, { id: 'em_1' });
  assert.equal(call.url, 'https://api.resend.com/emails');
  assert.equal(call.opts.headers.Authorization, 'Bearer re_test');
  assert.equal(call.opts.headers['Idempotency-Key'], 'receipt-pi_1');
  const body = JSON.parse(call.opts.body);
  assert.deepEqual(body.to, ['jane@example.org']);
  assert.equal(body.from, 'CYP <giving@x.org>');
  assert.equal(body.reply_to, 'me@x.org');
});

test('sendEmail passes an abort signal to fetch', async () => {
  let opts;
  const fetch = async (url, o) => { opts = o; return { ok: true, status: 200, json: async () => ({}) }; };
  await sendEmail({ to: 'a@b.co', subject: 's', html: 'h', text: 't' }, { env: { RESEND_API_KEY: 'k' }, fetch });
  assert.ok(opts.signal, 'fetch options should include a signal');
});

test('sendEmail refuses to call fetch when RESEND_API_KEY is missing', async () => {
  const fetch = async () => { throw new Error('fetch should not be called'); };
  await assert.rejects(
    sendEmail({ to: 'a@b.co', subject: 's', html: 'h', text: 't' }, { env: { RESEND_API_KEY: '' }, fetch }),
    /Email is not configured/
  );
  await assert.rejects(
    sendEmail({ to: 'a@b.co', subject: 's', html: 'h', text: 't' }, { env: {}, fetch }),
    /Email is not configured/
  );
});

test('sendEmail rejects a recipient that is not a non-empty string before fetch', async () => {
  const fetch = async () => { throw new Error('fetch should not be called'); };
  await assert.rejects(
    sendEmail({ to: ['a@b.co'], subject: 's', html: 'h', text: 't' }, { env: { RESEND_API_KEY: 'k' }, fetch }),
    /Invalid recipient/
  );
  await assert.rejects(
    sendEmail({ to: '', subject: 's', html: 'h', text: 't' }, { env: { RESEND_API_KEY: 'k' }, fetch }),
    /Invalid recipient/
  );
});

test('sendEmail treats 409 as a duplicate and throws on other errors without the body', async () => {
  const env = { RESEND_API_KEY: 'k' };
  const dup = await sendEmail({ to: 'a@b.co', subject: 's', html: 'h', text: 't' }, { env, fetch: async () => ({ ok: false, status: 409, json: async () => ({ name: 'invalid_idempotent_request' }) }) });
  assert.deepEqual(dup, { duplicate: true });
  await assert.rejects(
    sendEmail({ to: 'a@b.co', subject: 's', html: 'h', text: 't' }, { env, fetch: async () => ({ ok: false, status: 500, text: async () => 'boom' }) }),
    (err) => {
      assert.match(err.message, /Resend 500/);
      assert.ok(!err.message.includes('boom'), 'error must not echo the response body');
      return true;
    }
  );
});

test('sendEmail throws on a 409 for a concurrent request or an unknown or unparseable body', async () => {
  const env = { RESEND_API_KEY: 'k' };
  const args = { to: 'a@b.co', subject: 's', html: 'h', text: 't' };
  const bodies = [
    async () => ({ name: 'concurrent_idempotent_requests' }),
    async () => ({ name: 'something_else' }),
    async () => ({}),
    async () => { throw new SyntaxError('bad json'); },
  ];
  for (const json of bodies) {
    await assert.rejects(sendEmail(args, { env, fetch: async () => ({ ok: false, status: 409, json }) }), /^Error: Resend 409$/);
  }
});
