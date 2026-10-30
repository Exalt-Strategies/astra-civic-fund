#!/bin/zsh
# Creates .env.local for testing the donate page on this Mac, using Astra's Stripe TEST keys.
# Keys are read with typing hidden and written only to .env.local (never committed, never printed).
# Run from Terminal:  zsh scripts/setup-local-env.sh
set -u
cd "${0:A:h}/.." || exit 1

# Ask until the answer starts with one of the given prefixes. Typing is hidden.
askkey() { # prompt prefix1 prefix2
  local v
  while true; do
    read -rs "v?$1: "; echo
    v="${v//[[:space:]]/}"
    if [[ "$v" == ${2}* || ( -n "${3:-}" && "$v" == ${3}* ) ]]; then REPLY="$v"; return 0; fi
    if [[ "$v" == *_live_* ]]; then echo "  That is a LIVE key. Switch Stripe to test mode (or Sandbox) and copy the test key instead."
    elif [[ -z "$v" ]]; then echo "  Nothing was pasted. Try again."
    else echo "  That doesn't look right. It should start with $2. Try again."; fi
  done
}

echo
echo "Astra donate page: local test setup"
echo "Paste each key when asked. Nothing appears on screen while you paste; that is normal. Press Enter after each one."
echo

if [[ -f .env.local ]]; then
  read -q "?.env.local already exists. Replace it? [y/n] " || { echo; echo "Left .env.local unchanged."; exit 0; }
  echo
fi

askkey "1 of 2  Stripe TEST secret key (sk_test_...)" sk_test_ rk_test_; SK="$REPLY"
askkey "2 of 2  Stripe TEST publishable key (pk_test_...)" pk_test_; PK="$REPLY"
unset REPLY
echo "  Got both keys."

echo "Creating the monthly-gift product in Stripe test mode..."
OUT=$(STRIPE_SECRET_KEY="$SK" node scripts/stripe-setup.js 2>&1)
PROD=$(print -r -- "$OUT" | sed -n 's/^STRIPE_MONTHLY_PRODUCT_ID=//p')
if [[ "$PROD" != prod_* ]]; then
  echo "  Stripe refused: $(print -r -- "$OUT" | grep -v '^STRIPE' | head -2)"
  echo "  Nothing saved. Check that both keys are from Astra's account, in test mode, then run this again."
  exit 1
fi
echo "  Done: $PROD"

echo "Getting the local webhook signing secret..."
WH=$(stripe listen --api-key "$SK" --print-secret 2>/dev/null | tr -d '[:space:]')
if [[ "$WH" != whsec_* ]]; then
  echo "  The Stripe command-line tool could not get a webhook secret. Saving the rest; Claude will finish this step."
  WH=""
fi

MS=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")

umask 077
cat > .env.local <<EOF
STRIPE_SECRET_KEY=$SK
STRIPE_PUBLISHABLE_KEY=$PK
STRIPE_WEBHOOK_SECRET=$WH
STRIPE_MONTHLY_PRODUCT_ID=$PROD
RESEND_API_KEY=
RECEIPT_FROM=Astra Civic Fund <giving@astracivic.org>
RECEIPT_REPLY_TO=info@astracivic.org
MANAGE_SECRET=$MS
SITE_URL=http://localhost:4358
EOF
unset SK PK WH MS OUT
echo
echo "Saved .env.local (test mode). Tell Claude it's done."
