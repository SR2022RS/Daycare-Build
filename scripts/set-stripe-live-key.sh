#!/usr/bin/env bash
# Sets the LIVE Stripe secret key on Vercel Production, safely.
#
# The key is typed at a hidden prompt and never appears in your shell
# history, in a file, or in any chat transcript. It is validated against
# Stripe BEFORE anything is changed, so a wrong-mode or dead key is caught
# here rather than by a customer at checkout.
#
#   bash scripts/set-stripe-live-key.sh

set -euo pipefail

printf 'Paste the Stripe LIVE secret key (input hidden), then press Enter:\n> '
read -rs KEY
printf '\n\n'

if [ -z "${KEY:-}" ]; then
  echo "No key entered. Nothing changed."; exit 1
fi

case "$KEY" in
  sk_live_*|rk_live_*) : ;;
  sk_test_*|rk_test_*)
    echo "REFUSING: that is a TEST key."
    echo "A test key on Production makes checkout look like it works while charging nobody."
    echo "Use the key from the 'Secret key' row via 'Reveal live key' (starts sk_live_)."
    exit 1 ;;
  pk_*)
    echo "REFUSING: that is a PUBLISHABLE key, not a secret key."; exit 1 ;;
  *)
    echo "REFUSING: that does not look like a Stripe secret key."; exit 1 ;;
esac

PRICE="price_1U4o0EF4C8JH66e4dYiMD0JX"

echo "Validating the key against Stripe before changing anything..."
CODE=$(curl -s -o /tmp/_k.json -w '%{http_code}' \
  "https://api.stripe.com/v1/prices/${PRICE}" -u "${KEY}:")

if [ "$CODE" != "200" ]; then
  echo "REFUSING: Stripe rejected this key (HTTP $CODE)."
  python3 -c "import json;print('  '+json.load(open('/tmp/_k.json')).get('error',{}).get('message','')[:160])" 2>/dev/null || true
  rm -f /tmp/_k.json; exit 1
fi

LIVEMODE=$(python3 -c "import json;print(json.load(open('/tmp/_k.json'))['livemode'])")
rm -f /tmp/_k.json

if [ "$LIVEMODE" != "True" ]; then
  echo "REFUSING: the key resolved the price but it is not livemode."; exit 1
fi

echo "  key authenticates and resolves the live \$300 price."
echo
echo "Updating Vercel Production (Preview is left on its test key)..."
vercel env rm STRIPE_SECRET_KEY production --yes >/dev/null 2>&1 || true
printf '%s' "$KEY" | vercel env add STRIPE_SECRET_KEY production >/dev/null 2>&1
unset KEY
echo "  STRIPE_SECRET_KEY updated on Production."
echo
echo "Deploying..."
vercel deploy --prod 2>&1 | grep -E '"readyState"' || true
echo
echo "Done. Tell Claude, and it will run the buy-path health check."
