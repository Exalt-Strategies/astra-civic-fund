const crypto = require('crypto');
const { readJson, send, clientIp, onlyMethod } = require('./_lib/http');
const { money } = require('./_lib/receipt');
const { makeLimiter } = require('./_lib/ratelimit');
const { sign } = require('./_lib/token');
const { sendEmail: realSend } = require('./_lib/mail');
const { getStripe } = require('./_lib/stripe');
const { isValidEmail } = require('./_lib/gift');

const LINK_TTL = 24 * 3600;
const MANAGEABLE = new Set(['active', 'trialing', 'past_due', 'unpaid']);
const realSleep = ms => new Promise(r => setTimeout(r, ms));

function emailHtml(links) {
  const rows = links.map(l => `<p style="margin:0 0 14px;"><a href="${l.url}" style="display:inline-block;background:#405742;color:#f7f7f7;text-decoration:none;font-weight:600;padding:12px 22px;">Manage ${l.label}</a></p>`).join('');
  return `<div style="font-family:Helvetica,Arial,sans-serif;color:#1c1c1a;max-width:560px;margin:0 auto;padding:24px;">
<p style="font:400 24px Georgia,serif;margin:0 0 14px;">Manage your monthly gift</p>
<p style="font-size:15px;line-height:1.55;color:#5a574d;margin:0 0 20px;">Use the link below to update your card or cancel. For your security it works for 24 hours.</p>
${rows}
<p style="font-size:13px;line-height:1.55;color:#7b7666;margin:20px 0 0;">If you did not ask for this, you can ignore this email. Questions? Write to info@astracivic.org.<br>Astra Civic Fund · astracivic.org</p>
</div>`;
}

function make({ stripe, sendEmail, allow, allowEmail, env, minMs = 1200, sleep = realSleep, now = Date.now }) {
  return async function manage(req, res) {
    if (!onlyMethod(req, res, 'POST')) return;
    if (!allow(clientIp(req))) return send(res, 429, { error: 'Too many requests. Please wait a minute and try again.' });
    const body = (await readJson(req)) || {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) return send(res, 400, { error: 'Enter a valid email.' });

    const started = now();
    const hash = crypto.createHash('sha256').update(email).digest('hex');
    if (allowEmail(hash)) {
      try {
        if (!env.SITE_URL) {
          console.error('manage: SITE_URL missing');
        } else {
          const s = stripe();
          const customers = await s.customers.list({ email, limit: 100 });
          const links = [];
          for (const c of customers.data) {
            const subs = await s.subscriptions.list({ customer: c.id, status: 'all', limit: 10 });
            const sub = subs.data.find(x => MANAGEABLE.has(x.status));
            if (!sub) continue;
            const item = sub.items && sub.items.data[0];
            const amount = item && item.price && item.price.unit_amount;
            links.push({
              url: `${env.SITE_URL}/api/portal?t=${encodeURIComponent(sign({ c: c.id, k: 'portal' }, env.MANAGE_SECRET, LINK_TTL))}`,
              label: amount ? `my ${money(amount)} a month gift` : 'my monthly gift',
            });
          }
          if (links.length) {
            await sendEmail({
              to: email,
              subject: 'Manage your monthly gift to Astra Civic Fund',
              html: emailHtml(links),
              text: `Use these links to manage your monthly gift (valid for 24 hours):\n${links.map(l => l.url).join('\n')}`,
            });
          }
        }
      } catch (e) {
        console.error('manage failed', e && e.type, e && e.code);
      }
    }
    await sleep(Math.max(0, minMs - (now() - started)));
    return send(res, 200, { ok: true });
  };
}

module.exports = make({
  stripe: getStripe,
  sendEmail: m => realSend(m),
  allow: makeLimiter({ limit: 5, windowMs: 60_000 }),
  allowEmail: makeLimiter({ limit: 3, windowMs: 60 * 60_000 }),
  env: process.env,
});
module.exports.make = make;
