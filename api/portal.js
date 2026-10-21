const { onlyMethod, query, clientIp } = require('./_lib/http');
const { makeLimiter } = require('./_lib/ratelimit');
const { verify } = require('./_lib/token');
const { getStripe } = require('./_lib/stripe');

function expired(res, env) {
  res.statusCode = 410;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link expired</title>
<body style="margin:0;background:#f7f7f7;color:#1c1c1a;font:16px/1.55 Helvetica,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;">
<div style="max-width:440px;"><p style="font:400 28px Georgia,serif;margin:0 0 12px;">This link has expired.</p>
<p style="margin:0 0 20px;color:#5a574d;">Links to manage a monthly gift only work for a limited time. You can request a new one in a few seconds.</p>
<a href="${env.SITE_URL ? `${env.SITE_URL}/donate#manage` : '/donate#manage'}" style="color:#405742;font-weight:600;">Request a new link</a></div></body>`);
}

function stripeHost(url) {
  try {
    const h = new URL(url).hostname;
    return h === 'billing.stripe.com' || h.endsWith('.stripe.com');
  } catch { return false; }
}

function make({ stripe, env, allow }) {
  return async function portal(req, res) {
    if (!onlyMethod(req, res, 'GET')) return;
    if (!allow(clientIp(req))) {
      res.statusCode = 429;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.end('Too many requests');
    }
    if (!env.SITE_URL) return expired(res, env);
    const p = verify(query(req).get('t'), env.MANAGE_SECRET);
    if (!p || typeof p.c !== 'string' || p.k !== 'portal') return expired(res, env);
    try {
      const session = await stripe().billingPortal.sessions.create({ customer: p.c, return_url: `${env.SITE_URL}/donate` });
      if (!session || !stripeHost(session.url)) return expired(res, env);
      res.statusCode = 302;
      res.setHeader('Location', session.url);
      res.setHeader('Cache-Control', 'no-store');
      res.end();
    } catch (e) {
      console.error('portal failed', e && e.type, e && e.code);
      expired(res, env);
    }
  };
}

module.exports = make({ stripe: getStripe, env: process.env, allow: makeLimiter({ limit: 20, windowMs: 60_000 }) });
module.exports.make = make;
