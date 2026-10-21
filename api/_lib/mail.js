async function sendEmail({ to, subject, html, text, idempotencyKey }, { fetch = globalThis.fetch, env = process.env } = {}) {
  if (!env.RESEND_API_KEY) throw new Error('Email is not configured');
  if (typeof to !== 'string' || !to.trim()) throw new Error('Invalid recipient');
  const headers = { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: env.RECEIPT_FROM || 'Astra Civic Fund <giving@astracivic.org>',
      reply_to: env.RECEIPT_REPLY_TO || 'info@astracivic.org',
      to: [to], subject, html, text,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (r.status === 409) {
    // Only a replay of an already-accepted request is a duplicate. A concurrent or unknown 409 may not have been sent, so retry.
    const j = await r.json().catch(() => null);
    if (j && j.name === 'invalid_idempotent_request') return { duplicate: true };
    throw Object.assign(new Error('Resend 409'), { statusCode: 409 });
  }
  // Never include the response body: it can echo donor PII.
  if (!r.ok) throw Object.assign(new Error(`Resend ${r.status}`), { statusCode: r.status });
  return r.json();
}

module.exports = { sendEmail };
