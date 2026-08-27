#!/usr/bin/env bash
set -Eeuo pipefail

export VITE_API_DOMAIN="${VITE_API_DOMAIN:-http://127.0.0.1:8080}"
export VITE_WHISPER_OPERATOR_URL="${VITE_WHISPER_OPERATOR_URL:-http://127.0.0.1:8082}"
exec pnpm --filter @stakewars/web dev:sepolia
