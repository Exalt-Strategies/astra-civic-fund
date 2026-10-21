const DESIGNATIONS = Object.freeze({
  needed: "Where it's needed most",
  organizers: 'Organizers and chapters',
  campus: 'Campus networks',
  capacity: 'Build With Us',
  stories: 'Stories',
});
const MIN_CENTS = 500;
const MAX_CENTS = 5000000;
const EMAIL_MAX = 200;
const EMAIL_RE = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;
const AMOUNT_RE = /^\s*\d+(\.\d{1,2})?\s*$/;
// Control, format (zero-width, bidi, BOM) and line/paragraph separator characters.
// ZWNJ and ZWJ are kept in names: Indic and Persian scripts need them to spell words correctly.
const CONTROL_CHARS = /(?![\u200C\u200D])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const HAS_CONTROL_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

function feeCents(amountCents) {
  return Math.round((amountCents * 0.029 + 30) / 0.971);
}

function clean(v, max) {
  if (typeof v !== 'string') return '';
  let s = v.replace(CONTROL_CHARS, '').trim().slice(0, max);
  // Do not leave a lone high surrogate when the slice cut an emoji in half.
  if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1);
  return s;
}

// Accepts a finite number, or a plain decimal string such as '40' or '19.99'.
function parseAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && AMOUNT_RE.test(v)) return Number(v);
  return null;
}

// True only for a string that, once trimmed, is within EMAIL_MAX, has no control/format characters and looks like an address.
function isValidEmail(s) {
  if (typeof s !== 'string') return false;
  const e = s.trim();
  return e.length <= EMAIL_MAX && !HAS_CONTROL_CHARS.test(e) && EMAIL_RE.test(e);
}

function parseGift(body) {
  const b = body && typeof body === 'object' ? body : {};
  const freq = b.freq === 'monthly' || b.freq === 'once' ? b.freq : null;
  if (!freq) return { error: 'Choose one-time or monthly.' };

  const dollars = parseAmount(b.amount);
  if (dollars === null) return { error: 'Enter an amount.' };
  const amountCents = Math.round(dollars * 100);
  if (amountCents < MIN_CENTS) return { error: 'Online gifts start at $5.' };
  if (amountCents > MAX_CENTS) return { error: 'For gifts above $50,000, please write to us.' };

  const name = clean(b.name, 100);
  if (!name) return { error: 'Enter your name.' };
  // Reject, never truncate: a cut-off address would send the receipt to the wrong place.
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) {
    return { error: 'Enter a valid email for your receipt.' };
  }

  const designation = typeof b.designation === 'string' && Object.prototype.hasOwnProperty.call(DESIGNATIONS, b.designation)
    ? b.designation
    : 'needed';
  const coverFee = b.coverFee === true;
  const fee = coverFee ? feeCents(amountCents) : 0;

  return {
    gift: {
      freq, amountCents, coverFee, feeCents: fee, totalCents: amountCents + fee,
      designation, dedication: clean(b.dedication, 120), employer: clean(b.employer, 120), name, email,
    },
  };
}

function giftMetadata(g) {
  return {
    kind: g.freq, designation: g.designation, dedication: g.dedication, employer: g.employer,
    fee_cents: String(g.feeCents), name: g.name, email: g.email,
  };
}

module.exports = { DESIGNATIONS, MIN_CENTS, MAX_CENTS, feeCents, parseGift, giftMetadata, isValidEmail };
