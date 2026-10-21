#!/bin/zsh
# Puts the secret settings for the donate page into the Vercel project "astra".
# Run it yourself in Terminal. Secrets are read with typing hidden and sent
# straight to Vercel over stdin: they are never printed, saved to a file,
# or written to your shell history.
set -u
cd "${0:A:h}/.." || exit 1

put() { # name env value
  if [[ "$2" == preview ]]; then
    printf '%s' "$3" | vercel env add "$1" preview "" --force --scope=team_WDkEsxtwvtA4bKdyeMs8QziL >/dev/null 2>&1
  else
    printf '%s' "$3" | vercel env add "$1" production --force --scope=team_WDkEsxtwvtA4bKdyeMs8QziL >/dev/null 2>&1
  fi && echo "  saved $1 ($2)" || echo "  FAILED $1 ($2): try again or add it in the Vercel dashboard"
}
ask() { # prompt -> REPLY (hidden)
  local v; read -rs "v?$1: "; echo; REPLY="$v"
}
fromlocal() { grep -E "^$1=" .env.local 2>/dev/null | head -1 | cut -d= -f2-; }
newsecret() { node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"; }

echo "Preview (testing) settings"
if [[ -f .env.local ]] && read -q "?Use the Stripe TEST keys and Resend key already in .env.local? [y/n] "; then
  echo
  put STRIPE_SECRET_KEY preview "$(fromlocal STRIPE_SECRET_KEY)"
  put STRIPE_PUBLISHABLE_KEY preview "$(fromlocal STRIPE_PUBLISHABLE_KEY)"
  put RESEND_API_KEY preview "$(fromlocal RESEND_API_KEY)"
else
  echo
  ask "Stripe TEST secret key (sk_test_...)"; put STRIPE_SECRET_KEY preview "$REPLY"
  ask "Stripe TEST publishable key (pk_test_...)"; put STRIPE_PUBLISHABLE_KEY preview "$REPLY"
  ask "Resend API key (re_...)"; put RESEND_API_KEY preview "$REPLY"
fi
put MANAGE_SECRET preview "$(newsecret)"

echo
echo "Production (live) settings"
ask "Stripe LIVE secret key for Astra Civic Fund (rk_live_ or sk_live_)"; put STRIPE_SECRET_KEY production "$REPLY"
ask "Stripe LIVE publishable key (pk_live_...)"; put STRIPE_PUBLISHABLE_KEY production "$REPLY"
ask "LIVE monthly product ID (prod_...)"; put STRIPE_MONTHLY_PRODUCT_ID production "$REPLY"
ask "Resend API key for production (re_...)"; put RESEND_API_KEY production "$REPLY"
put MANAGE_SECRET production "$(newsecret)"
unset REPLY

echo
echo "Done. The webhook signing secret is added later, at go-live."
