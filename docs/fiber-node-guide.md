# Running Your Own Fiber Node

## Our Docker = Official FNN Binary

AgentPay's Docker container downloads the **official Fiber Network Node (FNN) v0.7.1 binary** directly from
[nervosnetwork/fiber/releases](https://github.com/nervosnetwork/fiber/releases). This is the same binary
the Nervos team uses. We do NOT fork or modify the Fiber node.

## What We Abstract vs What Users Must Configure

### ✅ We Handle (Auto-configured)

| Step | What We Do | Official Manual Step |
|---|---|---|
| Download FNN | Dockerfile downloads v0.7.1 from GitHub releases | `mkdir tmp && tar xzvf fnn-latest.tar.gz` |
| Private key | `entrypoint.sh` auto-generates via `openssl rand -hex 32` | Manual: `ckb-cli account new` + `export` |
| Testnet config | Pre-configured `fiber-testnet-config.yml` | Manual: `cp config/testnet/config.yml` |
| Bootnode peers | 2 official bootnodes pre-configured | Same |
| FundingLock + CommitmentLock | Script hashes pre-configured | Same (from official testnet config) |
| RPC access | socat port forward for Docker networking | Not needed in bare metal |
| Cch + LND | Pre-configured bridge to LND container | Manual LND setup |
| FIBER_SECRET_KEY_PASSWORD | Default dev password in docker-compose | Must set manually in production |

### ⚠️ User Must Provide (Cannot Abstract)

| Item | Why | How |
|---|---|---|
| **CKB testnet funding** | Opening channels needs CKB for on-chain tx | Faucet: https://faucet.nervos.org |
| **RUSD/USDI funding** | UDT channel capacity | Faucet / transfer from JoyID wallet |
| **FIBER_SECRET_KEY_PASSWORD** | Encrypts private key file | Set in `.env` or docker-compose |
| **Private key backup** | For production — don't lose your key | Export from `fiber1-data:/app/data/ckb/key` |

### 🔒 Production-Only (Not In Dev Docker)

| Item | Why |
|---|---|
| Custom private key | Import your own CKB key instead of auto-generated |
| Mainnet config | Different script hashes, bootnodes, chain param |
| Watchtower | Monitor channels while offline (Fiber has built-in) |
| TLS for RPC | Biscuit auth for public-facing RPC |

## Official Setup Steps (for reference)

From [Fiber testnet-nodes.md](https://github.com/nervosnetwork/fiber/blob/develop/docs/testnet-nodes.md):

```bash
# 1. Download FNN
mkdir tmp && cd tmp
tar xzvf fnn-latest.tar.gz

# 2. Create CKB account + export key
mkdir -p testnet-fnn/nodeA/ckb
ckb-cli account new
ckb-cli account export --lock-arg <lock_arg> --extended-privkey-path exported-key
head -n 1 ./exported-key > testnet-fnn/nodeA/ckb/key
chmod 600 testnet-fnn/nodeA/ckb/key

# 3. Copy config
cp config/testnet/config.yml testnet-fnn/nodeA

# 4. Fund address via faucet
# CKB: https://faucet.nervos.org
# RUSD: https://testnet0815.stablepp.xyz/faucet

# 5. Start node
FIBER_SECRET_KEY_PASSWORD='your_password' RUST_LOG=info \
  ./fnn -c testnet-fnn/nodeA/config.yml -d testnet-fnn/nodeA
```

**Our Docker abstracts steps 1-3 automatically.** Users only need step 4 (funding) and a password.

## Testnet Public Nodes

| Node | Pubkey | Bootnode Address |
|---|---|---|
| node1 | `02b6d4e3...` | `/ip4/54.179.226.154/tcp/8228/p2p/Qmes1EBD4y...` |
| node2 | `0291a657...` | `/ip4/16.163.7.105/tcp/8228/p2p/QmdyQWjPtb...` |

These are pre-configured in our `fiber-testnet-config.yml` as bootnodes.
