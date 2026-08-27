#!/usr/bin/env bash
set -Eeuo pipefail

: "${TORII_WORLD_ADDRESS:?TORII_WORLD_ADDRESS is required}"
: "${TORII_WORLD_BLOCK:?TORII_WORLD_BLOCK is required}"
: "${TORII_STAKING_POOL_ADDRESS:?TORII_STAKING_POOL_ADDRESS is required}"
: "${TORII_STAKING_POOL_BLOCK:?TORII_STAKING_POOL_BLOCK is required}"
: "${TORII_WHISPER_ADDRESS:?TORII_WHISPER_ADDRESS is required}"
: "${TORII_WHISPER_BLOCK:?TORII_WHISPER_BLOCK is required}"

torii_rpc_url="${TORII_RPC_URL:-${STARKNET_RPC_URL:-}}"
if [[ -z "$torii_rpc_url" ]]; then
  echo "TORII_RPC_URL or STARKNET_RPC_URL is required" >&2
  exit 1
fi

torii_db_dir="${TORII_DB_DIR:-/data/torii}"
torii_http_port="${TORII_HTTP_PORT:-8081}"
torii_grpc_port="${TORII_GRPC_PORT:-50051}"
torii_relay_port="${TORII_RELAY_PORT:-9090}"
torii_webrtc_port="${TORII_WEBRTC_PORT:-9091}"
torii_websocket_port="${TORII_WEBSOCKET_PORT:-9092}"
torii_cors_origins="${TORII_CORS_ORIGINS:-http://127.0.0.1}"
export RUST_LOG="${TORII_RUST_LOG:-debug}"

torii \
  --world "$TORII_WORLD_ADDRESS" \
  --rpc "$torii_rpc_url" \
  --db-dir "$torii_db_dir" \
  --indexing.world_block "$TORII_WORLD_BLOCK" \
  --indexing.contracts "other:$TORII_STAKING_POOL_ADDRESS:$TORII_STAKING_POOL_BLOCK" \
  --indexing.contracts "other:$TORII_WHISPER_ADDRESS:$TORII_WHISPER_BLOCK" \
  --indexing.namespaces stakewars \
  --indexing.events_chunk_size 256 \
  --indexing.blocks_chunk_size 512 \
  --indexing.polling_interval 1000 \
  --indexing.max_concurrent_tasks 8 \
  --indexing.batch_chunk_size 256 \
  --events.raw \
  --runner.query_threads 1 \
  --runner.indexer_threads 1 \
  --runner.allocation_strategy balanced \
  --sql.cache_size=-32768 \
  --sql.wal_truncate_size_threshold 16777216 \
  --sql.max_connections 8 \
  --sql.soft_memory_limit 201326592 \
  --sql.hard_memory_limit 335544320 \
  --http.addr 127.0.0.1 \
  --http.port "$torii_http_port" \
  --http.cors_origins "$torii_cors_origins" \
  --grpc.addr 127.0.0.1 \
  --grpc.port "$torii_grpc_port" \
  --relay.port "$torii_relay_port" \
  --relay.webrtc_port "$torii_webrtc_port" \
  --relay.websocket_port "$torii_websocket_port" &
torii_pid=$!

stakewars-api &
api_pid=$!

stopping=0
terminate_children() {
  stopping=1
  kill -TERM "$torii_pid" "$api_pid" 2>/dev/null || true
}
trap terminate_children TERM INT

while kill -0 "$torii_pid" 2>/dev/null && kill -0 "$api_pid" 2>/dev/null; do
  sleep 1 &
  wait $! || true
done

set +e
if ! kill -0 "$torii_pid" 2>/dev/null; then
  wait "$torii_pid"
  status=$?
else
  wait "$api_pid"
  status=$?
fi
set -e

if [[ "$stopping" -eq 0 && "$status" -eq 0 ]]; then
  status=1
fi

terminate_children
wait "$torii_pid" 2>/dev/null || true
wait "$api_pid" 2>/dev/null || true
exit "$status"
