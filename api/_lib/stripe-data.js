const { receiptNo } = require('./receipt');

// Title-case every word: 'american_express' -> 'American Express'.
const titleCase = s => s.split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

// Fee is donor-entered metadata: coerce, floor at 0, cap at the charged amount.
function feeFor(m, amountCents) {
  const cap = Math.max(Number(amountCents) || 0, 0);
  return Math.round(Math.min(Math.max(Number(m.fee_cents) || 0, 0), cap));
}

function describeMethod(pm) {
  if (!pm || typeof pm !== 'object') return 'Online payment';
  if (pm.type === 'card' && pm.card) {
    const brand = titleCase(String(pm.card.display_brand || pm.card.brand || 'card').replace(/_/g, ' ')) || 'Card';
    const base = pm.card.last4 ? `${brand} ending ${pm.card.last4}` : brand;
    const wallet = pm.card.wallet && pm.card.wallet.type;
    if (wallet === 'apple_pay') return `Apple Pay (${base})`;
    if (wallet === 'google_pay') return `Google Pay (${base})`;
    return base;
  }
  if (pm.type === 'us_bank_account' && pm.us_bank_account) {
    return pm.us_bank_account.last4 ? `Bank account ending ${pm.us_bank_account.last4}` : 'Bank account';
  }
  if (pm.type === 'link') return 'Link';
  return 'Online payment';
}

/**
 * Maps a PaymentIntent to receipt data.
 * `pi.payment_method` must be an expanded object (retrieve with expand: ['payment_method']),
 * otherwise describeMethod gets a string id and the receipt shows 'Online payment'.
 */
function fromPaymentIntent(pi, { paidAt, logoUrl }) {
  const m = pi.metadata || {};
  return {
    email: m.email,
    donorName: m.name || 'Friend',
    receiptNo: receiptNo(pi.id, pi.created),
    date: paidAt,
    monthly: false,
    designation: m.designation || 'needed',
    dedication: m.dedication || '',
    method: describeMethod(pi.payment_method),
    amountCents: pi.amount_received,
    feeCents: feeFor(m, pi.amount_received),
    logoUrl,
  };
}

/**
 * Maps an Invoice plus its Subscription to receipt data.
 * `sub.default_payment_method` must be an expanded object (retrieve with expand: ['default_payment_method']),
 * otherwise describeMethod gets a string id and the receipt shows 'Online payment'.
 * Subscription metadata is the base; invoice snapshot metadata overrides it when present.
 */
function fromInvoice(inv, sub, { paidAt, logoUrl, manageUrl }) {
  const details = inv.parent && inv.parent.subscription_details;
  const m = { ...(sub.metadata || {}), ...((details && details.metadata) || {}) };
  const item = sub.items && sub.items.data && sub.items.data[0];
  const out = {
    email: inv.customer_email || m.email,
    donorName: inv.customer_name || m.name || 'Friend',
    receiptNo: receiptNo(inv.id, inv.created),
    date: paidAt,
    monthly: true,
    designation: m.designation || 'needed',
    dedication: m.dedication || '',
    method: describeMethod(sub.default_payment_method),
    amountCents: inv.amount_paid,
    feeCents: feeFor(m, inv.amount_paid),
    manageUrl,
    logoUrl,
  };
  if (item && item.current_period_end) out.nextDate = new Date(item.current_period_end * 1000);
  return out;
}

module.exports = { describeMethod, fromPaymentIntent, fromInvoice };
