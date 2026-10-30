// Sets up a Stripe account (live or test) for astracivic.org/donate through the API:
// the monthly product, the webhook endpoint, the customer portal, and the Apple Pay domain.
// Prints one JSON line for the calling script: {"product":"prod_...","webhookSecret":"whsec_..." or "" if it already existed}.
// Usage: STRIPE_SECRET_KEY=sk_... node scripts/stripe-go-live.js [--site https://astracivic.org]
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const SITE = (process.argv.includes('--site') ? process.argv[process.argv.indexOf('--site') + 1] : 'https://astracivic.org').replace(/\/+$/, '');
const HOOK_URL = `${SITE}/api/stripe-webhook`;
const EVENTS = ['payment_intent.succeeded', 'invoice.paid'];
const log = m => process.stderr.write(m + '\n');

(async () => {
  // 1. Monthly product (reused if it already exists)
  const found = await stripe.products.search({ query: "metadata['astra_give']:'monthly'" });
  const product = found.data[0] || await stripe.products.create({ name: 'Monthly contribution to Astra Civic Fund', metadata: { astra_give: 'monthly' } });
  log(`  Monthly product: ${product.id}`);

  // 2. Webhook endpoint. A signing secret is only shown when an endpoint is created,
  //    so an existing endpoint for the same URL is replaced.
  const existing = (await stripe.webhookEndpoints.list({ limit: 100 })).data.filter(w => w.url === HOOK_URL);
  for (const w of existing) { await stripe.webhookEndpoints.del(w.id); log(`  Replaced old webhook ${w.id}`); }
  const hook = await stripe.webhookEndpoints.create({ url: HOOK_URL, enabled_events: EVENTS, description: 'astracivic.org/donate receipts' });
  log(`  Webhook: ${HOOK_URL} (${EVENTS.join(', ')})`);

  // 3. Customer portal: donors can update their card, see invoices and cancel; nothing else.
  const portal = {
    business_profile: { headline: 'Manage your monthly gift to Astra Civic Fund' },
    features: {
      customer_update: { enabled: false },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
      subscription_update: { enabled: false },
    },
  };
  const def = (await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 })).data[0];
  if (def) { await stripe.billingPortal.configurations.update(def.id, portal); log('  Customer portal: updated'); }
  else { await stripe.billingPortal.configurations.create(portal); log('  Customer portal: created'); }

  // 4. Apple Pay / Google Pay domain
  const domain = new URL(SITE).hostname;
  const doms = (await stripe.paymentMethodDomains.list({ domain_name: domain, limit: 1 })).data;
  if (!doms.length) { await stripe.paymentMethodDomains.create({ domain_name: domain }); log(`  Wallet domain: ${domain} added`); }
  else log(`  Wallet domain: ${domain} already registered`);

  process.stdout.write(JSON.stringify({ product: product.id, webhookId: hook.id, webhookSecret: hook.secret || '' }) + '\n');
})().catch(e => { log(`  Stripe error: ${e.message}`); process.exit(1); });
