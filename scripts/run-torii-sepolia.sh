#!/usr/bin/env bash
set -Eeuo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log_directory="${TORII_LOG_DIR:-$repository_root/contracts/.torii/logs}"
log_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
log_path="$log_directory/torii-sepolia-$log_timestamp.log"

mkdir -p "$log_directory"

echo "Torii debug log: $log_path"

RUST_LOG=debug torii \
  --config "$repository_root/contracts/torii_sepolia.toml" \
  --http.cors_origins http://localhost:5000,http://127.0.0.1:5000 \
  2>&1 | tee -a "$log_path"

exit "${PIPESTATUS[0]}"
