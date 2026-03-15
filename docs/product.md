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

1. **Agent Wallet** — Each Agent has a keypair + Fiber channel + .bit DID
2. **Stablecoin Settlement** — Pay in USDI/USDT (no volatility, real-world pricing)
3. **Hold Invoice** — Trustless escrow: lock funds → Agent works → unlock with preimage
4. **Service Registry** — Agents discover and compare each other's services
5. **Ecosystem Extensions** — x402 (ETH), Cch (BTC), RGB++ (BTC assets), AP2 (Google)

## Why Fiber Network?

| Requirement | Why it matters for Agents | How Fiber solves it |
|---|---|---|
| **Trustless guarantee** | Agents operate unsupervised — can't call customer support | Hold Invoice: lock → work → unlock OR timeout → refund |
| **Stablecoin channels** | Agent tasks priced in dollars, not volatile crypto | xUDT stablecoins in Fiber channels |
| **True micropayments** | Agent tasks cost $0.001-0.01, needs zero-fee | Channel-internal: no gas, truly free |
| **Millisecond speed** | Agents make decisions in ms | P2P channel: ~20ms |
| **BTC on-ramp** | Largest crypto user base | Cch: Lightning ↔ Fiber |
| **Multi-asset** | Different currencies needed | Single channel carries CKB + BTC + any xUDT |

## vs Web2 Payments (Stripe / Alipay)

| Dimension | Web2 (Stripe/Alipay) | AgentPay (Fiber) |
|---|---|---|
| Agent can open account | ❌ Requires human KYC | ✅ Keypair = account |
| Micropayments | ❌ Stripe min $0.50 + 2.9% fee | ✅ $0.001, zero fee |
| Settlement speed | 3-7 days | ✅ Milliseconds |
| Cross-border | ⚠️ Region-locked | ✅ Borderless |
| Trustless escrow | ❌ Human arbitration | ✅ Hold Invoice (automatic) |
| Compliance | ✅ Full KYC/AML | ⚠️ Needs compliance layer |
| User experience | ✅ Bind card, done | ⚠️ Needs wallet (Hub mode helps) |
| Fiat support | ✅ Native | ⚠️ Via compliant stablecoins |

**AgentPay doesn't replace Stripe — it does what Stripe can't**: let AI Agents without bank accounts pay each other autonomously, with cryptographic guarantees, for fractions of a cent.

**Bridging the gap**: Hub managed mode abstracts away wallets/channels (API Key = done). Fiat on-ramp via compliant stablecoins (user sees "$0.01" not "10000 shannons").

## How AgentPay Enhances the Ecosystem

AgentPay is **not** a competitor to x402, AP2, or Stripe — it's a **complementary settlement layer** that solves problems each platform cannot solve alone.

### For x402 (Coinbase)

x402 uses HTTP 402 to enable pay-per-request APIs. AgentPay plugs in as a **new payment backend** alongside ERC-20 and Solana:

| Capability | x402 Native | x402 + AgentPay |
|---|---|---|
| Gas fee per payment | $0.01+ | **$0** |
| Settlement speed | ~15s (block confirm) | **~50ms** |
| Delivery guarantee | ❌ (pay then hope) | **✅ Hold Invoice** |
| BTC payments | ❌ | **✅ via Cch** |
| Minimum payment | ~$0.01 | **$0.000001** |

**How it works:** `@agentpay/x402-facilitator` implements the x402 Facilitator interface. Any x402-enabled API server can add AgentPay as a payment option — users who pay via Fiber get zero gas, instant settlement, and Hold Invoice escrow protection.

### For AP2 (Google)

Google's Agent Payment Protocol defines **authorization** (who can spend), **authenticity** (is the request real), and **accountability** (who's responsible). But AP2 itself **does not settle payments** — it delegates to "payment rails."

```
AP2 defines: WHO can pay and WHY (authorization + accountability)
AgentPay provides: HOW to settle (zero-fee micropayment channel)
```

| Scenario | AP2 + Credit Card | AP2 + AgentPay |
|---|---|---|
| Agent pays $0.001 for API call | ❌ $0.30 fee > transaction | ✅ Zero fee |
| Agent operates cross-border | 🟡 FX fees + restrictions | ✅ Borderless |
| Agent opens own account | ❌ Needs human to bind card | ✅ Fiber node = wallet |
| Unsatisfied with result | 🟡 Chargeback weeks | ✅ Hold cancel = instant refund |

