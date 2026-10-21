const test = require('node:test');
const assert = require('node:assert/strict');
const { receiptNo, money, renderReceipt, emailAssetBase, emailLogoUrl } = require('../api/_lib/receipt');

const base = {
  donorName: 'Jane Doe', receiptNo: 'AST-2026-ABCD1234', date: new Date('2026-10-09T16:00:00Z'),
  monthly: false, designation: 'needed', dedication: '', method: 'Visa ending 4242',
  amountCents: 10330, feeCents: 330, logoUrl: 'https://give.example/brand/astra-wordmark-white.png',
};

test('receiptNo uses the created year and last 8 id chars', () => {
  assert.equal(receiptNo('pi_3QabcdEFgh12345678', 1791590400), 'AST-2026-12345678');
  assert.equal(receiptNo('in_1x_y-zz', 1767225600), 'AST-2026-IN1XYZZ');
});

test('money formats cents as US dollars', () => {
  assert.equal(money(10330), '$103.30');
  assert.equal(money(500000000), '$5,000,000.00');
});

test('one-time receipt has subject, amounts, IRS statement and no monthly block', () => {
  const r = renderReceipt(base);
  assert.equal(r.subject, 'Your receipt from Astra Civic Fund');
  assert.match(r.html, /Thank you, Jane\./);
  assert.match(r.html, /\$103\.30/);
  assert.match(r.html, /Includes \$3\.30 you added/);
  assert.match(r.html, /October 9, 2026/);
  assert.match(r.html, /not tax-deductible/);
  assert.match(r.html, /No goods or services were provided in exchange for this contribution/);
  assert.doesNotMatch(r.html, /Manage my monthly gift/);
  assert.doesNotMatch(r.html, /In honor or memory of/);
  assert.doesNotMatch(r.html, /\{\{|<!--IF/);
  assert.match(r.text, /Receipt number: AST-2026-ABCD1234/);
  assert.match(r.text, /No goods or services were provided/);
});

test('fee line disappears when no fee was added', () => {
  assert.doesNotMatch(renderReceipt({ ...base, feeCents: 0 }).html, /you added to cover/);
});

test('monthly receipt shows next date, manage link and month in subject', () => {
  const r = renderReceipt({ ...base, monthly: true, nextDate: new Date('2026-11-09T16:00:00Z'), manageUrl: 'https://give.example/api/portal?t=a.b' });
  assert.equal(r.subject, 'Your October 2026 receipt from Astra Civic Fund');
  assert.match(r.html, /scheduled for November 9, 2026/);
  assert.match(r.html, /href="https:\/\/give\.example\/api\/portal\?t=a\.b"/);
  assert.match(r.html, /Monthly/);
});

test('donor-supplied text is HTML-escaped', () => {
  const r = renderReceipt({ ...base, donorName: '<b>Eve</b> X', dedication: '<script>alert(1)</script>' });
  assert.doesNotMatch(r.html, /<script>alert/);
  assert.match(r.html, /&lt;script&gt;/);
  assert.match(r.html, /In honor or memory of/);
});

test('designation key is shown as its label', () => {
  assert.match(renderReceipt({ ...base, designation: 'capacity' }).html, /Build With Us/);
  assert.match(renderReceipt({ ...base, designation: 'bogus' }).html, /Where it&#39;s needed most/);
});

test('inherited object keys fall back to the default designation label', () => {
  for (const key of ['constructor', '__proto__']) {
    const html = renderReceipt({ ...base, designation: key }).html;
    assert.match(html, /Where it&#39;s needed most/, key);
    assert.doesNotMatch(html, /function/, key);
    assert.doesNotMatch(html, /\[object Object\]/, key);
  }
});

test('missing donor name does not throw and falls back to friend', () => {
  const r = renderReceipt({ ...base, donorName: undefined });
  assert.match(r.html, /Thank you, friend\./);
  assert.match(r.text, /Thank you, friend\./);
  assert.match(r.text, /Donor: Friend/);
});

test('text version collapses line breaks in donor-supplied values', () => {
  const r = renderReceipt({ ...base, dedication: 'A\r\nBcc: x' });
  assert.match(r.text, /In honor or memory of: A Bcc: x\n/);
  assert.doesNotMatch(r.text, /A\r?\nBcc/);
});

test('monthly block is omitted when manageUrl is missing', () => {
  const r = renderReceipt({ ...base, monthly: true, nextDate: new Date('2026-11-09T16:00:00Z') });
  assert.doesNotMatch(r.html, /Manage my monthly gift/);
  assert.doesNotMatch(r.html, /href=""/);
  assert.doesNotMatch(r.text, /scheduled for/);
  assert.doesNotMatch(r.text, /Manage your monthly gift/);
});

test('monthly block is omitted when nextDate is missing', () => {
  const r = renderReceipt({ ...base, monthly: true, manageUrl: 'https://give.example/api/portal?t=a.b' });
  assert.doesNotMatch(r.html, /Manage my monthly gift/);
  assert.doesNotMatch(r.text, /Manage your monthly gift/);
});

test('manage URL is attribute-escaped', () => {
  const r = renderReceipt({ ...base, monthly: true, nextDate: new Date('2026-11-09T16:00:00Z'), manageUrl: 'https://x/?a="><script>' });
  assert.match(r.html, /&quot;&gt;&lt;script&gt;/);
  assert.doesNotMatch(r.html, /"><script>/);
});

test('donor name HTML is escaped', () => {
  const r = renderReceipt({ ...base, donorName: '<b>Eve</b>' });
  assert.match(r.html, /&lt;b&gt;Eve&lt;\/b&gt;/);
});

test('template placeholders in dedication render literally and add no monthly block', () => {
  const r = renderReceipt({ ...base, dedication: '{{receipt_no}} <!--IF monthly-->' });
  assert.match(r.html, /\{\{receipt_no\}\}/);
  assert.doesNotMatch(r.html, /Manage my monthly gift/);
  assert.equal(r.html.split('{{receipt_no}}').length - 1, 1);
});

test('monthly text states the next date and manage URL', () => {
  const r = renderReceipt({ ...base, monthly: true, nextDate: new Date('2026-11-09T16:00:00Z'), manageUrl: 'https://give.example/api/portal?t=a.b' });
  assert.match(r.text, /scheduled for November 9, 2026/);
  assert.match(r.text, /https:\/\/give\.example\/api\/portal\?t=a\.b/);
});

test('one-time text with fee states the fee line', () => {
  const r = renderReceipt(base);
  assert.match(r.text, /\(includes \$3\.30 you added to cover processing fees\)/);
});

test('monthly receipt promises updating the card or cancelling, not changing the amount', () => {
  const r = renderReceipt({ ...base, monthly: true, nextDate: new Date('2026-11-09T16:00:00Z'), manageUrl: 'https://give.example/api/portal?t=a.b' });
  assert.match(r.html, /update your card or cancel at any time/);
  assert.doesNotMatch(r.html, /change (your|the) amount/i);
  assert.doesNotMatch(r.text, /change (your|the) amount/i);
});

test('emailAssetBase: localhost falls back to production', () => {
  assert.equal(emailAssetBase({ SITE_URL: 'http://localhost:4358' }), 'https://astracivic.org');
  assert.equal(emailAssetBase({ SITE_URL: 'http://127.0.0.1:4358' }), 'https://astracivic.org');
});
test('emailAssetBase: EMAIL_ASSET_URL wins, https SITE_URL used as-is', () => {
  assert.equal(emailAssetBase({ SITE_URL: 'http://localhost:1', EMAIL_ASSET_URL: 'https://cdn.example' }), 'https://cdn.example');
  assert.equal(emailAssetBase({ SITE_URL: 'https://give.example' }), 'https://give.example');
  assert.equal(emailLogoUrl({ SITE_URL: 'https://give.example' }), 'https://give.example/brand/astra-wordmark-white.png');
});
test('receipt logo img has readable alt styling', () => {
  assert.match(renderReceipt(base).html, /<img[^>]*color:#f7f7f7;font:600 16px/);
});
