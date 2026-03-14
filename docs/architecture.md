# AgentPay — Architecture

## Design Philosophy

**Core = Fiber + Stablecoins. Everything else = Ecosystem Extension.**

```
                    ┌─────────────────────────────────────┐
                    │         AI Agent Ecosystem           │
                    │   Claude / GPT / Grok / Custom       │
                    └────────────┬────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
    ┌─────┴─────┐         ┌─────┴─────┐         ┌─────┴─────┐
    │   MCP     │         │   SDK     │         │  Skills   │
    │  Server   │         │  Direct   │         │   File    │
    └─────┬─────┘         └─────┬─────┘         └─────┬─────┘
          │                      │                      │
    ┌─────┴─────┐         ┌─────┴─────┐         ┌─────┴─────┐
    │   x402    │         │   Hub     │         │  Docker   │
    │ Paywall   │         │  Managed  │         │ 1-Click   │
    └─────┬─────┘         └─────┬─────┘         └─────┬─────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌────────────┴────────────────┐
                    │     AgentPay Protocol       │
                    │                             │
                    │  REQUEST → OFFER → PAY →    │
                    │  HOLD INVOICE → EXECUTE →   │
                    │  SETTLE (preimage)          │
                    └────────────┬────────────────┘
                                 │
               ══════════════════╧══════════════════
                          CORE LAYER
               ════════════════════════════════════

                    ┌────────────────────────────┐
                    │   CKB Fiber Network (L2)   │
                    │                            │
                    │  Channels: xUDT stablecoin │
                    │  Hold Invoice: trustless   │
                    │  Speed: ~20ms P2P          │
                    │  Cost: $0 (channel-internal)│
                    └────────────┬───────────────┘
                                 │
                    ┌────────────┴───────────────┐
                    │   Settlement Currency      │
                    │                            │
                    │  USDI / USDT / USDC (xUDT) │
                    │  = Agent payment unit       │
                    │  = No volatility            │
                    │  = Real-world pricing       │
                    └────────────────────────────┘

               ════════════════════════════════════
                       EXTENSION LAYER
               ════════════════════════════════════

    ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐
    │  x402     │  │  Cch      │  │  RGB++    │  │  AP2      │
    │           │  │           │  │           │  │           │
    │ ETH Agent │  │ BTC Agent │  │ BTC Asset │  │ Google    │
    │ compat    │  │ on/off    │  │ bridge    │  │ Agent     │
    │           │  │ ramp      │  │           │  │ compat    │
    │ USDC→Fiber│  │ BTC→Fiber │  │ xUDT Leap │  │ Mandate→  │
    │           │  │           │  │           │  │ HoldInv   │
    └───────────┘  └───────────┘  └───────────┘  └───────────┘
    For ETH       For BTC         For BTC        For Google
    community     Lightning       on-chain       A2A agents
                  users           assets
```

## Core Layer (Must Work Independently)

### Payment Flow

```
Agent A (Caller)                          Agent B (Provider)
    │                                         │
    │  1. REQUEST: "translate, budget $0.01"   │
    ├────────────────────────────────────────▶│
    │                                         │
    │  2. OFFER: "$0.008 USDI, Hold Invoice"  │
    │◀────────────────────────────────────────┤
    │                                         │
    │  3. PAY: send_payment(hold_invoice)      │
    │  → Fiber locks $0.008 USDI in PTLC       │
    │                                         │
    │  4. EXECUTE: Agent B translates          │
    │                                         │
    │  5. SETTLE: reveal preimage              │
    │  → $0.008 USDI released to Agent B      │
    │                                         │
    │  6. RESULT: { translated: "你好世界" }   │
    │◀────────────────────────────────────────┤
```

### Key Design Decisions

| Decision | Why |
|---|---|
| **Stablecoin as default** | Agent services are priced in dollars, not crypto. $0.01 USDI stays $0.01. |
| **Fiber (not Lightning)** | Multi-asset channels (xUDT stablecoins), Hold Invoice, CKB programmability |
| **Hold Invoice** | Trustless escrow — no intermediary, no prepayment risk |
| **xUDT (not ERC-20)** | CKB native token standard, lives in Fiber channels, zero gas |

### Settlement Currencies

