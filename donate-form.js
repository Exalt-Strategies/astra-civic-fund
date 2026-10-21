/* Donate page: the giving panel. donate.js adds Stripe on top of window.Give. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const AMTS = { once: [25, 50, 100, 250, 500], monthly: [10, 25, 50, 100, 250] };
  const DEFAULT = { once: 100, monthly: 25 };
  const DESIG = {
    needed: "where it's needed most",
    organizers: 'organizers and chapters',
    campus: 'campus networks',
    capacity: 'Build With Us',
    stories: 'Stories',
  };
  const state = { freq: 'once', amt: DEFAULT.once, desig: 'needed' };
  const panel = $('#panel'), chips = $('#chips'), custom = $('#customAmt'), freq = $('.freq');
  const fmt = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const feeCents = c => Math.round((c * 0.029 + 30) / 0.971);
  const fee = n => feeCents(Math.round(n * 100)) / 100;
  const listeners = [];
  let busy = false;

  function renderChips() {
    chips.innerHTML = '';
    AMTS[state.freq].forEach(v => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = fmt(v); b.dataset.v = v;
      b.setAttribute('aria-pressed', String(v === state.amt && !custom.value));
      b.onclick = () => { custom.value = ''; state.amt = v; update(); };
      chips.appendChild(b);
    });
  }

  function update() {
    $$('button', chips).forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === state.amt && !custom.value)));
    const amt = state.amt, per = state.freq === 'monthly' ? '/month' : '';
    $('#perLbl').textContent = per;
    const cover = $('#cover').checked && amt >= 5 ? fee(amt) : 0;
    $('#coverAmt').textContent = fmt(amt >= 5 ? fee(amt) : 0);
    const hint = $('#amtHint'), btn = $('#giveBtn');
    // While busy the button stays on "Processing..."; its label is recomputed here once busy ends.
    if (!amt || amt < 5) { hint.innerHTML = 'Online gifts start at <b>$5</b>.'; if (!busy) { btn.disabled = true; btn.textContent = 'Give'; } }
    else if (amt > 50000) { hint.innerHTML = 'For gifts above $50,000, <a href="mailto:info@astracivic.org">write to us</a> and we will arrange it directly.'; if (!busy) { btn.disabled = true; btn.textContent = 'Give'; } }
    else {
      hint.innerHTML = state.freq === 'monthly' ? 'That is <b>' + fmt(amt * 12) + '</b> a year of steady support.' : '';
      if (!busy) {
        btn.disabled = false;
        btn.textContent = 'Give ' + fmt(Math.round((amt + cover) * 100) / 100) + per;
      }
    }
    $('#summary').textContent = 'Your ' + (state.freq === 'monthly' ? 'monthly' : 'one-time') + ' gift supports ' + DESIG[state.desig] + '.';
    panel.classList.toggle('monthly-on', state.freq === 'monthly');
    listeners.forEach(fn => fn());
  }

  $$('button', freq).forEach(b => b.onclick = () => {
    state.freq = b.dataset.freq;
    $$('button', freq).forEach(x => x.setAttribute('aria-checked', String(x === b)));
    freq.classList.toggle('monthly', state.freq === 'monthly');
    custom.value = ''; state.amt = DEFAULT[state.freq];
    renderChips(); update();
  });
  custom.addEventListener('input', () => {
    const v = parseFloat(custom.value.replace(/[^0-9.]/g, ''));
    state.amt = isNaN(v) ? 0 : v; update();
  });
  $$('#desig button').forEach(b => b.onclick = () => {
    state.desig = b.dataset.d;
    $$('#desig button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    update();
  });
  $('#cover').addEventListener('change', update);

  function totalCents() {
    const a = Math.round(state.amt * 100);
    return a + ($('#cover').checked && a >= 500 ? feeCents(a) : 0);
  }

  // Controls go inert so nothing can change mid-payment.
  function setBusy(b) {
    busy = b;
    $$('.panel-sec', panel).forEach(el => { el.inert = b; });
    const btn = $('#giveBtn');
    if (b) { btn.disabled = true; btn.textContent = 'Processing…'; }
    else update();
  }

  function showThanks({ receiptNo, pending, amountCents, email, freq: f }) {
    const per = (f || state.freq) === 'monthly' ? '/month' : '';
    const amt = fmt((amountCents != null ? amountCents : totalCents()) / 100) + per;
    const em = (email || '').trim() || $('#donorEmail').value.trim();
    $('#tyAmt').textContent = amt; $('#tyEmail').textContent = em || 'your inbox';
    $('#tyAmt2').textContent = amt; $('#tyEmail2').textContent = em || 'you';
    $('#tyOk').hidden = !!pending;
    $('#tyBank').hidden = pending !== 'bank';
    $('#tyRef').textContent = receiptNo || '';
    $('.ty-ref').hidden = !receiptNo;
    setBusy(true); // controls stay locked behind the overlay until "Back to the form"
    $('#thanks').hidden = false;
    $('#thanks').scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    $('#thanksHead').focus();
  }
  $('#again').onclick = () => { $('#thanks').hidden = true; setBusy(false); };

  // Same rule as the server, so browser and server agree.
  const EMAIL_RE = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;

  window.Give = {
    state,
    totalCents,
    payload: () => ({
      freq: state.freq, amount: Math.round(state.amt * 100) / 100, coverFee: $('#cover').checked, designation: state.desig,
      name: $('#donorName').value, email: $('#donorEmail').value,
      dedication: $('#dedication').value, employer: '',
    }),
    validateDonor() {
      if (!state.amt || state.amt < 5) return 'Online gifts start at $5.';
      if (state.amt > 50000) return 'For gifts above $50,000, please write to us.';
      if (!$('#donorName').value.trim()) return 'Enter your name.';
      const em = $('#donorEmail').value.trim();
      if (em.length > 200 || !EMAIL_RE.test(em)) return 'Enter a valid email for your receipt.';
      return '';
    },
    onUpdate: fn => listeners.push(fn),
    showThanks,
    setBusy,
    isBusy: () => busy,
    onSubmit: null, // donate.js installs the payment handler here
  };

  // Never let the browser submit natively; donate.js handles it once loaded.
  panel.addEventListener('submit', e => { e.preventDefault(); if (window.Give.onSubmit) window.Give.onSubmit(); });

  $('#manageForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#manageMsg');
    const email = $('#manageEmail').value.trim();
    if (email.length > 200 || !EMAIL_RE.test(email)) { msg.textContent = 'Enter the email you used for your gift.'; return; }
    msg.textContent = 'Sending…';
    const mb = $('button', e.target);
    mb.disabled = true;
    try {
      const r = await fetch('/api/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      msg.textContent = r.ok
        ? 'If that email has a monthly gift, a link to manage it is on its way. It works for 24 hours.'
        : 'Something went wrong. Please try again in a minute.';
    } catch { msg.textContent = 'Something went wrong. Please try again in a minute.'; }
    finally { mb.disabled = false; }
  });
  if (location.hash === '#manage') { const d = $('#manage'); if (d) d.open = true; }

  renderChips(); update();
})();
