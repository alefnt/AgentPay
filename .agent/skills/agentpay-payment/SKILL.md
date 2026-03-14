---
description: Make payments between AI agents using AgentPay protocol on Fiber Network
---

# AgentPay Payment Skill

Use this skill when an AI agent needs to **pay another agent** for a service (translation, code review, data analysis, etc.) using the AgentPay protocol.

## What This Does

AgentPay uses **Hold Invoice** (Fiber Network PTLC) to guarantee trustless payments:
1. Provider locks funds with a Hold Invoice
2. Client pays → funds are **locked** (not transferred)
3. Provider does the work
4. Provider reveals preimage → funds **settle** to provider
5. If timeout → funds automatically **refund** to client

## Prerequisites

- AgentPay SDK installed: `npm install @agentpay/sdk`
- A running Fiber node (or Hub API key for managed mode)

## How to Pay Another Agent

```typescript
import { AgentWallet } from '@agentpay/sdk';

// 1. Create wallet (connects to Fiber node or Hub)
const wallet = new AgentWallet({
  fiberRpcUrl: 'http://127.0.0.1:8227',  // local Fiber node
  // OR for managed mode:
  // hubUrl: 'https://hub.agentpay.dev',
  // hubApiKey: 'ak_...',
});

// 2. Pay and call a service in one step
const result = await wallet.payAndCall(
  'http://provider-agent:3000',   // Provider's HTTP endpoint
  'translate',                     // Service name
  { text: 'Hello', target: 'zh' }, // Input
  {
    maxBudget: '1000000000',       // Max 10 CKB
    asset: 'USDI',                 // Pay in stablecoin
    timeoutSeconds: 30,            // Auto-refund after 30s
  },
);

console.log(result.output);       // { translated: '你好' }
console.log(result.amount);       // Actual amount paid
console.log(result.payment_hash); // Payment proof
```

## Payment Assets

| Asset | Description | Use Case |
|---|---|---|
| `USDI` | USD stablecoin (xUDT) | Default — stable pricing |
| `CKB` | Native CKB token | Channel deposits |
| `BTC` | Bitcoin (via Cch/Lightning) | Cross-chain payments |
| `USDT` | Tether (xUDT) | Alternative stablecoin |

## Supported Schemes

| Scheme | Description |
|---|---|
| `hold` | 🔒 Lock → work → settle or refund (default, trustless) |
| `exact` | Pay upfront (x402 compatible) |
| `upto` | Lock max → pay actual usage → refund remainder |

## Error Handling

```typescript
try {
  const result = await wallet.payAndCall(providerUrl, service, input, options);
} catch (err) {
  if (err.message.includes('exceeds max budget')) {
    // Provider's price is too high
  } else if (err.message.includes('Payment failed')) {
    // Fiber channel issue — check balance/routing
  } else if (err.message.includes('timed out')) {
    // Provider didn't respond — funds auto-refunded
  }
}
```

## Channel Management

```typescript
// Check node status
const info = await wallet.nodeInfo();
console.log(info.public_key); // Your Agent ID

// List open channels
const channels = await wallet.listChannels();

// Open a channel with another Agent
await wallet.openChannel(
  peerPubkey,
  '100000000000', // 1000 CKB funding
);
```

## Cross-Chain (BTC Lightning)

```typescript
// Pay a BTC Lightning invoice through Fiber → Cch → Lightning
await wallet.payBtcLightning('lnbc...');
```
