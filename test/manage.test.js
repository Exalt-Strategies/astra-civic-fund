const test = require('node:test');
const assert = require('node:assert/strict');
const { fakeReq, fakeRes } = require('./helpers');
const manage = require('../api/manage');
const portal = require('../api/portal');
const { sign } = require('../api/_lib/token');

const env = { SITE_URL: 'https://give.example', MANAGE_SECRET: 'm' };

function stripeWith(customers, subsByCustomer) {
  return {
    customers: { list: async p => { assert.equal(p.email, 'jane@example.org'); return { data: customers }; } },
    subscriptions: { list: async p => ({ data: subsByCustomer[p.customer] || [] }) },
  };
}

const mk = o => manage.make({ minMs: 0, allowEmail: () => true, ...o });

async function captureErrors(fn) {
  const logged = [];
  const orig = console.error;
  console.error = (...args) => logged.push(args.map(String).join(' '));
  try { await fn(); } finally { console.error = orig; }
  return logged;
}

test('emails a link for each customer with an active subscription', async () => {
  const sent = [];
  const stripe = stripeWith([{ id: 'cus_1' }, { id: 'cus_2' }], { cus_1: [{ id: 'sub_1', status: 'active', items: { data: [{ price: { unit_amount: 2586 } }] } }] });
  const h = mk({ stripe: () => stripe, sendEmail: async m => sent.push(m), allow: () => true, env });
  const res = fakeRes();
  await h(fakeReq({ body: { email: ' Jane@Example.org ' } }), res);
  assert.deepEqual(res.json(), { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'jane@example.org');
  assert.equal(sent[0].subject, 'Manage your monthly gift to Astra Civic Fund');
  assert.match(sent[0].html, /\$25\.86 a month/);
  assert.equal((sent[0].html.match(/api\/portal\?t=/g) || []).length, 1);
});

test('responds identically and sends nothing when no subscription exists', async () => {
  const sent = [];
  const h = mk({ stripe: () => stripeWith([], {}), sendEmail: async m => sent.push(m), allow: () => true, env });
  const res = fakeRes();
  await h(fakeReq({ body: { email: 'jane@example.org' } }), res);
  assert.deepEqual(res.json(), { ok: true });
  assert.equal(sent.length, 0);
});

test('rejects malformed email and rate-limits', async () => {
  const h = mk({ stripe: () => ({}), sendEmail: async () => {}, allow: () => true, env });
  const res = fakeRes();
  await h(fakeReq({ body: { email: 'nope' } }), res);
  assert.equal(res.statusCode, 400);
  const limited = mk({ stripe: () => ({}), sendEmail: async () => {}, allow: () => false, env });
  const res2 = fakeRes();
  await limited(fakeReq({ body: { email: 'jane@example.org' } }), res2);
  assert.equal(res2.statusCode, 429);
});

test('portal redirects a valid token to a fresh session', async () => {
  const t = sign({ c: 'cus_1', k: 'portal' }, 'm', 60);
  const stripe = { billingPortal: { sessions: { create: async p => { assert.deepEqual(p, { customer: 'cus_1', return_url: 'https://give.example/donate' }); return { url: 'https://billing.stripe.com/p/session/x' }; } } } };
  const res = fakeRes();
  await portal.make({ stripe: () => stripe, env, allow: () => true })(fakeReq({ method: 'GET', url: `/api/portal?t=${encodeURIComponent(t)}` }), res);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, 'https://billing.stripe.com/p/session/x');
});

test('portal shows an expired page for bad tokens', async () => {
  const res = fakeRes();
  await portal.make({ stripe: () => ({}), env, allow: () => true })(fakeReq({ method: 'GET', url: '/api/portal?t=bad' }), res);
  assert.equal(res.statusCode, 410);
  assert.match(res.body, /This link has expired/);
  assert.match(res.body, /href="https:\/\/give\.example\/donate#manage"/);
});

// Security requirements beyond the brief.

