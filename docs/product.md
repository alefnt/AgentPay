# AgentPay â€?Product Overview

## What We're Building

**AgentPay is a payment protocol for AI Agents.** It gives every Agent a wallet, lets Agents pay each other for services, and ensures both parties are protected through cryptographic guarantees.

## The Problem

AI Agents are getting smarter every day. But they can't spend money.

- Agent A needs a translation â†?Agent B can translate â†?**How does A pay B?**
- Stripe/Alipay are for humans â€?Agents can't open accounts
- Pre-paying APIs requires trust â€?what if the provider doesn't deliver?
- ETH gas is too expensive for $0.001 micropayments

**Agents need their own economic system.**

## The Solution

AgentPay provides:

1. **Agent Wallet** â€?Each Agent has a keypair + Fiber channel + .bit DID
2. **Stablecoin Settlement** â€?Pay in USDI/USDT (no volatility, real-world pricing)
3. **Hold Invoice** â€?Trustless escrow: lock funds â†?Agent works â†?unlock with preimage
4. **Service Registry** â€?Agents discover and compare each other's services
5. **Ecosystem Extensions** â€?x402 (ETH), Cch (BTC), RGB++ (BTC assets), AP2 (Google)

## Why Fiber Network?

| Requirement | Why it matters for Agents | How Fiber solves it |
|---|---|---|
| **Trustless guarantee** | Agents operate unsupervised â€?can't call customer support | Hold Invoice: lock â†?work â†?unlock OR timeout â†?refund |
| **Stablecoin channels** | Agent tasks priced in dollars, not volatile crypto | xUDT stablecoins in Fiber channels |
| **True micropayments** | Agent tasks cost $0.001-0.01, needs zero-fee | Channel-internal: no gas, truly free |
| **Millisecond speed** | Agents make decisions in ms | P2P channel: ~20ms |
| **BTC on-ramp** | Largest crypto user base | Cch: Lightning â†?Fiber |
| **Multi-asset** | Different currencies needed | Single channel carries CKB + BTC + any xUDT |

## vs Web2 Payments (Stripe / Alipay)

| Dimension | Web2 (Stripe/Alipay) | AgentPay (Fiber) |
|---|---|---|
| Agent can open account | â?Requires human KYC | âœ?Keypair = account |
| Micropayments | â?Stripe min $0.50 + 2.9% fee | âœ?$0.001, zero fee |
| Settlement speed | 3-7 days | âœ?Milliseconds |
| Cross-border | âš ï¸ Region-locked | âœ?Borderless |
| Trustless escrow | â?Human arbitration | âœ?Hold Invoice (automatic) |
| Compliance | âœ?Full KYC/AML | âš ï¸ Needs compliance layer |
| User experience | âœ?Bind card, done | âš ï¸ Needs wallet (Hub mode helps) |
| Fiat support | âœ?Native | âš ï¸ Via compliant stablecoins |

**AgentPay doesn't replace Stripe â€?it does what Stripe can't**: let AI Agents without bank accounts pay each other autonomously, with cryptographic guarantees, for fractions of a cent.

**Bridging the gap**: Hub managed mode abstracts away wallets/channels (API Key = done). Fiat on-ramp via compliant stablecoins (user sees "$0.01" not "10000 shannons").

## How AgentPay Enhances the Ecosystem

AgentPay is **not** a competitor to x402, AP2, or Stripe â€?it's a **complementary settlement layer** that solves problems each platform cannot solve alone.

### For x402 (Coinbase)

x402 uses HTTP 402 to enable pay-per-request APIs. AgentPay plugs in as a **new payment backend** alongside ERC-20 and Solana:

| Capability | x402 Native | x402 + AgentPay |
|---|---|---|
| Gas fee per payment | $0.01+ | **$0** |
| Settlement speed | ~15s (block confirm) | **~50ms** |
| Delivery guarantee | â?(pay then hope) | **âœ?Hold Invoice** |
| BTC payments | â?| **âœ?via Cch** |
| Minimum payment | ~$0.01 | **$0.000001** |

**How it works:** `@agentpay-dev/x402-facilitator` implements the x402 Facilitator interface. Any x402-enabled API server can add AgentPay as a payment option â€?users who pay via Fiber get zero gas, instant settlement, and Hold Invoice escrow protection.

### For AP2 (Google)

Google's Agent Payment Protocol defines **authorization** (who can spend), **authenticity** (is the request real), and **accountability** (who's responsible). But AP2 itself **does not settle payments** â€?it delegates to "payment rails."

```
AP2 defines: WHO can pay and WHY (authorization + accountability)
AgentPay provides: HOW to settle (zero-fee micropayment channel)
```

