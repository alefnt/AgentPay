# @agentpay/x402-facilitator

> x402 Facilitator using CKB Fiber Network as settlement layer

## Why CKB Fiber for x402?

| | Coinbase x402 (Base L2) | AgentPay x402 (CKB Fiber) |
|---|---|---|
| Settlement Speed | ~2 seconds | **milliseconds** |
| Transaction Cost | ~$0.0001 | **~$0** |
| BTC Support | ❌ | ✅ (via Cch) |
| Hold Invoice | ❌ | ✅ (trustless) |

## Install

```bash
npm install @agentpay/x402-facilitator @agentpay/core
```

## Usage — Middleware (one-line paywall)

```ts
import { createX402Middleware } from '@agentpay/x402-facilitator';
import { createServer } from 'node:http';

const paywall = createX402Middleware({ price: '100000000', asset: 'CKB' });

createServer(async (req, res) => {
  await paywall(req, res, () => {
    // Only reached if payment is verified
    res.writeHead(200);
    res.end(JSON.stringify({ data: 'premium content' }));
  });
}).listen(3000);
```

## Usage — Standalone Facilitator

```bash
FIBER_RPC_URL=http://127.0.0.1:8227 npx tsx src/index.ts
```

Endpoints:
- `POST /verify` — Verify payment against requirements
- `POST /settle` — Settle a verified payment

## License

MIT
