#!/bin/bash
set -e

echo "Running database migrations..."
flask db upgrade

echo "Starting application..."
exec "$@"