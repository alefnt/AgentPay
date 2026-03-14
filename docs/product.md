# AgentPay — Product Overview

## What We're Building

**AgentPay is a payment protocol for AI Agents.** It gives every Agent a wallet, lets Agents pay each other for services, and ensures both parties are protected through cryptographic guarantees.

## The Problem

AI Agents are getting smarter every day. But they can't spend money.

- Agent A needs a translation → Agent B can translate → **How does A pay B?**
- Stripe/Alipay are for humans — Agents can't open accounts
- Pre-paying APIs requires trust — what if the provider doesn't deliver?
- ETH gas is too expensive for $0.001 micropayments

**Agents need their own economic system.**

## The Solution

AgentPay provides:

1. **Agent Wallet** — Each Agent has a keypair (identity) and a Fiber payment channel
2. **Pay-and-Call** — `wallet.payAndCall('translate', {text, target})` — 3 lines of code
3. **Hold Invoice** — Trustless escrow: lock funds → Agent works → unlock with preimage
4. **Service Registry** — Agents discover and compare each other's services
5. **Multi-asset** — CKB, BTC (via Cch), stablecoins (via RGB++/xUDT)

## Why Fiber Network?

| Requirement | Why it matters for Agents | How Fiber solves it |
|---|---|---|
| **Trustless guarantee** | Agents operate unsupervised — can't call customer support if scammed | Hold Invoice: lock → work → unlock OR timeout → refund |
| **True micropayments** | Agent tasks cost $0.001-0.01, needs zero-fee payments | Channel-internal: no gas, no on-chain tx, truly free |
| **Millisecond speed** | Agents make decisions in ms, can't wait 2s per payment | P2P channel: latency = network RTT (~20ms) |
| **BTC native** | BTC is the largest crypto ecosystem, most Agents' users hold BTC | Cch: Lightning ↔ Fiber atomic swap, verified working |
| **Multi-asset channels** | Different services price in different currencies | Single channel carries CKB + BTC + any xUDT token |
| **Programmable** | Payment logic needs to be composable with Agent logic | CKB Script (RISC-V) — Turing complete on-chain logic |

### Why NOT Lightning?
Lightning only carries BTC. No stablecoins, no custom tokens. No Hold Invoice standard. No multi-asset channels.

### Why NOT Base L2 (x402)?
Every payment requires an on-chain transaction (~2s, ~$0.0001). That's fine for humans, but Agents doing 1000 calls/day need true zero-fee, instant settlement.

### Why NOT Solana/TON?
No payment channels (every tx is on-chain). No trustless escrow (Hold Invoice). Not BTC-native.

## What We've Built (Phase 1-3)

| Component | Status | What it does |
|---|---|---|
| @agentpay/core | ✅ 66 tests | Fiber RPC client + RGB++ Bridge + Asset registry |
| @agentpay/sdk | ✅ 17 tests | AgentWallet, ServiceProvider, HubClient |
| @agentpay/mcp-server | ✅ 11 tests | Claude/GPT can pay via MCP tools |
| @agentpay/x402 | ✅ 10 tests | ETH Agent compatibility (x402 bridge) |
| Hub Server | ✅ 23 tests | Managed Fiber access (zero infrastructure) |
| Registry | ✅ 27 tests | Agent service discovery |
| Docker Stack | ✅ Verified | LND + Fiber + Cch — full BTC cross-chain |
| **Total** | **161 tests** | |

## What's Verified on Live Testnet

- ✅ Fiber v0.7.1 node running (Docker, 2 peers connected)
- ✅ Cch module connected to LND (`cch started successfully`)
- ✅ LND v0.18.0-beta running (Neutrino signet)
- ✅ All 3 Cch RPC methods respond (send_btc, receive_btc, get_cch_order)
- ✅ RGB++ Bridge code integrated (BTC ↔ CKB asset Leap)

## Roadmap

- [x] Phase 1: Core SDK + Hold Invoice
- [x] Phase 2: MCP + x402 + Agent Skills
- [x] Phase 3: RGB++ Bridge + Cch verification
- [ ] Phase 4: Mainnet (when Fiber mainnet launches)
