function readRaw(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    // If something already drained the stream (for example a platform body helper), no data or end event will ever arrive.
    if (req.readableEnded || (req.complete && req.readableDidRead && req.readableLength === 0)) {
      reject(new Error('Body already consumed'));
      return;
    }
    const chunks = [];
    let total = 0;
    let done = false;
    req.on('data', c => {
      if (done) return;
      const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
      total += b.length;
      if (total > limit) {
        done = true;
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(b);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', e => { if (!done) { done = true; reject(e); } });
  });
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw;
  try { raw = (await readRaw(req)).toString('utf8'); }
  catch { return null; }
  if (!raw) return {};
  let value;
  try { value = JSON.parse(raw); } catch { return null; }
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

// Safe-to-log summary of a Stripe, PayPal, Resend or fetch error. Never includes e.message, which can echo donor details.
function errInfo(e) {
  const o = e && typeof e === 'object' ? e : {};
  return [['name', o.name], ['type', o.type], ['code', o.code], ['status', o.statusCode || o.status], ['requestId', o.requestId], ['issue', o.issue]]
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${String(v).slice(0, 80)}`)
    .join(' ');
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function clientIp(req) {
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  const f = req.headers['x-forwarded-for'];
  return (typeof f === 'string' && f.split(',')[0].trim()) || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function onlyMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  send(res, 405, { error: 'Method not allowed' });
  return false;
}

function query(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

module.exports = { errInfo, readRaw, readJson, send, clientIp, onlyMethod, query };
