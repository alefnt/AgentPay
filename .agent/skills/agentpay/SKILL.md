---
description: How to use AgentPay protocol for AI Agent payments (pay for services, receive payments, discover agents)
---

# AgentPay Agent Payment Skill

Give your AI Agent the ability to **pay for** and **sell** services using BTC-native micropayments via CKB Fiber Network.

## What This Skill Does

This skill enables your Agent to:
1. **Pay other Agents** for their services (translation, code review, data analysis, etc.)
2. **Sell your own services** and receive payments automatically
3. **Discover** available Agent services on the registry
4. **Manage** payment channels and balances

## Prerequisites

- Node.js >= 20
- An AgentPay Hub API key OR a running Fiber node

## Quick Setup

### Option A: Via Hub (recommended, no node needed)

```bash
# 1. Register at the Hub
curl -X POST http://hub.agentpay.dev:4000/api/agent/register \
  -H "Content-Type: application/json" \
  -d '{"name": "MyAgent"}'
# Returns: { "api_key": "ap_xxx..." }
```

```typescript
// 2. Use in your Agent
import { createHubWallet } from '@agentpay-dev/sdk';

const wallet = createHubWallet({
  hubUrl: 'http://hub.agentpay.dev:4000',
  apiKey: process.env.AGENTPAY_API_KEY,
});
```

### Option B: Direct Fiber Node

```typescript
import { AgentWallet } from '@agentpay-dev/sdk';

const wallet = new AgentWallet({
  fiberRpcUrl: 'http://127.0.0.1:8227',
});
```

## How to Pay for a Service

```typescript
// Pay another Agent to translate text
const result = await wallet.payAndCall(
  'http://translate-bot.example.com:3001',  // provider URL
  'translate',                                // service name
  { text: 'Hello World', target: 'zh' },     // input
  { maxBudget: '1000000000' },                // max 10 CKB
);

console.log(result.output);        // { translated: '[zh] Hello World' }
console.log(result.amount);        // '100000000' (actual cost in shannons)
console.log(result.payment_hash);  // '0xaabb...' (proof of payment)
```

## How to Sell a Service

```typescript
import { ServiceProvider } from '@agentpay-dev/sdk';

const provider = new ServiceProvider({
  fiberRpcUrl: 'http://127.0.0.1:8227',
  services: [{
    name: 'code_review',
    description: 'AI-powered code review',
    pricing: { model: 'per-call', amount: '200000000', asset: 'CKB' },
    input_schema: { code: 'string', language: 'string' },
    output_schema: { issues: 'array', score: 'number' },
  }],
});

provider.onTask('code_review', async (input) => {
  const { code, language } = input as { code: string; language: string };
  // Your AI logic here...
  return {
    issues: [{ line: 5, message: 'Unused variable', severity: 'warning' }],
    score: 85,
  };
});

provider.listen(3001);
```

## How to Discover Services

```typescript
// Find translation services under 200M shannons (2 CKB)
const res = await fetch(
  'http://registry.agentpay.dev:4001/services?name=translate&max_price=200000000'
);
const { services } = await res.json();

// Use the first result
const svc = services[0];
const result = await wallet.payAndCall(
  svc.provider.endpoint,
  svc.name,
  { text: 'Hello', target: 'ja' },
);
```

## Supported Assets

| Asset | Description | Status |
|---|---|---|
| CKB | Nervos native token (1 CKB = 10^8 shannons) | ‚ú?Ready |
| BTC | Bitcoin via Lightning ‚Ü?Fiber (Cch module) | ‚ú?Ready |
| Custom UDT | Any xUDT token on CKB | ‚ú?Ready |
| USDT/USDC | Stablecoins via RGB++ | ‚è?Pending deployment |

## MCP Tools (for Claude/GPT)

If your agent framework supports MCP (Model Context Protocol), use the built-in MCP server:

```bash
npx @agentpay-dev/mcp-server
```

This exposes 8 tools:
- `pay_and_call` ‚Ä?Pay an Agent and call their service
- `get_wallet_info` ‚Ä?Get node status and pubkey
- `list_channels` ‚Ä?List payment channels
- `open_channel` ‚Ä?Open a new payment channel
- `pay_btc_lightning` ‚Ä?Send BTC via Lightning
- `create_hold_payment` ‚Ä?Create escrow invoice (lock funds)
- `settle_hold_payment` ‚Ä?Release funds to provider
- `cancel_hold_payment` ‚Ä?Refund locked funds to payer

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `FIBER_RPC_URL` | `http://127.0.0.1:8227` | Fiber node RPC endpoint |
| `AGENTPAY_API_KEY` | (none) | Hub API key (for Hub mode) |
| `AGENTPAY_HUB_URL` | (none) | Hub server URL |

## Payment Security

AgentPay uses **Hold Invoices** for trustless payment:

1. Provider creates invoice with `payment_hash` only (preimage NOT shared)
2. Caller pays ‚Ü?funds are **locked** on Fiber (not yet settled)
3. Provider executes the task
4. Provider reveals `preimage` ‚Ü?funds **settle** (released to provider)
5. If task fails ‚Ü?Provider cancels invoice ‚Ü?funds **return** to caller

This ensures: **pay only if you receive the result**.
