let client;

function getStripe() {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
    client = require('stripe')(key, { apiVersion: '2026-09-30.endive' });
  }
  return client;
}

module.exports = { getStripe };
