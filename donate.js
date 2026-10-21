(async function () {
  const G = window.Give;
  const $ = s => document.querySelector(s);
  const err = $('#payError');
  const btn = $('#giveBtn');
  const GENERIC = 'Something went wrong. Please try again.';
  const showErr = m => { err.textContent = m || ''; if (m) err.focus(); };
  const KEY = 'astra-give-pending';
  const store = {
    set(v) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
    get() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } },
    clear() { try { sessionStorage.removeItem(KEY); } catch {} },
  };
  const json = r => r.json().catch(() => ({}));

  let cfg = null;
  try {
    const r = await fetch('/api/config');
    if (!r.ok) throw new Error('config');
    cfg = await r.json();
    if (!cfg.stripePk || typeof Stripe !== 'function') throw new Error('stripe');
  } catch {
    const opensSoon = cfg && !cfg.stripePk;
    // Set the text without focusing it, so the page does not jump on load.
    err.textContent = opensSoon
      ? 'Online giving opens soon. To give now, write to info@astracivic.org and we will arrange it.'
      : 'Online giving is temporarily unavailable. Please try again shortly, or write to info@astracivic.org.';
    const pe = $('#payment-element'); if (pe && opensSoon) pe.hidden = true;
    btn.disabled = true;
    // app.js re-enables the button on every update; keep it off.
    G.onUpdate(() => { btn.disabled = true; });
    return;
  }

  const stripe = Stripe(cfg.stripePk);
  const intentOpts = () => ({
    mode: G.state.freq === 'monthly' ? 'subscription' : 'payment',
    amount: Math.max(G.totalCents(), 500),
    currency: 'usd',
  });
  const elements = stripe.elements({
    ...intentOpts(),
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#405742', colorBackground: '#ffffff', colorText: '#1c1c1a', colorDanger: '#b3261e',
        fontFamily: 'Satoshi, system-ui, sans-serif', borderRadius: '0px', spacingUnit: '4px',
      },
      rules: { '.Input': { border: '1px solid #CFCDBD', boxShadow: 'none' }, '.Tab': { border: '1px solid #CFCDBD', boxShadow: 'none' } },
    },
    fonts: [{ cssSrc: 'https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap' }],
  });
  elements.create('payment', { layout: 'tabs', fields: { billingDetails: { name: 'never', email: 'never' } } }).mount('#payment-element');
  G.onUpdate(() => elements.update(intentOpts()));

  G.onSubmit = async () => {
    if (G.isBusy()) return;
    showErr('');
    const invalid = G.validateDonor();
    if (invalid) return showErr(invalid);
    const payload = G.payload(); // one snapshot for create-payment and confirmParams
    const amountCents = G.totalCents();
    G.setBusy(true);
    let done = false;
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message || GENERIC);
      const r = await fetch('/api/create-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await json(r);
      if (!r.ok || !j.clientSecret) throw new Error(j.error || GENERIC);
      store.set({ amountCents, email: payload.email.trim(), freq: payload.freq, receiptNo: j.receiptNo });
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret: j.clientSecret,
        redirect: 'if_required',
        confirmParams: {
          return_url: `${location.origin}/donate?ref=${encodeURIComponent(j.receiptNo)}`,
          payment_method_data: { billing_details: { name: payload.name.trim(), email: payload.email.trim() } },
        },
      });
      store.clear(); // no redirect happened, so nothing to resume
      if (error) throw new Error(error.message || GENERIC);
      const status = paymentIntent && paymentIntent.status;
      if (status === 'succeeded' || status === 'processing') {
        done = true;
        G.showThanks({ receiptNo: j.receiptNo, pending: status === 'processing' ? 'bank' : false, amountCents: paymentIntent.amount || amountCents, email: payload.email });
      } else {
        throw new Error('Your payment needs another step. Please follow the prompts from your bank, or try a different method.');
      }
    } catch (e2) {
      showErr(e2.message || GENERIC);
    } finally {
      if (!done) G.setBusy(false);
    }
  };


  // Returning from a redirect-based confirmation (some banks and 3D Secure flows).
  const qs = new URLSearchParams(location.search);
  const returnSecret = qs.get('payment_intent_client_secret');
  if (returnSecret) {
    try {
      const { paymentIntent } = await stripe.retrievePaymentIntent(returnSecret);
      history.replaceState(null, '', location.pathname + '#give');
      const saved = store.get() || {};
      store.clear();
      const status = paymentIntent && paymentIntent.status;
      if (status === 'succeeded' || status === 'processing') {
        G.showThanks({
          receiptNo: saved.receiptNo || qs.get('ref') || '',
          pending: status === 'processing' ? 'bank' : false,
          amountCents: paymentIntent.amount,
          email: saved.email || '',
          freq: saved.freq,
        });
      } else {
        showErr('That payment did not go through. Please try again.');
      }
    } catch {
      showErr('We could not confirm your payment. If you were charged, write to info@astracivic.org and we will check.');
    }
  }
})();
