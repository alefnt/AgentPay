---
description: Create a paid AI service that other agents can call and pay for using AgentPay
---

# AgentPay Provider Skill

Use this skill when you need to **create a paid service** that other AI agents can discover and pay for using the AgentPay protocol.

## What This Does

Creates an HTTP server that:
1. Advertises services with pricing
2. Creates Hold Invoices when agents request services
3. Executes tasks after payment is locked
4. Settles invoices after successful delivery
5. Automatically cancels (refunds) on failure

## Quick Start

```typescript
import { ServiceProvider } from '@agentpay-dev/sdk';

// 1. Define your service
const provider = new ServiceProvider({
  fiberRpcUrl: 'http://127.0.0.1:8227',
  services: [{
    name: 'translate',
    description: 'Translate text to any language',
    pricing: { model: 'per-call', amount: '100000000', asset: 'USDI' }, // $0.01 USDI
    input_schema: { text: 'string', target: 'string' },
    output_schema: { translated: 'string' },
  }],
});

// 2. Register handler
provider.onTask('translate', async (input: any) => {
  // Your AI logic here
  const translated = await myTranslationModel(input.text, input.target);
  return { translated };
});

// 3. Start server
provider.listen(3000);
// â†?[AgentPay Provider] Listening on 0.0.0.0:3000
// â†?[AgentPay Provider] Services: translate (100000000 USDI)
```

## Multiple Services

```typescript
const provider = new ServiceProvider({
  services: [
    {
      name: 'translate',
      description: 'Translate text',
      pricing: { model: 'per-call', amount: '100000000', asset: 'USDI' },
      input_schema: { text: 'string', target: 'string' },
      output_schema: { translated: 'string' },
    },
    {
      name: 'summarize',
      description: 'Summarize long text',
      pricing: { model: 'per-call', amount: '500000000', asset: 'USDI' },
      input_schema: { text: 'string', maxLength: 'number' },
      output_schema: { summary: 'string' },
    },
  ],
});

provider.onTask('translate', async (input: any) => {
  return { translated: `[translated] ${input.text}` };
});

provider.onTask('summarize', async (input: any) => {
  return { summary: `[summary of ${input.text.length} chars]` };
});

provider.listen(3000);
```

## Pricing Models

| Model | Description | Example |
|---|---|---|
| `per-call` | Fixed price per request | `$0.01` per translation |
| `per-token` | Price per token processed | `$0.001` per 1K tokens |
| `per-second` | Price per second of compute | `$0.01` per second |

## Endpoints

Your provider automatically exposes:

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Service status + pricing |
| `/agentpay/request` | POST | Receive SERVICE_REQUEST, return Hold Invoice |
| `/agentpay/execute` | POST | Receive TASK_INPUT after payment, execute + settle |

## Security Features (Built-in)

- Request body size limit (1MB default)
- JSON parse error handling
- CORS headers
- Service-specific handler routing
- Input validation
- Graceful error responses (no stack traces)
- Preimage cleanup after use
- Expired offer auto-cleanup (15 min)

## x402 Paywall (1-Line Integration)

For simpler HTTP services, use the x402 middleware:

```typescript
import { createX402Middleware } from '@agentpay-dev/x402-facilitator';
import { createServer } from 'http';

const paywall = createX402Middleware({
  price: '100000000',  // 1 CKB per request
  asset: 'USDI',
});

createServer((req, res) => {
  paywall(req, res, () => {
    // Only reaches here after payment
    res.end(JSON.stringify({ data: 'premium content' }));
  });
}).listen(3000);
```

## Registration (Service Discovery)

```typescript
// Register your service for discovery
const response = await fetch('http://registry.agentpay.dev/api/agents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Translation Agent',
    services: provider.services,
    endpoints: ['http://my-agent:3000'],
  }),
});
```
