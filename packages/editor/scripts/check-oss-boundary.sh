#!/bin/bash
# OSS boundary check — fails if the editor package source imports any
# SaaS-only concept. Enforces the asymmetric-layering rule that lets the
# editor package stay 100% commerce-free.
#
# Forbidden imports / identifiers:
#   - @aedifex-saas/*          (entire SaaS workspace)
#   - better-auth              (SaaS auth library)
#   - stripe / @stripe/*       (payment processor)
#   - drizzle-orm              (SaaS DB ORM — only valid inside SaaS lib)
#   - QuotaPolicy, UsageTracker, BillingPlan, PaymentMethod, GuestQuota,
#     SaasChatTransport (etc.) — names that imply commerce semantics
#
# Run from anywhere; resolves the editor src/ directory automatically.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="${SCRIPT_DIR}/../src"

if [ ! -d "${SRC_DIR}" ]; then
  echo "❌ OSS boundary check: cannot find src/ at ${SRC_DIR}" >&2
  exit 1
fi

forbidden_patterns=(
  '@aedifex-saas/'
  '@aedifex-saas-'
  'better-auth'
  "'stripe'"
  '"stripe"'
  '@stripe/'
  'drizzle-orm'
  'QuotaPolicy'
  'UsageTracker'
  'BillingPlan'
  'PaymentMethod'
  'GuestQuota'
  'SaasChatTransport'
  'SaasCatalogProvider'
  'SaasChatPersistence'
  'SaasTelemetry'
  'SaasAIRuntime'
  'recordAiUsage'
  'checkAiQuota'
  'checkGuestAiQuota'
)

violations=0
for pattern in "${forbidden_patterns[@]}"; do
  # Search .ts/.tsx files, exclude node_modules, .next, dist, scripts/, contracts (where we may reference patterns in comments)
  matches=$(grep -rn --include='*.ts' --include='*.tsx' \
    --exclude-dir=node_modules \
    --exclude-dir=.next \
    --exclude-dir=dist \
    --exclude-dir=scripts \
    -F "${pattern}" "${SRC_DIR}" 2>/dev/null || true)

  if [ -n "${matches}" ]; then
    echo "❌ OSS boundary violation: '${pattern}' found in editor src/"
    echo "${matches}"
    echo ""
    violations=$((violations + 1))
  fi
done

if [ ${violations} -gt 0 ]; then
  echo "❌ ${violations} OSS boundary violation(s) detected."
  echo "   The @aedifex/editor package must remain commerce-free."
  echo "   Move SaaS-only concepts (auth/quota/billing/rate-limit) to apps/web."
  exit 1
fi

echo "✅ OSS boundary check passed — no SaaS-only imports detected."
