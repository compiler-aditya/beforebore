#!/usr/bin/env bash
# Registers the AgentMail reply webhook for a BeforeBore deployment and stores
# its signing secret as AGENTMAIL_WEBHOOK_SECRET. The secret is piped straight
# from the Convex action into `convex env set` and is never printed.
#
#   scripts/agentmail-webhook.sh --prod https://tacit-anaconda-976.convex.site
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

DEPLOY_FLAG=""
if [ "${1:-}" = "--prod" ]; then
  DEPLOY_FLAG="--prod"
  shift
fi

SITE_URL="${1:-}"
if [ -z "$SITE_URL" ]; then
  echo "usage: $0 [--prod] <convex-site-url>" >&2
  exit 2
fi

response="$(npx convex run diagnostics:ensureAgentMailWebhook \
  "{\"siteUrl\":\"$SITE_URL\"}" $DEPLOY_FLAG 2>/dev/null)"
if [ -z "$response" ]; then
  echo "FAIL  the Convex action returned nothing" >&2
  exit 1
fi

status="$(printf '%s' "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))')"
detail="$(printf '%s' "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("detail",""))')"
webhook_id="$(printf '%s' "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("webhookId") or "")')"
secret="$(printf '%s' "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("secret") or "")')"

echo "status:  $status"
echo "detail:  $detail"
echo "webhook: ${webhook_id:-none}"

if [ -z "$secret" ]; then
  stored_secret="$(npx convex env get AGENTMAIL_WEBHOOK_SECRET $DEPLOY_FLAG 2>/dev/null || true)"
  if [ -n "$stored_secret" ]; then
    echo "secret:  already stored as AGENTMAIL_WEBHOOK_SECRET"
    exit 0
  fi
  echo "secret:  not returned — set AGENTMAIL_WEBHOOK_SECRET manually from the AgentMail dashboard"
  exit 1
fi

if npx convex env set AGENTMAIL_WEBHOOK_SECRET "$secret" $DEPLOY_FLAG >/dev/null 2>&1; then
  echo "secret:  stored as AGENTMAIL_WEBHOOK_SECRET (length ${#secret})"
else
  echo "secret:  FAILED to store" >&2
  exit 1
fi
