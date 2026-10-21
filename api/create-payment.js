const { readJson, send, clientIp, onlyMethod, errInfo } = require('./_lib/http');
const { parseGift, giftMetadata } = require('./_lib/gift');
const { receiptNo } = require('./_lib/receipt');
const { makeLimiter } = require('./_lib/ratelimit');
const { getStripe } = require('./_lib/stripe');

const GENERIC_ERROR = 'We could not start the payment. Please try again.';

function make({ stripe, allow, env }) {
  return async function createPayment(req, res) {
    if (!onlyMethod(req, res, 'POST')) return;
    if (!allow(clientIp(req))) return send(res, 429, { error: 'Too many attempts. Please wait a minute and try again.' });

    const { gift, error } = parseGift(await readJson(req));
    if (error) return send(res, 400, { error });

    // Fail closed: without the product ID, Stripe would create a subscription on no product.
    if (gift.freq === 'monthly' && !env.STRIPE_MONTHLY_PRODUCT_ID) {
      console.error('create-payment: STRIPE_MONTHLY_PRODUCT_ID missing');
      return send(res, 502, { error: GENERIC_ERROR });
    }

    const metadata = giftMetadata(gift);
    try {
      const s = stripe();
      if (gift.freq === 'once') {
        const pi = await s.paymentIntents.create({
          amount: gift.totalCents,
          currency: 'usd',
          automatic_payment_methods: { enabled: true },
          description: 'Contribution to Astra Civic Fund',
          metadata,
        });
        return send(res, 200, { clientSecret: pi.client_secret, receiptNo: receiptNo(pi.id, pi.created) });
      }

      const customer = await s.customers.create({ name: gift.name, email: gift.email, metadata: { source: 'give' } });
      const sub = await s.subscriptions.create({
        customer: customer.id,
        items: [{ price_data: { currency: 'usd', product: env.STRIPE_MONTHLY_PRODUCT_ID, unit_amount: gift.totalCents, recurring: { interval: 'month' } } }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        metadata,
        expand: ['latest_invoice.confirmation_secret'],
      });
      const inv = sub.latest_invoice;
      return send(res, 200, { clientSecret: inv.confirmation_secret.client_secret, receiptNo: receiptNo(inv.id, inv.created) });
    } catch (e) {
      console.error('create-payment failed:', errInfo(e));
      return send(res, 502, { error: GENERIC_ERROR });
    }
  };
}

module.exports = make({ stripe: getStripe, allow: makeLimiter({ limit: 10, windowMs: 60_000 }), env: process.env });
module.exports.make = make;
