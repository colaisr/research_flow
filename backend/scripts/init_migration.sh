#!/usr/bin/env bash
# Initialize Alembic and create initial migration
# Run this after setting up config_local.py

set -e

echo "Creating initial Alembic migration..."

alembic revision --autogenerate -m "Initial migration"

echo ""
echo "Migration created. Review the file in alembic/versions/ and then run:"
echo "  alembic upgrade head"

