# @agentpay-dev/core

> Core library for the AgentPay BTC-native Agent payment protocol

## Features

- **Fiber RPC Client** â€?Full JSON-RPC client for CKB Fiber Network (Channel, Invoice, Payment, Cch, Peer, Info, Graph modules)
- **Production-hardened** â€?Request timeouts, retry with exponential backoff, input validation, structured error types
- **Asset Registry** â€?CKB native + UDT assets (USDT, USDC, USDI, WBTC)
- **Agent Identity** â€?Pubkey-based identity, payload signing/verification
- **Structured Logger** â€?Zero-dependency pino-compatible JSON logger
- **TypeScript** â€?Full type definitions for all Fiber Network types

## Install

```bash
npm install @agentpay-dev/core
```

## Usage

```ts
import { FiberRpcClient, createLogger, TESTNET_ASSETS } from '@agentpay-dev/core';

// Fiber RPC
const fiber = new FiberRpcClient({
  rpcUrl: 'http://127.0.0.1:8227',
  timeoutMs: 30000,
  maxRetries: 2,
});

const info = await fiber.nodeInfo();
const { invoice_address } = await fiber.newInvoice({
  amount: '100000000',
  currency: 'Fibt',
});

// Logger
const log = createLogger({ name: 'my-agent', version: '1.0.0' });
log.info({ invoice: invoice_address }, 'Invoice created');
```

## API

### FiberRpcClient

| Method | Module | Description |
|---|---|---|
| `openChannel()` | Channel | Open a payment channel |
| `listChannels()` | Channel | List all channels |
| `newInvoice()` | Invoice | Create a Fiber invoice (including Hold Invoice) |
| `sendPayment()` | Payment | Send a payment to an invoice |
| `settleInvoice()` | Invoice | Settle a Hold Invoice with preimage |
| `sendBtc()` | Cch | Cross-chain payment to BTC Lightning |
| `nodeInfo()` | Info | Get node status |
| `graphNodes()` | Graph | Browse network topology |

### Error Types

- `FiberRpcError` â€?RPC-level errors from the Fiber node
- `FiberTimeoutError` â€?Request timeout (configurable, default 30s)
- `FiberValidationError` â€?Input validation failures

## License

MIT
