// GET /api/weekly-digest: the Monday roundup email to ALERT_EMAIL.
// Called by Vercel Cron (vercel.json), which sends "Authorization: Bearer <CRON_SECRET>".
// Fails closed: no secret, a short secret, or a recipient outside astracivic.org means nothing is sent.
const crypto = require('crypto');
const { send, onlyMethod, errInfo } = require('./_lib/http');
const { sendEmail: realSend } = require('./_lib/mail');
const { getStripe } = require('./_lib/stripe');
const { alertRecipient, buildDigest, renderDigest, nyKey } = require('./_lib/staff');

const MIN_SECRET = 16;

function bearerMatches(header, secret) {
  const want = Buffer.from(`Bearer ${secret}`, 'utf8');
  const got = Buffer.from(typeof header === 'string' ? header : '', 'utf8');
  if (got.length !== want.length) { crypto.timingSafeEqual(want, want); return false; }
  return crypto.timingSafeEqual(got, want);
}

function make({ stripe, sendEmail, env, now = () => new Date() }) {
  return async function weeklyDigest(req, res) {
    if (!onlyMethod(req, res, 'GET')) return;
    res.setHeader('Cache-Control', 'no-store');
    const secret = env.CRON_SECRET;
    if (!secret || secret.length < MIN_SECRET) { console.error('weekly-digest: CRON_SECRET not configured'); return send(res, 500, { error: 'Not configured' }); }
    if (!bearerMatches(req.headers.authorization, secret)) return send(res, 401, { error: 'Unauthorized' });
    const to = alertRecipient(env);
    if (!to) { console.error('weekly-digest: ALERT_EMAIL is not an @astracivic.org address'); return send(res, 500, { error: 'Not configured' }); }
    try {
      const at = now();
      const r = renderDigest(await buildDigest(stripe(), at));
      // One roundup per New York date, even if the cron fires twice.
      await sendEmail({ to, ...r, idempotencyKey: `weekly-digest-${nyKey(at)}` });
      return send(res, 200, { ok: true });
    } catch (e) {
      console.error('weekly-digest failed', errInfo(e));
      return send(res, 502, { error: 'Digest failed' });
    }
  };
}

module.exports = make({ stripe: getStripe, sendEmail: m => realSend(m), env: process.env });
module.exports.make = make;
