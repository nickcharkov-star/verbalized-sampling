#!/usr/bin/env bash
# Builds the shareable theme zip. Shopify wants the theme's *contents* at the
# root of the archive, not the folder, and it rejects files it does not know —
# so the README and the zip itself stay out.
set -euo pipefail
THEME="${1:-web/shopify}"
OUT="${2:-web/shopify/domain-black-theme.zip}"

node scripts/validate-shopify-theme.mjs "$THEME"

rm -f "$OUT"
( cd "$THEME" && zip -q -r -X "$(basename "$OUT")" \
    assets config layout locales sections snippets templates \
    -x '*.DS_Store' )
echo "✓ $OUT  ($(du -h "$OUT" | cut -f1))"
