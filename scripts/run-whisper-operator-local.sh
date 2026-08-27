#!/usr/bin/env bash
set -Eeuo pipefail

whisper_root="${WHISPER_REPOSITORY:-$HOME/development/whisper}"
account_file="${WHISPER_ACCOUNT_FILE:-$HOME/.starknet_accounts/whisper/sepolia_accounts.json}"
operator_file="${WHISPER_OPERATOR_SECRETS_FILE:-$HOME/.starknet_accounts/whisper/operator_secrets.json}"
coordinator_token_file="${WHISPER_COORDINATOR_TOKEN_FILE:-$HOME/.starknet_accounts/whisper/coordinator_token}"

for secret_file in "$account_file" "$operator_file" "$coordinator_token_file"; do
  if [[ ! -f "$secret_file" || -L "$secret_file" ]]; then
    echo "Missing required owner-only file: $secret_file" >&2
    exit 1
  fi
  if [[ "$(stat -f '%Lp' "$secret_file")" != "600" ]]; then
    echo "Operator files must have mode 0600." >&2
    exit 1
  fi
done

export WHISPER_NETWORK="${WHISPER_NETWORK:-sepolia}"
export WHISPER_ACCOUNT_FILE="$account_file"
export WHISPER_OPERATOR_SECRETS_FILE="$operator_file"
export WHISPER_CONTRACT_ADDRESS="${WHISPER_CONTRACT_ADDRESS:-$(jq -er '.whisper_address' "$operator_file")}"
export WHISPER_VAULT_ADDRESS="${WHISPER_VAULT_ADDRESS:-$(jq -er '.vault_address' "$operator_file")}"
export WHISPER_VAULT_PUBLIC_KEY="${WHISPER_VAULT_PUBLIC_KEY:-$(jq -er '.vault_viewing_public_key' "$operator_file")}"
export WHISPER_REVEAL_PUBLIC_KEY="${WHISPER_REVEAL_PUBLIC_KEY:-$(jq -er '.capsule_reveal_public_key' "$operator_file")}"
export WHISPER_DEPLOYMENT_BLOCK="${WHISPER_DEPLOYMENT_BLOCK:-14134212}"
export WHISPER_DATABASE_PATH="${WHISPER_DATABASE_PATH:-$HOME/.local/state/whisper/operator.sqlite}"
export WHISPER_ALLOWED_ORIGINS="${WHISPER_ALLOWED_ORIGINS:-http://localhost:3000}"
export WHISPER_API_HOST="${WHISPER_API_HOST:-127.0.0.1}"
export WHISPER_API_PORT="${WHISPER_API_PORT:-8082}"
export WHISPER_COORDINATOR_TOKEN="$(<"$coordinator_token_file")"

pnpm --dir "$whisper_root/operator" build
exec node "$whisper_root/operator/dist/run.js"
