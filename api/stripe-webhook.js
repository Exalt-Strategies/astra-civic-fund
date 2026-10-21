const { readRaw, send, onlyMethod, errInfo } = require('./_lib/http');
const { renderReceipt, emailLogoUrl } = require('./_lib/receipt');
const { sendEmail: realSend } = require('./_lib/mail');
const { sign } = require('./_lib/token');
const { getStripe } = require('./_lib/stripe');
const { isValidEmail } = require('./_lib/gift');
const { fromPaymentIntent, fromInvoice } = require('./_lib/stripe-data');

const RECEIPT_LINK_TTL = 7 * 24 * 3600;

function make({ stripe, sendEmail, env }) {
  const logoUrl = () => emailLogoUrl(env);

  async function onPaymentIntent(s, id, event) {
    const pi = await s.paymentIntents.retrieve(id, { expand: ['payment_method'] });
    const m = pi.metadata || {};
    if (m.kind !== 'once' || m.receipt_sent === '1') return;
    const data = fromPaymentIntent(pi, { paidAt: new Date(event.created * 1000), logoUrl: logoUrl() });
    if (!isValidEmail(data.email)) { console.error('stripe-webhook: no receipt email for', pi.id); return; }
    // Resend idempotency keys last 24h while Stripe retries for up to 3 days; the receipt_sent marker is the long-term guard.
    await sendEmail({ to: data.email.trim(), ...renderReceipt(data), idempotencyKey: `receipt-${pi.id}` });
    await s.paymentIntents.update(pi.id, { metadata: { receipt_sent: '1' } });
  }

  async function onInvoice(s, id, event) {
    const inv = await s.invoices.retrieve(id);
    if (!inv.amount_paid || (inv.metadata && inv.metadata.receipt_sent === '1')) return;
    const details = inv.parent && inv.parent.subscription_details;
    if (!details || !details.subscription) return;
    const subId = typeof details.subscription === 'string' ? details.subscription : details.subscription.id;
    if (details.metadata && details.metadata.kind && details.metadata.kind !== 'monthly') return;
    const sub = await s.subscriptions.retrieve(subId, { expand: ['default_payment_method'] });
    const kind = (details.metadata && details.metadata.kind) || (sub.metadata && sub.metadata.kind);
    if (kind !== 'monthly') return;
    const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    // Clock fixed to the event time so every retry of this event renders a byte-identical receipt.
    const token = sign({ c: customer, k: 'portal' }, env.MANAGE_SECRET, RECEIPT_LINK_TTL, () => event.created * 1000);
    const manageUrl = `${env.SITE_URL}/api/portal?t=${token}`;
    const data = fromInvoice(inv, sub, { paidAt: new Date(event.created * 1000), logoUrl: logoUrl(), manageUrl });
    if (!isValidEmail(data.email)) { console.error('stripe-webhook: no receipt email for', inv.id); return; }
    // Same 24h Resend key window applies; receipt_sent is the long-term guard.
    await sendEmail({ to: data.email.trim(), ...renderReceipt(data), idempotencyKey: `receipt-${inv.id}` });
    await s.invoices.update(inv.id, { metadata: { receipt_sent: '1' } });
  }

  return async function stripeWebhook(req, res) {
    if (!onlyMethod(req, res, 'POST')) return;
    if (!env.STRIPE_WEBHOOK_SECRET) {
      console.error('stripe-webhook: STRIPE_WEBHOOK_SECRET missing');
      return send(res, 500, { error: 'Webhook handler failed' });
    }
    if (!env.SITE_URL) {
      console.error('stripe-webhook: SITE_URL missing');
      return send(res, 500, { error: 'Webhook handler failed' });
    }
    let s;
    try { s = stripe(); } catch (e) {
      console.error('stripe-webhook: stripe client unavailable', errInfo(e));
      return send(res, 500, { error: 'Webhook handler failed' });
    }
    // Raw-body signature verification depends on never reading req.body in this handler.
    // Deployments MUST set NODEJS_HELPERS=0 (Vercel env var) so the platform does not pre-consume and parse the body
    // before this function runs; readRaw rejects with 'Body already consumed' if it did.
    let raw;
    try { raw = await readRaw(req); } catch (e) {
      // Log only the error name so a missing NODEJS_HELPERS=0 shows up in logs without echoing request data.
      console.error('stripe-webhook: could not read body', (e && e.name) || 'unknown');
      return send(res, 400, { error: 'Bad signature' });
    }
    let event;
    try {
      event = s.webhooks.constructEvent(raw, req.headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET);
    } catch {
      return send(res, 400, { error: 'Bad signature' });
    }
    try {
      if (event.type === 'payment_intent.succeeded') await onPaymentIntent(s, event.data.object.id, event);
      else if (event.type === 'invoice.paid') await onInvoice(s, event.data.object.id, event);
      return send(res, 200, { received: true });
    } catch (e) {
      console.error('stripe-webhook failed:', event.type, errInfo(e));
      return send(res, 500, { error: 'Webhook handler failed' });
    }
  };
}

module.exports = make({ stripe: getStripe, sendEmail: m => realSend(m), env: process.env });
module.exports.make = make;
