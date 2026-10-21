# Astra donate page: go-live checklist

This is for Sudhanshu. Tick each line as you go. Never paste secret keys into chat, email or this file.

What it is: astracivic.org/donate takes contributions to **Astra Civic Fund (501(c)(4)) only**, by card, Apple Pay, Google Pay, Link, or US bank account, one-time or monthly. Branded receipts come from giving@astracivic.org, and replies go to info@astracivic.org. Astra PAC is not connected to this page.

## 0. Before anything: Astra's own Stripe account
- [ ] Create a new Stripe account for **Astra Civic Fund** at dashboard.stripe.com. Use Astra's legal name, EIN and bank account. Never use CYP's Stripe account: they are separate legal entities.
- [ ] Business type: nonprofit / 501(c)(4) social welfare organization. Stripe reviews political and advocacy organizations, so describe the mission plainly.
- [ ] Settings > Public details: statement descriptor `ASTRA CIVIC FUND`, support email info@astracivic.org, website https://astracivic.org.

## 1. Test mode first (Stripe Sandbox)
- [ ] Copy the test keys (sk_test_..., pk_test_...).
- [ ] Locally: `cp .env.example .env.local`, then edit `.env.local` in a text editor and put in the test keys and a new MANAGE_SECRET (generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). `.env.local` is never committed.
- [ ] Create the test monthly product. This command asks for the key with typing hidden:
  `cd ~/Desktop/Claude/astra && read -s "STRIPE_SECRET_KEY?Paste TEST secret key (hidden): " && echo && STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY node scripts/stripe-setup.js; unset STRIPE_SECRET_KEY`
- [ ] Put the printed prod_... into `.env.local` as STRIPE_MONTHLY_PRODUCT_ID.
- [ ] `node serve.js`, open http://localhost:4358/donate, and give with card 4242 4242 4242 4242 (any future date, any CVC).
- [ ] Customer portal (Settings > Billing > Customer portal): business name "Astra Civic Fund", email editing OFF, cancel ON (at end of period), plan switching OFF, update payment method ON, invoice history ON.

Then tell Claude, and it will run the end-to-end webhook and receipt test with the Stripe CLI.

## 2. Resend (receipt emails)
- [ ] resend.com > Domains > Add `astracivic.org`. Add the DNS records it shows (DKIM, SPF/return-path, and a DMARC TXT record) wherever astracivic.org's DNS is managed. Wait for "Verified".
- [ ] API Keys > Create: name "astra-donate production", permission "Sending access", restricted to astracivic.org.

## 3. Stripe Live mode
- [ ] Settings > Customer emails: turn OFF "Successful payments" (we send our own receipts).
- [ ] Settings > Payment methods: ON for Cards, Apple Pay, Google Pay, Link, ACH Direct Debit. OFF for Klarna, Affirm, Afterpay, Cash App Pay, Amazon Pay and any other buy-now-pay-later option.
- [ ] Settings > Payment method domains: add astracivic.org (for Apple Pay).
- [ ] Repeat the customer portal settings from step 1 in Live mode.
- [ ] Create the LIVE monthly product with the same command as step 1, using the live key. Keep the prod_... value.
- [ ] Developers > Webhooks > Add endpoint `https://astracivic.org/api/stripe-webhook`, events `payment_intent.succeeded` and `invoice.paid` only. Keep the signing secret (whsec_...).
- [ ] Radar > Rules: block if the CVC check fails; review payments under $10; block high-velocity mismatched card and IP countries.

## 4. Vercel (project "astra")
- [ ] Run `zsh scripts/set-vercel-secrets.sh`. It asks for each key with typing hidden and sends it straight to Vercel.
- [ ] Settings > Environment Variables, Production, add any that are still missing:
  - [ ] STRIPE_WEBHOOK_SECRET (from the live webhook)
  - [ ] RECEIPT_FROM = `Astra Civic Fund <giving@astracivic.org>`
  - [ ] RECEIPT_REPLY_TO = `info@astracivic.org`
  - [ ] SITE_URL = `https://astracivic.org`
  - [ ] EMAIL_ASSET_URL = `https://astracivic.org`
  - [ ] NODEJS_HELPERS = `0` (required, or webhook signature checks fail)
- [ ] Preview environment: Stripe TEST keys only. Never put live keys in Preview.
- [ ] Firewall > Rate limiting: 10 requests per minute per IP on /api/create-payment, /api/manage and /api/portal.
- [ ] Redeploy Production after all variables are set.

## 5. First live check
- [ ] Give a real $5. Confirm the receipt arrives and shows the right amount and the "not tax-deductible" statement.
- [ ] Refund it in Stripe (Payments > the gift > Refund).
- [ ] Try a $5 monthly gift, then use "Manage my monthly gift" in the receipt to cancel it.

## Compliance notes (check with Astra's counsel)
- Contributions to a 501(c)(4) are not tax-deductible. The page, the receipt and the FAQ all say so.
- If Astra Civic Fund lobbies, the IRS may require a notice about the non-deductible share of member dues. That does not apply to plain contributions, but confirm with counsel.
- Do not route PAC contributions through this page. Astra PAC needs its own FEC-compliant form (employer, occupation, address, citizenship attestation, limits).
- Large donors to a 501(c)(4) are reported on Schedule B of Form 990 (not public). Keep Stripe records.

## Ops runbook
- No receipt: find the payment in Stripe and check `receipt_sent` in its metadata. To resend, open Developers > Webhooks > the endpoint > the event > Resend. Duplicates are never emailed twice.
- Cancel: the donor uses "Send link" in the FAQ on /donate, or you cancel the subscription in Stripe (Customers > donor > Subscriptions).
- Refunds: always in the Stripe dashboard.
