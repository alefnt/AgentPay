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

# FNN v0.7.1 requires RPC to bind to 127.0.0.1 (biscuit auth for public)
# Use socat to forward 0.0.0.0:8227 -> 127.0.0.1:8227 for Docker access
echo "[Fiber Entrypoint] Starting socat port forward (0.0.0.0:8227 -> 127.0.0.1:8227)..."
socat TCP-LISTEN:8227,bind=0.0.0.0,fork,reuseaddr TCP:127.0.0.1:8227 &

# Use a different internal RPC port so socat can forward on 8227
# Reconfigure: FNN listens on 127.0.0.1:18227, socat forwards 0.0.0.0:8227 -> 127.0.0.1:18227
kill %1 2>/dev/null || true
sed -i 's/127.0.0.1:8227/127.0.0.1:18227/' /app/config.yml
socat TCP-LISTEN:8227,bind=0.0.0.0,fork,reuseaddr TCP:127.0.0.1:18227 &

echo "[Fiber Entrypoint] Starting FNN v0.7.1 (CKB Testnet)..."
exec ./fnn -c config.yml -d "$DATA_DIR"
