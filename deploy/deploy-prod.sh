#!/usr/bin/env bash
# Deploy the current main to the production server.
#
# Run this ON THE PRODUCTION SERVER (tester-lab.mibot.my.id), from the repo
# checkout that PM2 serves — NOT on a developer machine. There is no CI/CD,
# so a push to origin/main does not reach production until this runs.
#
# Usage:  bash deploy/deploy-prod.sh
set -euo pipefail

APP_NAME="tester-lab"          # PM2 process name (see: pm2 list)
BRANCH="main"

echo "==> Pull latest ${BRANCH}"
git checkout "${BRANCH}"
git pull origin "${BRANCH}"

echo "==> Install dependencies"
npm install

echo "==> Build (compiles TS and copies public/ into dist/public/)"
npm run build

echo "==> Restart PM2 process '${APP_NAME}'"
pm2 restart "${APP_NAME}"

echo "==> Deployed commit:"
git rev-parse --short HEAD

echo "==> Verify the served app.js has the latest importer code"
echo "    (expect a number >= 1):"
if command -v curl >/dev/null 2>&1; then
  curl -s https://tester-lab.mibot.my.id/js/app.js | grep -c classifyImportKind || true
else
  echo "    curl not available; check manually in the browser after a hard refresh."
fi

echo "==> Done. In the browser, hard-refresh (Ctrl+F5) to drop the cached app.js."
