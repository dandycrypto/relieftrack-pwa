#!/bin/bash
# Load env vars from .env.local then start Next.js standalone server
# PROJECT_DIR is resolved from this script's own location, not hardcoded, so
# it works from any checkout on any host.
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

set -a
source "$PROJECT_DIR/.env.local"
set +a

cd "$PROJECT_DIR"

# Create correct symlink for static files (absolute path)
rm -rf .next/standalone/.next/static
ln -sf "$PROJECT_DIR/.next/static" .next/standalone/.next/static

# Run server from the standalone directory so it can find static files
cd .next/standalone
NODE_ENV=production PORT=5567 exec node server.js >> /tmp/relieftrack.log 2>&1
