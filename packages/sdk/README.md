# @agentpay/sdk

> SDK for building AI Agents that pay and get paid via CKB Fiber Network

## Features

- **AgentWallet** — Client-side SDK for calling paid Agent services
- **ServiceProvider** — Server-side SDK for receiving paid service requests
- **HubClient** — Managed Fiber access (no node required)
- **Hold Scheme** — Trustless escrow: lock → verify → settle/cancel
- **Production-hardened** — Input validation, timeouts, CORS, body limits
- **Fiber v0.7.1 Compatible** — Auto hex conversion for all RPC calls

## 6 Ways to Use AgentPay

| Method | Best For | Example |
|---|---|---|
| **SDK** | TypeScript apps | `new AgentWallet(...)` |
| **MCP** | Claude/GPT AI | `npx agentpay-mcp` |
| **Skills** | Any AI framework | `.agent/skills/agentpay-payment/` |
| **x402** | HTTP 402 middleware | `/x402/create-hold` |
| **Hub** | No node needed | `createHubWallet(...)` |
| **Docker** | Self-hosted node | `pnpm setup` |

## Install

```bash
npm install @agentpay/sdk @agentpay/core
```

## Quick Start

### As a Caller (pay for services)

```ts
import { AgentWallet } from '@agentpay/sdk';

const wallet = new AgentWallet({ fiberRpcUrl: 'http://127.0.0.1:8227' });

const result = await wallet.payAndCall(
  'http://translate-bot:3001',
  'translate',
  { text: 'Hello World', target: 'zh' },
  { maxBudget: '1000000000' },
);

console.log(result.output);  // { translated: '[zh] Hello World' }
console.log(result.amount);  // '100000000' (actual cost)
```

### As a Provider (earn from services)

```ts
import { ServiceProvider } from '@agentpay/sdk';

const provider = new ServiceProvider({
  services: [{
    name: 'translate',
    description: 'Translate text between languages',
    pricing: { model: 'per-call', amount: '100000000', asset: 'CKB' },
    input_schema: { text: 'string', target: 'string' },
    output_schema: { translated: 'string' },
  }],
});

provider.onTask('translate', async (input) => {
  const { text, target } = input as { text: string; target: string };
  return { translated: `[${target}] ${text}` };
});

provider.listen(3001);
```

### Hold Scheme (escrow)

```ts
// Provider creates hold invoice
const { invoice_address, preimage, payment_hash } =
  await wallet.createHoldInvoice('100000000', 'Translation job');

// Client pays the invoice (funds locked)
await clientWallet.rpc.sendPayment({ invoice: invoice_address });

// Provider does the work, then settles (collects funds)
await wallet.rpc.settleInvoice({ payment_hash, payment_preimage: preimage });

// OR cancel (refund to client)
await wallet.rpc.cancelInvoice({ payment_hash });
```

### Via Hub (no Fiber node needed)

```ts
import { createHubWallet } from '@agentpay/sdk';

const wallet = createHubWallet({
  hubUrl: 'http://hub.agentpay.dev:4000',
  apiKey: 'ap_your_key_here',
});

const result = await wallet.payAndCall(
  'http://translate-bot:3001', 'translate',
  { text: 'Hello', target: 'zh' },
);
```

## Protocol Flow (Hold Scheme)

```
Caller                    Provider                  Fiber
  |                       |---- newInvoice(hash) ---->|  (hold)
  |<-- INVOICE -----------|                           |
  |---- sendPayment ------+-------------------------->|  (locked)
  |--- TASK_INPUT ------->|                           |
  |                       |---- execute task          |
  |                       |---- settleInvoice ------->|  (settled)
  |<-- TASK_RESULT -------|                           |
```

## License

MIT
