# @agentpay-dev/x402-facilitator

> x402 Facilitator using CKB Fiber Network as settlement layer

## Why CKB Fiber for x402?

| | Coinbase x402 (Base L2) | AgentPay x402 (CKB Fiber) |
|---|---|---|
| Settlement Speed | ~2 seconds | **milliseconds** |
| Transaction Cost | ~$0.0001 | **~$0** |
| BTC Support | â?| âœ?(via Cch) |
| Hold Invoice | â?| âœ?(trustless) |

## Install

```bash
npm install @agentpay-dev/x402-facilitator @agentpay-dev/core
```

## Usage â€?Middleware (one-line paywall)

```ts
import { createX402Middleware } from '@agentpay-dev/x402-facilitator';
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

## Usage â€?Standalone Facilitator

```bash
FIBER_RPC_URL=http://127.0.0.1:8227 npx tsx src/index.ts
```

Endpoints:
- `POST /verify` â€?Verify payment against requirements
- `POST /settle` â€?Settle a verified payment

## License

MIT
