#!/bin/bash
# Load env vars from .env.local then start Next.js standalone server
set -a
source "$(dirname "$0")/.env.local"
set +a

cd "$(dirname "$0")"

# Create correct symlink for static files (absolute path)
rm -rf .next/standalone/.next/static
ln -sf /home/ubuntu/.openclaw/workspace/my-v0-app/.next/static .next/standalone/.next/static

# Run server from the standalone directory so it can find static files
cd .next/standalone
NODE_ENV=production PORT=5567 exec node server.js >> /tmp/relieftrack.log 2>&1
