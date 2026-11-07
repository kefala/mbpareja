#!/usr/bin/env bash
set -euo pipefail

echo "GENERANDO Y SUBIENDO mbpareja prod"
git fetch
git checkout main
git pull
npm i
npm run build
pm2 restart mbpareja-prod
pm2 logs mbpareja-prod

# Primera vez en el VPS (puerto 3003):
# pm2 start npm --name "mbpareja-prod" -- run start
