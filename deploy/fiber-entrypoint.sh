#!/bin/bash
set -e

DATA_DIR="/app/data"
KEY_FILE="$DATA_DIR/ckb/key"

# Generate private key on first run if not exists
if [ ! -f "$KEY_FILE" ]; then
  echo "[Fiber Entrypoint] First run — generating CKB private key..."
  mkdir -p "$DATA_DIR/ckb"
  openssl rand -hex 32 > "$KEY_FILE"
  echo "[Fiber Entrypoint] Private key generated at $KEY_FILE"
else
  echo "[Fiber Entrypoint] Using existing key at $KEY_FILE"
fi

# Remove cch service requirement if LND is not available
if [ ! -f "/lnd/tls.cert" ]; then
  echo "[Fiber Entrypoint] LND not available — disabling Cch service..."
  sed -i '/^  - cch$/d' /app/config.yml
  # Remove entire cch section
  sed -i '/^cch:/,$d' /app/config.yml
fi

# FNN v0.7.1 requires RPC to bind to 127.0.0.1 (biscuit auth for public)
# Use socat to forward 0.0.0.0:8227 -> 127.0.0.1:18227 for Docker access
sed -i 's/127.0.0.1:8227/127.0.0.1:18227/' /app/config.yml
echo "[Fiber Entrypoint] Starting socat port forward (0.0.0.0:8227 -> 127.0.0.1:18227)..."
socat TCP-LISTEN:8227,bind=0.0.0.0,fork,reuseaddr TCP:127.0.0.1:18227 &

echo "[Fiber Entrypoint] Starting FNN v0.7.1 (CKB Testnet)..."
exec ./fnn -c config.yml -d "$DATA_DIR"