| Currency | Type | Status | Role |
|---|---|---|---|
| **USDI** | CKB xUDT | 🟢 Available | Primary Agent payment unit |
| **USDT** | RGB++ xUDT | 🟡 Pending Tether | Secondary stablecoin |
| **USDC** | xUDT | 🔴 Future | If Circle deploys on CKB |
| CKB | Native | 🟢 Available | Channel deposit / gas |

## Extension Layer (For Ecosystem Adoption)

Each extension lets a different community use AgentPay:

### x402 — ETH Community
```
ETH Agent → x402 (HTTP 402) → AgentPay Facilitator → Fiber
```
- ETH agents pay with USDC, Facilitator converts to Fiber
- Unchanged x402 protocol — Coinbase ecosystem compatible

### Cch — BTC Lightning Users
```
BTC User → Lightning Invoice → Cch → Fiber balance
(one-time deposit, then all payments happen on Fiber)
```
- On-ramp/off-ramp only, NOT per-payment
- Reduces HTLC cross-chain risks (liquidity, timing, free option)

### RGB++ — BTC On-chain Assets
```
BTC Asset (RGB++ on BTC) → Leap → CKB xUDT → Fiber channel
```
- Bridge BTC-issued tokens to use in Fiber payments
- WBTC, future BTC-side stablecoins

### AP2 — Google Agent Ecosystem
```
Google Agent → AP2 Mandate (W3C VC) → AgentPay Adapter → Fiber Hold Invoice
```
- IntentMandate → ServiceRequest
- PaymentMandate → HoldInvoice
- Receipt → SettledInvoice (preimage proof)

## Package Architecture

```
@agentpay/core          Foundation: Fiber RPC + xUDT assets + .bit identity
    ↑
@agentpay/sdk           Developer API: AgentWallet + ServiceProvider + Hub
    ↑
@agentpay/mcp-server    AI Integration: Claude/GPT MCP tools
@agentpay/ap2           Extension: Google AP2 compatibility
@agentpay/x402          Extension: Coinbase x402 compatibility
@agentpay/create        Scaffolding: One-command project generator

services/hub            Managed mode: zero-infrastructure Fiber access
services/registry       Discovery: find and compare Agent services
```

## 6 Ways to Use AgentPay

| # | Method | Who | Complexity |
|---|---|---|---|
| 1 | **Docker** | Developers | `pnpm setup` → 1 command |
| 2 | **Hub** | Non-technical | API key, zero infra |
| 3 | **SDK** | TypeScript devs | `npm install @agentpay/sdk` |
| 4 | **MCP** | Claude/GPT users | JSON config |
| 5 | **Skills** | AI coding assistants | Read `.agent/skills/` |
| 6 | **x402** | HTTP services | 1-line middleware |

## Payment Schemes

| Scheme | Flow | Use Case |
|---|---|---|
| **hold** | Lock → work → settle/refund | Agent services (🔒 trustless) |
| **exact** | Pay upfront | Simple purchases, x402 compat |
| **upto** | Lock max → pay actual | Metered usage |

## What Works Today

| Layer | Component | Status |
|---|---|---|
| **Core** | Fiber RPC client | ✅ 66 tests |
| **Core** | Hold Invoice protocol | ✅ Code complete |
| **Core** | Hold Scheme (verify/settle/cancel) | ✅ Complete |
| **Core** | AgentWallet.payAndCall() | ✅ 17 tests |
| **Core** | ServiceProvider | ✅ HTTP server |
| **Core** | Hub (managed mode) | ✅ 23 tests |
| **Core** | Service Registry | ✅ 27 tests |
| **Core** | .bit DID identity | ✅ 4 tests |
| **Core** | Docker (Fiber v0.7.1) | ✅ Running |
| **Core** | One-click setup | ✅ `pnpm setup` |
| **Core** | Skills (payment + provider) | ✅ Complete |
| Extension | x402 Facilitator (exact + hold) | ✅ 10 tests |
| Extension | AP2 Adapter | ✅ 7 tests |
| Extension | RGB++ Bridge | ✅ 13 tests |
| Extension | Cch (LND connected) | ✅ Verified |
| Extension | MCP Server | ✅ 11 tests |
| **Total** | | **172+ tests** |

## What's Needed for Production

1. **Fiber mainnet** — Q1 2026 (imminent!)
2. **USDI xUDT deployed** — needs real stablecoin on CKB mainnet
3. **Cch liquidity providers** — for BTC on/off ramp
4. **Multi-hop routing** — Fiber payment routing between non-direct channels
5. **End-to-end demo** — two Agent containers completing a real payment
