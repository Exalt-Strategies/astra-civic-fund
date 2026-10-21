const test = require('node:test');
const assert = require('node:assert/strict');
const { DESIGNATIONS, feeCents, parseGift, giftMetadata, isValidEmail } = require('../api/_lib/gift');

const base = { freq: 'once', amount: 100, coverFee: false, designation: 'needed', name: 'Jane Doe', email: 'Jane@Example.org' };

test('feeCents matches the front-end formula', () => {
  assert.equal(feeCents(10000), 330);
  assert.equal(feeCents(500), 46);
  assert.equal(feeCents(2500), 106);
});

test('parseGift accepts a valid one-time gift and normalises email', () => {
  const { gift, error } = parseGift(base);
  assert.equal(error, undefined);
  assert.deepEqual(gift, {
    freq: 'once', amountCents: 10000, coverFee: false, feeCents: 0, totalCents: 10000,
    designation: 'needed', dedication: '', employer: '', name: 'Jane Doe', email: 'jane@example.org',
  });
});

test('parseGift adds the fee when coverFee is true', () => {
  const { gift } = parseGift({ ...base, coverFee: true });
  assert.equal(gift.feeCents, 330);
  assert.equal(gift.totalCents, 10330);
});

test('parseGift rounds amounts to cents', () => {
  assert.equal(parseGift({ ...base, amount: 19.999 }).gift.amountCents, 2000);
  assert.equal(parseGift({ ...base, amount: '40' }).gift.amountCents, 4000);
});

test('parseGift enforces min and max', () => {
  assert.equal(parseGift({ ...base, amount: 4.99 }).error, 'Online gifts start at $5.');
  assert.equal(parseGift({ ...base, amount: 50000.01 }).error, 'For gifts above $50,000, please write to us.');
  assert.ok(parseGift({ ...base, amount: 50000 }).gift);
  assert.equal(parseGift({ ...base, amount: 'abc' }).error, 'Enter an amount.');
});

test('parseGift accepts only a finite number or a plain decimal string for amount', () => {
  for (const amount of [[100], true, '  ', '1e3', '0x10', Infinity, NaN, undefined, null, '']) {
    assert.equal(parseGift({ ...base, amount }).error, 'Enter an amount.', `amount ${String(amount)}`);
  }
  assert.equal(parseGift({ ...base, amount: '40' }).gift.amountCents, 4000);
});

test('parseGift rejects bad frequency, name and email', () => {
  assert.equal(parseGift({ ...base, freq: 'weekly' }).error, 'Choose one-time or monthly.');
  assert.equal(parseGift({ ...base, name: '   ' }).error, 'Enter your name.');
  assert.equal(parseGift({ ...base, email: 'nope' }).error, 'Enter a valid email for your receipt.');
  assert.equal(parseGift(null).error, 'Choose one-time or monthly.');
});

test('parseGift rejects unsafe and overlong emails instead of truncating them', () => {
  assert.equal(parseGift({ ...base, email: 'a<b>@x.org' }).error, 'Enter a valid email for your receipt.');
  const long = 'a'.repeat(195) + '@x.org';
  assert.equal(long.length, 201);
  assert.equal(parseGift({ ...base, email: long }).error, 'Enter a valid email for your receipt.');
});

test('parseGift falls back to needed for unknown designations', () => {
  assert.equal(parseGift({ ...base, designation: '__proto__' }).gift.designation, 'needed');
  assert.equal(parseGift({ ...base, designation: 'campus' }).gift.designation, 'campus');
});

test('parseGift only accepts string designations that are known keys', () => {
  assert.equal(parseGift({ ...base, designation: ['campus'] }).gift.designation, 'needed');
  assert.equal(parseGift({ ...base, designation: {} }).gift.designation, 'needed');
});

test('DESIGNATIONS is frozen', () => {
  assert.equal(Object.isFrozen(DESIGNATIONS), true);
});

test('coverFee is true only for the boolean true', () => {
  for (const coverFee of ['true', 1, 'false']) {
    const { gift } = parseGift({ ...base, coverFee });
    assert.equal(gift.coverFee, false, `coverFee ${String(coverFee)}`);
    assert.equal(gift.feeCents, 0, `coverFee ${String(coverFee)}`);
    assert.equal(gift.totalCents, 10000, `coverFee ${String(coverFee)}`);
  }
});

test('parseGift strips C1, bidi and zero-width characters', () => {
  assert.equal(parseGift({ ...base, dedication: 'Pri‮ya' }).gift.dedication, 'Priya');
  assert.equal(parseGift({ ...base, name: 'Jane​ Doe\u0085' }).gift.name, 'Jane Doe');
});

test('parseGift does not leave a lone high surrogate at the length cut', () => {
  const { gift } = parseGift({ ...base, dedication: 'x'.repeat(119) + '\u{1F600}' });
  assert.equal(gift.dedication, 'x'.repeat(119));
  assert.doesNotMatch(gift.dedication, /[\ud800-\udbff]$/);
});

test('parseGift strips control characters and trims long text', () => {
  const { gift } = parseGift({ ...base, dedication: 'Priya\u0000 Doe' + 'x'.repeat(200), employer: 7 });
  assert.equal(gift.dedication.slice(0, 9), 'Priya Doe');
  assert.equal(gift.dedication.length, 120);
  assert.equal(gift.employer, '');
});

test('giftMetadata returns string values only', () => {
  const { gift } = parseGift({ ...base, freq: 'monthly', coverFee: true, dedication: 'Priya' });
  assert.deepEqual(giftMetadata(gift), {
    kind: 'monthly', designation: 'needed', dedication: 'Priya', employer: '',
    fee_cents: '330', name: 'Jane Doe', email: 'jane@example.org',
  });
  assert.equal(Object.keys(DESIGNATIONS).length, 5);
});

test('isValidEmail accepts only well-formed, clean, bounded strings', () => {
  assert.equal(isValidEmail('jane@example.org'), true);
  assert.equal(isValidEmail('  jane@example.org  '), true);
  assert.equal(isValidEmail('   '), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail('ja\u200bne@example.org'), false);
  assert.equal(isValidEmail('a'.repeat(196) + '@b.co'), false);
  for (const v of [null, undefined, 42, {}, ['a@b.co']]) assert.equal(isValidEmail(v), false);
});

test('names keep ZWJ and ZWNJ but lose other format and bidi controls', () => {
  const { parseGift } = require('../api/_lib/gift');
  const base = { freq: 'once', amount: 25, email: 'jane@example.org' };
  const joiner = 'क\u094D\u200Dष';
  const nonJoiner = 'می\u200Cخواهم';
  assert.equal(parseGift({ ...base, name: 'Priyanka ' + joiner }).gift.name, 'Priyanka ' + joiner);
  assert.equal(parseGift({ ...base, name: nonJoiner }).gift.name, nonJoiner);
  assert.equal(parseGift({ ...base, name: 'Eve\u202E', dedication: 'a\u200Bb\u2066c\uFEFFd' }).gift.name, 'Eve');
  assert.equal(parseGift({ ...base, name: 'Eve', dedication: 'a\u200Bb\u2066c\uFEFFd' }).gift.dedication, 'abcd');
  assert.equal(isValidEmail('ja\u200dne@example.org'), false);
  assert.equal(isValidEmail('ja\u200cne@example.org'), false);
});
