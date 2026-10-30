#!/bin/zsh
# Turns on live giving at astracivic.org/donate.
# Asks for Astra's LIVE Stripe keys and the Resend key with typing hidden, sets up Stripe
# (monthly product, webhook, customer portal, Apple Pay domain), and saves everything
# to the Vercel project "astra" for Production. Nothing is printed or written to disk.
# Run from Terminal:  zsh scripts/go-live.sh
set -u
cd "${0:A:h}/.." || exit 1

askkey() { # prompt prefix1 prefix2
  local v
  while true; do
    read -rs "v?$1: "; echo
    v="${v//[[:space:]]/}"
    if [[ "$v" == ${2}* || ( -n "${3:-}" && "$v" == ${3}* ) ]]; then REPLY="$v"; return 0; fi
    if [[ "$v" == *_test_* ]]; then echo "  That is a TEST key. Turn off test mode in Stripe and copy the live key."
    elif [[ -z "$v" ]]; then echo "  Nothing was pasted. Try again."
    else echo "  That doesn't look right. It should start with $2. Try again."; fi
  done
}
put() { # name value
  printf '%s' "$2" | vercel env add "$1" production --force >/dev/null 2>&1 \
    && echo "  saved $1" || { echo "  FAILED to save $1. Run this script again, or add it in the Vercel dashboard."; FAILED=1; }
}

echo
echo "Astra donate page: go live"
echo "Paste each key when asked. Nothing appears on screen while you paste. Press Enter after each one."
echo

askkey "1 of 3  Stripe LIVE secret key (sk_live_...)" sk_live_ rk_live_; SK="$REPLY"
askkey "2 of 3  Stripe LIVE publishable key (pk_live_...)" pk_live_; PK="$REPLY"
askkey "3 of 3  Resend API key (re_...)" re_; RK="$REPLY"
unset REPLY

echo
echo "Setting up Stripe (live)..."
OUT=$(STRIPE_SECRET_KEY="$SK" node scripts/stripe-go-live.js --site https://astracivic.org) || { echo "Stopped. Nothing was saved to Vercel."; exit 1; }
PROD=$(print -r -- "$OUT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).product||''))")
WH=$(print -r -- "$OUT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).webhookSecret||''))")
unset OUT
[[ "$PROD" == prod_* && "$WH" == whsec_* ]] || { echo "Stripe setup did not return what was expected. Nothing was saved to Vercel."; exit 1; }

MS=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")

echo
echo "Saving to Vercel (Production)..."
FAILED=0
put STRIPE_SECRET_KEY "$SK"
put STRIPE_PUBLISHABLE_KEY "$PK"
put STRIPE_WEBHOOK_SECRET "$WH"
put STRIPE_MONTHLY_PRODUCT_ID "$PROD"
put RESEND_API_KEY "$RK"
put MANAGE_SECRET "$MS"
unset SK PK RK WH MS PROD

echo
if [[ $FAILED == 0 ]]; then echo "Done. Tell Claude, and it will redeploy the site and check it."; else echo "Some values did not save. Tell Claude."; fi