test('responds 200 { ok: true } when Stripe throws, without revealing the failure', async () => {
  const sent = [];
  const boom = { customers: { list: async () => { throw new Error('No such customer: jane@example.org'); } } };
  let res;
  const logged = await captureErrors(async () => {
    const h = mk({ stripe: () => boom, sendEmail: async m => sent.push(m), allow: () => true, env });
    res = fakeRes();
    await h(fakeReq({ body: { email: 'jane@example.org' } }), res);
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  assert.equal(sent.length, 0);
  assert.equal(logged.length, 1);
  assert.ok(!logged.join('\n').includes('jane@example.org'));
});

test('responds 200 { ok: true } when getStripe itself throws (inside the try)', async () => {
  let res;
  await captureErrors(async () => {
    const h = mk({ stripe: () => { throw new Error('STRIPE_SECRET_KEY is not configured'); }, sendEmail: async () => {}, allow: () => true, env });
    res = fakeRes();
    await h(fakeReq({ body: { email: 'jane@example.org' } }), res);
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
});

test('responds 200 { ok: true } when email sending throws', async () => {
  const stripe = stripeWith([{ id: 'cus_1' }], { cus_1: [{ id: 'sub_1', status: 'active', items: { data: [{ price: { unit_amount: 2500 } }] } }] });
  let res;
  await captureErrors(async () => {
    const h = mk({ stripe: () => stripe, sendEmail: async () => { throw new Error('Resend 500'); }, allow: () => true, env });
    res = fakeRes();
    await h(fakeReq({ body: { email: 'jane@example.org' } }), res);
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
});

test('success and no-subscription responses are byte-identical', async () => {
  const withSub = stripeWith([{ id: 'cus_1' }], { cus_1: [{ id: 'sub_1', status: 'active', items: { data: [{ price: { unit_amount: 2500 } }] } }] });
  const none = stripeWith([], {});
  const a = fakeRes();
  const b = fakeRes();
  await mk({ stripe: () => withSub, sendEmail: async () => {}, allow: () => true, env })(fakeReq({ body: { email: 'jane@example.org' } }), a);
  await mk({ stripe: () => none, sendEmail: async () => {}, allow: () => true, env })(fakeReq({ body: { email: 'jane@example.org' } }), b);
  assert.equal(a.statusCode, b.statusCode);
  assert.equal(a.body, b.body);
});

test('never logs the donor email or the error message', async () => {
  const stripe = stripeWith([{ id: 'cus_1' }], { cus_1: [{ id: 'sub_1', status: 'active', items: { data: [{ price: { unit_amount: 2500 } }] } }] });
  const logged = await captureErrors(async () => {
    const h = mk({ stripe: () => stripe, sendEmail: async () => { throw new Error('Resend 502'); }, allow: () => true, env });
    await h(fakeReq({ body: { email: 'jane@example.org' } }), fakeRes());
  });
  assert.equal(logged.length, 1);
  assert.match(logged[0], /^manage failed/);
  assert.ok(!logged[0].includes('Resend 502'));
  assert.ok(!logged.join('\n').includes('jane@example.org'));
});

test('sends nothing when MANAGE_SECRET is unset, and still responds 200', async () => {
  const sent = [];
  const stripe = stripeWith([{ id: 'cus_1' }], { cus_1: [{ id: 'sub_1', status: 'active', items: { data: [{ price: { unit_amount: 2500 } }] } }] });
  let res;
  await captureErrors(async () => {
    const h = mk({ stripe: () => stripe, sendEmail: async m => sent.push(m), allow: () => true, env: { SITE_URL: 'https://give.example' } });
    res = fakeRes();
    await h(fakeReq({ body: { email: 'jane@example.org' } }), res);
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  assert.equal(sent.length, 0);
});

test('email HTML has only the site URL and the signed token, never donor input', async () => {
  const sent = [];
  const stripe = stripeWith([{ id: 'cus_1' }], { cus_1: [{ id: 'sub_1', status: 'active', items: { data: [{ price: { unit_amount: 2500 } }] } }] });
  const h = mk({ stripe: () => stripe, sendEmail: async m => sent.push(m), allow: () => true, env });
  await h(fakeReq({ body: { email: 'jane@example.org' } }), fakeRes());
  const html = sent[0].html;
  assert.ok(!html.includes('jane@example.org'));
  const urls = html.match(/href="([^"]+)"/g).map(s => s.slice(6, -1));
  assert.equal(urls.length, 1);
  assert.match(urls[0], /^https:\/\/give\.example\/api\/portal\?t=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test('portal shows the expired page when Stripe fails, not a 500', async () => {
  const t = sign({ c: 'cus_1', k: 'portal' }, 'm', 60);
  const stripe = { billingPortal: { sessions: { create: async () => { throw new Error('No such customer: jane@example.org'); } } } };
  let res;
  const logged = await captureErrors(async () => {
    res = fakeRes();
    await portal.make({ stripe: () => stripe, env, allow: () => true })(fakeReq({ method: 'GET', url: `/api/portal?t=${encodeURIComponent(t)}` }), res);
  });
  assert.equal(res.statusCode, 410);
  assert.match(res.body, /This link has expired/);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /^portal failed/);
  assert.ok(!logged.join('\n').includes('jane@example.org'));
});

test('portal shows the expired page when getStripe throws', async () => {
  const t = sign({ c: 'cus_1', k: 'portal' }, 'm', 60);
  let res;
  await captureErrors(async () => {
    res = fakeRes();
    await portal.make({ stripe: () => { throw new Error('STRIPE_SECRET_KEY is not configured'); }, env, allow: () => true })(fakeReq({ method: 'GET', url: `/api/portal?t=${encodeURIComponent(t)}` }), res);
  });
  assert.equal(res.statusCode, 410);
});

test('portal shows the expired page when MANAGE_SECRET is unset, even for a token signed elsewhere', async () => {
  const t = sign({ c: 'cus_1', k: 'portal' }, 'm', 60);
  let called = false;
  const stripe = { billingPortal: { sessions: { create: async () => { called = true; return { url: 'https://x' }; } } } };
  const res = fakeRes();
  await portal.make({ stripe: () => stripe, env: { SITE_URL: 'https://give.example' }, allow: () => true })(fakeReq({ method: 'GET', url: `/api/portal?t=${encodeURIComponent(t)}` }), res);
  assert.equal(res.statusCode, 410);
  assert.equal(called, false);
});

test('portal rejects non-GET methods', async () => {
  const res = fakeRes();
  await portal.make({ stripe: () => ({}), env, allow: () => true })(fakeReq({ method: 'POST', url: '/api/portal?t=x' }), res);
  assert.equal(res.statusCode, 405);
});

// Fix round 1.

const subItem = { items: { data: [{ price: { unit_amount: 2500 } }] } };

test('per-email limiter: exceeded returns 200 { ok: true } and never calls Stripe', async () => {
  let called = false;
  const keys = [];
  const stripe = { customers: { list: async () => { called = true; return { data: [] }; } } };
  const h = mk({ stripe: () => stripe, sendEmail: async () => {}, allow: () => true, allowEmail: k => { keys.push(k); return false; }, env });
  const res = fakeRes();
  await h(fakeReq({ body: { email: 'Jane@Example.org' } }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  assert.equal(called, false);
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^[0-9a-f]{64}$/);
  assert.ok(!keys[0].includes('jane'));
});

test('pads the response to minMs using the injected sleep', async () => {
  const sleeps = [];
  let t = 1000;
  const h = manage.make({
    stripe: () => stripeWith([], {}), sendEmail: async () => {}, allow: () => true, allowEmail: () => true, env,
    minMs: 50, now: () => t, sleep: async ms => { sleeps.push(ms); },
  });
  // Simulate 20ms of work by advancing the clock inside the Stripe call.
  const stripe = { customers: { list: async () => { t += 20; return { data: [] }; } } };
  const h2 = manage.make({ stripe: () => stripe, sendEmail: async () => {}, allow: () => true, allowEmail: () => true, env, minMs: 50, now: () => t, sleep: async ms => { sleeps.push(ms); } });
  const res = fakeRes();
  await h2(fakeReq({ body: { email: 'jane@example.org' } }), res);
  assert.deepEqual(sleeps, [30]);
  assert.equal(res.statusCode, 200);
  void h;
});

test('past_due gets a link, canceled does not; lists with status all', async () => {
  const sent = [];
  const seen = [];
  const mkStripe = status => ({
    customers: { list: async () => ({ data: [{ id: 'cus_1' }] }) },
    subscriptions: { list: async p => { seen.push(p.status); return { data: [{ id: 's', status, ...subItem }] }; } },
  });
  await mk({ stripe: () => mkStripe('past_due'), sendEmail: async m => sent.push(m), allow: () => true, env })(fakeReq({ body: { email: 'jane@example.org' } }), fakeRes());
  assert.equal(sent.length, 1);
  await mk({ stripe: () => mkStripe('canceled'), sendEmail: async m => sent.push(m), allow: () => true, env })(fakeReq({ body: { email: 'jane@example.org' } }), fakeRes());
  assert.equal(sent.length, 1);
  assert.ok(seen.every(s => s === 'all'));
});

test('manage with SITE_URL unset sends nothing, logs, and responds 200', async () => {
  const sent = [];
  const stripe = stripeWith([{ id: 'cus_1' }], { cus_1: [{ id: 's', status: 'active', ...subItem }] });
  let res;
  const logged = await captureErrors(async () => {
    res = fakeRes();
    await mk({ stripe: () => stripe, sendEmail: async m => sent.push(m), allow: () => true, env: { MANAGE_SECRET: 'm' } })(fakeReq({ body: { email: 'jane@example.org' } }), res);
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  assert.equal(sent.length, 0);
  assert.ok(logged.some(l => l.includes('manage: SITE_URL missing')));
});

test('portal with SITE_URL unset links to a relative /donate#manage, never undefined', async () => {
  const res = fakeRes();
  await portal.make({ stripe: () => ({}), env: { MANAGE_SECRET: 'm' }, allow: () => true })(fakeReq({ method: 'GET', url: '/api/portal?t=bad' }), res);
  assert.equal(res.statusCode, 410);
  assert.match(res.body, /href="\/donate#manage"/);
  assert.ok(!res.body.includes('undefined'));
});

test('portal refuses a session url on a non-Stripe host', async () => {
  const t = sign({ c: 'cus_1', k: 'portal' }, 'm', 60);
  for (const url of ['https://evil.example/p', 'https://billing.stripe.com.evil.example/p', 'not a url']) {
    const stripe = { billingPortal: { sessions: { create: async () => ({ url }) } } };
    const res = fakeRes();
    await captureErrors(async () => {
      await portal.make({ stripe: () => stripe, env, allow: () => true })(fakeReq({ method: 'GET', url: `/api/portal?t=${encodeURIComponent(t)}` }), res);
    });
    assert.equal(res.statusCode, 410, url);
    assert.equal(res.headers.location, undefined);
  }
});

test('portal rate-limits by client ip with 429 plain text', async () => {
  const res = fakeRes();
  await portal.make({ stripe: () => ({}), env, allow: () => false })(fakeReq({ method: 'GET', url: '/api/portal?t=x' }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body, 'Too many requests');
  assert.match(res.headers['content-type'], /text\/plain/);
});

// Final fixes.

test('lists customers with limit 100 and uses the shared email validator', async () => {
  let seen;
  const stripe = { customers: { list: async p => { seen = p; return { data: [] }; } } };
  const h = mk({ stripe: () => stripe, sendEmail: async () => {}, allow: () => true, env });
  const res = fakeRes();
  await h(fakeReq({ body: { email: 'jane@example.org' } }), res);
  assert.equal(seen.limit, 100);
  for (const bad of ['a@b.co>', 'ja\u200bne@example.org', 'a b@example.org']) {
    const r = fakeRes();
    await h(fakeReq({ body: { email: bad } }), r);
    assert.equal(r.statusCode, 400, bad);
  }
});

test('manage links are portal-purpose tokens and the copy no longer promises amount changes', async () => {
  const { verify } = require('../api/_lib/token');
  const sent = [];
  const stripe = stripeWith([{ id: 'cus_1' }], { cus_1: [{ id: 'sub_1', status: 'active', ...subItem }] });
  await mk({ stripe: () => stripe, sendEmail: async m => sent.push(m), allow: () => true, env })(fakeReq({ body: { email: 'jane@example.org' } }), fakeRes());
  const t = decodeURIComponent(/portal\?t=([^"&\s]+)/.exec(sent[0].html)[1]);
  const p = verify(t, 'm');
  assert.equal(p.c, 'cus_1');
  assert.equal(p.k, 'portal');
  assert.match(sent[0].html, /update your card or cancel/);
  assert.doesNotMatch(sent[0].html, /change (your|the) amount/i);
});

test('portal rejects a validly signed token that lacks the portal purpose claim', async () => {
  for (const payload of [{ c: 'cus_1' }, { c: 'cus_1', k: 'other' }]) {
    const t = sign(payload, 'm', 60);
    let called = false;
    const stripe = { billingPortal: { sessions: { create: async () => { called = true; return { url: 'https://billing.stripe.com/x' }; } } } };
    const res = fakeRes();
    await portal.make({ stripe: () => stripe, env, allow: () => true })(fakeReq({ method: 'GET', url: `/api/portal?t=${encodeURIComponent(t)}` }), res);
    assert.equal(res.statusCode, 410);
    assert.equal(called, false);
  }
});

test('portal fails closed without SITE_URL and never calls Stripe', async () => {
  const t = sign({ c: 'cus_1', k: 'portal' }, 'm', 60);
  let called = false;
  const stripe = { billingPortal: { sessions: { create: async () => { called = true; return { url: 'https://billing.stripe.com/x' }; } } } };
  const res = fakeRes();
  await portal.make({ stripe: () => stripe, env: { MANAGE_SECRET: 'm' }, allow: () => true })(fakeReq({ method: 'GET', url: `/api/portal?t=${encodeURIComponent(t)}` }), res);
  assert.equal(res.statusCode, 410);
  assert.equal(called, false);
});
