#!/usr/bin/env bash
set -Eeuo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sepolia_environment="$repository_root/apps/web/.env.sepolia"
minio_container="${STAKEWARS_MINIO_CONTAINER:-stakewars-minio}"
image_bucket="${IMAGE_BUCKET:-stakewars-art}"
coordinator_token_file="${ARBITER_COORDINATOR_TOKEN_FILE:-$HOME/.starknet_accounts/whisper/coordinator_token}"

if [[ ! -f "$sepolia_environment" ]]; then
  echo "Missing Sepolia environment: $sepolia_environment" >&2
  exit 1
fi

if [[ ! -f "$coordinator_token_file" || -L "$coordinator_token_file" ]]; then
  echo "Missing owner-only Arbiter coordinator token: $coordinator_token_file" >&2
  exit 1
fi
coordinator_token_mode="$(stat -f '%Lp' "$coordinator_token_file")"
if [[ "$coordinator_token_mode" != "600" ]]; then
  echo "Arbiter coordinator token must have mode 0600." >&2
  exit 1
fi

if [[ "$(docker inspect --format '{{.State.Running}}' "$minio_container" 2>/dev/null || true)" != "true" ]]; then
  echo "Local image storage container '$minio_container' is not running." >&2
  exit 1
fi

minio_environment="$(docker inspect --format '{{json .Config.Env}}' "$minio_container")"
minio_access_key="$(
  jq -er '.[] | select(startswith("MINIO_ROOT_USER=")) | sub("^MINIO_ROOT_USER="; "")' \
    <<<"$minio_environment"
)"
minio_secret_key="$(
  jq -er '.[] | select(startswith("MINIO_ROOT_PASSWORD=")) | sub("^MINIO_ROOT_PASSWORD="; "")' \
    <<<"$minio_environment"
)"

docker exec "$minio_container" sh -lc \
  'mc alias set stakewars-local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc stat "stakewars-local/'"$image_bucket"'" >/dev/null'

set -a
# shellcheck disable=SC1090
source "$sepolia_environment"
set +a

export STARKNET_RPC_URL="${STARKNET_RPC_URL:-$VITE_STARKNET_RPC_URL}"
export STARKNET_CHAIN_ID="${STARKNET_CHAIN_ID:-$VITE_STARKNET_CHAIN_ID}"
export CONTROL_SYSTEM_ADDRESS="${CONTROL_SYSTEM_ADDRESS:-$VITE_CONTROL_SYSTEM_ADDRESS}"
export TORII_URL="${TORII_URL:-http://127.0.0.1:8081}"
export ARBITER_BIDDING_DURATION="${ARBITER_BIDDING_DURATION:-5m}"
export ARBITER_ACCEPTANCE_DURATION="${ARBITER_ACCEPTANCE_DURATION:-3m}"
export ARBITER_SETTLEMENT_DURATION="${ARBITER_SETTLEMENT_DURATION:-22m}"
export ARBITER_COORDINATOR_URL="${ARBITER_COORDINATOR_URL:-http://127.0.0.1:8082}"
export ARBITER_COORDINATOR_TOKEN="$(<"$coordinator_token_file")"
export ARBITER_PAYMENT_TOKEN="${ARBITER_PAYMENT_TOKEN:-$VITE_STRK_TOKEN_ADDRESS}"
export ARBITER_RESERVE_PRICE="${ARBITER_RESERVE_PRICE:-100000000000000000}"
export ARBITER_MAX_BIDS="${ARBITER_MAX_BIDS:-32}"
export IMAGE_BUCKET="$image_bucket"
export IMAGE_PUBLIC_URL="${IMAGE_PUBLIC_URL:-http://127.0.0.1:9000/$image_bucket}"
export S3_ENDPOINT="${S3_ENDPOINT:-http://127.0.0.1:9000}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_ACCESS_KEY_ID="$minio_access_key"
export AWS_SECRET_ACCESS_KEY="$minio_secret_key"

if [[ "${1:-}" == "bootstrap" ]]; then
  exec pnpm --filter @stakewars/api exec go run ./cmd/arbiter-bootstrap
fi

exec pnpm --filter @stakewars/api dev
