#!/usr/bin/env bash
# Usage:
#   bash scripts/rebuild-and-test.sh          — rebuild + test (keeps data)
#   bash scripts/rebuild-and-test.sh --fresh  — wipe DB, rebuild, reseed, test
set -e

if [ "$1" = "--fresh" ]; then
  echo "==> Tearing down (wiping volumes)..."
  docker compose down -v
fi

echo "==> Building and starting..."
docker compose up --build -d

echo "==> Waiting for backend..."
until curl -s http://localhost:5000/api/auth/me > /dev/null 2>&1; do
  sleep 2
done

if [ "$1" = "--fresh" ]; then
  echo "==> Seeding database..."
  docker compose exec backend python scripts/database_generation.py
fi

echo "==> Running smoke tests..."
python backend/tests/smoke_test.py