**How it works:** `@agentpay/ap2` bridges AP2 message protocol to Fiber settlement. Agents using AP2 can choose AgentPay as their settlement backend for microtransactions where credit cards are impractical.

### For Stripe

Stripe is the world's best payment platform for **human commerce**. AgentPay handles what Stripe was never designed for: **Agent-to-Agent micropayments**.

| Scenario | Best Choice | Why |
|---|---|---|
| User deposits $100 | **Stripe** | Fiat, KYC, compliance ✅ |
| Agent calls $0.001 API | **AgentPay** | Zero fee, no KYC needed |
| Enterprise SaaS subscription | **Stripe** | Invoicing, tax, reporting ✅ |
| Agent-to-Agent micropayment | **AgentPay** | Autonomous, instant, Hold escrow |
| IoT device-to-device | **AgentPay** | No bank account required |
| Fiat withdrawal | **Stripe** | Bank transfer ✅ |

**They coexist:** Users deposit via Stripe → exchange to stablecoin → Agent autonomously spends via AgentPay.

### AgentPay's Position in the Ecosystem

```
  Human / Enterprise
         │
         │ Fiat / Subscription
         ▼
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │   Stripe    │     │ AP2 (Google) │    │ x402 (CB)   │
  │  (Fiat GW)  │     │ (Auth+Audit) │    │ (HTTP 402)  │
  └──────┬──────┘     └──────┬──────┘    └──────┬──────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                  ┌──────────▼──────────┐
                  │     AgentPay        │
                  │  Settlement Layer   │
                  │                     │
                  │  • Zero gas         │
                  │  • Hold Invoice     │
                  │  • Millisecond      │
                  │  • BTC interop      │
                  │  • Stablecoins      │
                  └──────────┬──────────┘
                             │
                  ┌──────────▼──────────┐
                  │   Fiber Network     │
                  │   (CKB L2 PTLC)    │
                  └─────────────────────┘
```


## Fiat Currency Path

Sovereign currencies (USD, RMB) can flow into AgentPay via compliant stablecoins:

```
User pays $10 USD
    → Compliant exchange (e.g. Circle, licensed provider)
    → 10 USDI xUDT on CKB
    → Deposited to Fiber channel
    → Agent uses USDI for 1000 micropayments ($0.01 each)
    
Agent withdraws earnings  
    → Fiber channel → CKB L1
    → Compliant exchange → USD to bank account
```

Fiber channels don't care what xUDT token they carry. If a compliant issuer deploys a 1:1 USD-backed xUDT on CKB, that's effectively dollar payments on Fiber.

## Honest Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Fiber has no mainnet** | 🔴 Critical | All code runs on testnet. We wait for Fiber team. |
| **No stablecoin deployed on CKB** | 🔴 Blocking | USDI/USDT not yet issued as xUDT. Need issuer. |
| **Channel liquidity** | 🟡 Medium | Fiber needs enough nodes with open channels. |
| **Compliance** | 🟡 Medium | AP2's VC Mandate framework helps. Need legal work. |
| **Fiber adoption** | 🟡 Medium | Small ecosystem. But: first mover advantage. |

## What We've Built

| Component | Status | Tests |
|---|---|---|
| @agentpay/core (Fiber RPC + .bit) | ✅ | 70+ |
| @agentpay/sdk (Wallet + Provider + Hub) | ✅ | 17 |
| @agentpay/ap2 (Google AP2) | ✅ | 7 |
| @agentpay/mcp-server (Claude/GPT) | ✅ | 11 |
| @agentpay/x402 (ETH compat) | ✅ | 10 |
| Hub + Registry servers | ✅ | 50 |
| Docker (LND + Fiber + Cch) | ✅ Verified | — |
| **Total** | | **172+** |

## Roadmap

- [x] Phase 1: Core SDK + Hold Invoice
- [x] Phase 2: MCP + x402 + Agent Skills
- [x] Phase 3: RGB++ Bridge + Cch verification
- [x] Phase 3.5: AP2 + .bit DID identity
- [ ] Phase 4: End-to-end BTC Lightning ↔ Fiber payment
- [ ] Phase 5: Stablecoin deployment on CKB testnet
- [ ] Phase 6: Mainnet (when Fiber mainnet launches)
