const crypto = require('crypto');

function mac(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

function sign(payload, secret, ttlSec, now = Date.now) {
  if (!secret) throw new Error('Signing secret is not configured');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(now() / 1000) + ttlSec })).toString('base64url');
  return `${body}.${mac(body, secret)}`;
}

function verify(token, secret, now = Date.now) {
  if (typeof token !== 'string' || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(body, secret));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!p || typeof p.exp !== 'number' || p.exp < Math.floor(now() / 1000)) return null;
  return p;
}

module.exports = { sign, verify };