| Scenario | AP2 + Credit Card | AP2 + AgentPay |
|---|---|---|
| Agent pays $0.001 for API call | â?$0.30 fee > transaction | âœ?Zero fee |
| Agent operates cross-border | ğŸŸ¡ FX fees + restrictions | âœ?Borderless |
| Agent opens own account | â?Needs human to bind card | âœ?Fiber node = wallet |
| Unsatisfied with result | ğŸŸ¡ Chargeback weeks | âœ?Hold cancel = instant refund |

**How it works:** `@agentpay-dev/ap2` bridges AP2 message protocol to Fiber settlement. Agents using AP2 can choose AgentPay as their settlement backend for microtransactions where credit cards are impractical.

### For Stripe

Stripe is the world's best payment platform for **human commerce**. AgentPay handles what Stripe was never designed for: **Agent-to-Agent micropayments**.

| Scenario | Best Choice | Why |
|---|---|---|
| User deposits $100 | **Stripe** | Fiat, KYC, compliance âœ?|
| Agent calls $0.001 API | **AgentPay** | Zero fee, no KYC needed |
| Enterprise SaaS subscription | **Stripe** | Invoicing, tax, reporting âœ?|
| Agent-to-Agent micropayment | **AgentPay** | Autonomous, instant, Hold escrow |
| IoT device-to-device | **AgentPay** | No bank account required |
| Fiat withdrawal | **Stripe** | Bank transfer âœ?|

**They coexist:** Users deposit via Stripe â†?exchange to stablecoin â†?Agent autonomously spends via AgentPay.

### AgentPay's Position in the Ecosystem

```
  Human / Enterprise
         â”?         â”?Fiat / Subscription
         â–?  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”?    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”?    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”?  â”?  Stripe    â”?    â”?AP2 (Google) â”?   â”?x402 (CB)   â”?  â”? (Fiat GW)  â”?    â”?(Auth+Audit) â”?   â”?(HTTP 402)  â”?  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”?    â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”?   â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”?         â”?                  â”?                  â”?         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”?                             â”?                  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”?                  â”?    AgentPay        â”?                  â”? Settlement Layer   â”?                  â”?                    â”?                  â”? â€?Zero gas         â”?                  â”? â€?Hold Invoice     â”?                  â”? â€?Millisecond      â”?                  â”? â€?BTC interop      â”?                  â”? â€?Stablecoins      â”?                  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”?                             â”?                  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”?                  â”?  Fiber Network     â”?                  â”?  (CKB L2 PTLC)    â”?                  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”?```


## Fiat Currency Path

Sovereign currencies (USD, RMB) can flow into AgentPay via compliant stablecoins:

```
User pays $10 USD
    â†?Compliant exchange (e.g. Circle, licensed provider)
    â†?10 USDI xUDT on CKB
    â†?Deposited to Fiber channel
    â†?Agent uses USDI for 1000 micropayments ($0.01 each)
    
Agent withdraws earnings  
    â†?Fiber channel â†?CKB L1
    â†?Compliant exchange â†?USD to bank account
```

Fiber channels don't care what xUDT token they carry. If a compliant issuer deploys a 1:1 USD-backed xUDT on CKB, that's effectively dollar payments on Fiber.

## Honest Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Fiber has no mainnet** | ğŸ”´ Critical | All code runs on testnet. We wait for Fiber team. |
| **No stablecoin deployed on CKB** | ğŸ”´ Blocking | USDI/USDT not yet issued as xUDT. Need issuer. |
| **Channel liquidity** | ğŸŸ¡ Medium | Fiber needs enough nodes with open channels. |
| **Compliance** | ğŸŸ¡ Medium | AP2's VC Mandate framework helps. Need legal work. |
| **Fiber adoption** | ğŸŸ¡ Medium | Small ecosystem. But: first mover advantage. |

## What We've Built

| Component | Status | Tests |
|---|---|---|
| @agentpay-dev/core (Fiber RPC + .bit) | âœ?| 70+ |
| @agentpay-dev/sdk (Wallet + Provider + Hub) | âœ?| 17 |
| @agentpay-dev/ap2 (Google AP2) | âœ?| 7 |
| @agentpay-dev/mcp-server (Claude/GPT) | âœ?| 11 |
| @agentpay-dev/x402 (ETH compat) | âœ?| 10 |
| Hub + Registry servers | âœ?| 50 |
| Docker (LND + Fiber + Cch) | âœ?Verified | â€?|
| **Total** | | **172+** |

## Roadmap

- [x] Phase 1: Core SDK + Hold Invoice
- [x] Phase 2: MCP + x402 + Agent Skills
- [x] Phase 3: RGB++ Bridge + Cch verification
- [x] Phase 3.5: AP2 + .bit DID identity
- [ ] Phase 4: End-to-end BTC Lightning â†?Fiber payment
- [ ] Phase 5: Stablecoin deployment on CKB testnet
- [ ] Phase 6: Mainnet (when Fiber mainnet launches)
