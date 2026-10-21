// One-time: creates the "Monthly gift" product and prints its ID for STRIPE_MONTHLY_PRODUCT_ID.
// Usage: STRIPE_SECRET_KEY=sk_... node scripts/stripe-setup.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

(async () => {
  const found = await stripe.products.search({ query: "metadata['astra_give']:'monthly'" });
  const product = found.data[0] || await stripe.products.create({
    name: 'Monthly contribution to Astra Civic Fund',
    metadata: { astra_give: 'monthly' },
  });
  console.log(`STRIPE_MONTHLY_PRODUCT_ID=${product.id}`);
})().catch(e => { console.error(e.message); process.exit(1); });
