# AgentPay - BTC-Native AI Agent Payment Protocol

[![npm](https://img.shields.io/npm/v/@agentpay-dev/core?label=%40agentpay-dev%2Fcore)](https://www.npmjs.com/package/@agentpay-dev/core)
[![npm](https://img.shields.io/npm/v/@agentpay-dev/sdk?label=%40agentpay-dev%2Fsdk)](https://www.npmjs.com/package/@agentpay-dev/sdk)
[![npm](https://img.shields.io/npm/v/@agentpay-dev/mcp-server?label=MCP%20Server)](https://www.npmjs.com/package/@agentpay-dev/mcp-server)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.alefnt%2Fagentpay-blue)](https://registry.modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Give every AI Agent a wallet. Let Agents pay each other - instantly, with zero fees.**

AgentPay is a **BTC-native payment protocol** designed for AI Agent economies. Built on [CKB Fiber Network](https://fiber.nervos.org/) (Lightning-compatible L2), it enables:

- **Zero-gas micropayments** - Pay per API call, no minimum amount
- **Hold Invoice escrow** - Lock funds until service delivery is confirmed
- **BTC interoperability** - Cross-chain payments via Lightning Network
- **MCP integration** - Let Claude/GPT agents make payments natively

## Quick Start

### Install

```bash
npm install @agentpay-dev/sdk @agentpay-dev/core
```

### Create a Payment Agent

```typescript
import { AgentWallet } from '@agentpay-dev/sdk';

const wallet = new AgentWallet({ fiberRpcUrl: process.env.FIBER_RPC_URL });

// Pay another agent for a service
const result = await wallet.payAndCall(
  'https://translator-agent.example.com',
  'translate',
  { text: 'Hello World', target: 'zh' }
);
```

### Scaffold a New Project

```bash
npx create-agentpay my-agent
cd my-agent && npm install
```

## Architecture

```
+-----------------------------------------------------+
|                    Applications                      |
|  AI Agents  |  DePIN Devices  |  API Marketplaces    |
+-----------------------------------------------------+
|                   AgentPay SDK                       |
|  AgentWallet  |  ServiceProvider  |  HubClient       |
+-----------------------------------------------------+
|                   AgentPay Core                      |
|  Settlement  |  Metering  |  DID  |  Assets          |
+-----------------------------------------------------+
|              CKB Fiber Network (L2)                  |
|  Payment Channels  |  Hold Invoice  |  HTLC Routing  |
+-----------------------------------------------------+
|         CKB L1  +  BTC Lightning Network             |
|    xUDT Assets  |  RGB++  |  Cross-chain (Cch)       |
+-----------------------------------------------------+
```

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [`@agentpay-dev/core`](packages/core) | [![npm](https://img.shields.io/npm/v/@agentpay-dev/core)](https://www.npmjs.com/package/@agentpay-dev/core) | Protocol core: Fiber RPC, settlement, assets, DePIN metering |
| [`@agentpay-dev/sdk`](packages/sdk) | [![npm](https://img.shields.io/npm/v/@agentpay-dev/sdk)](https://www.npmjs.com/package/@agentpay-dev/sdk) | Developer SDK: AgentWallet, ServiceProvider, HubClient |
| [`@agentpay-dev/mcp-server`](packages/mcp-server) | [![npm](https://img.shields.io/npm/v/@agentpay-dev/mcp-server)](https://www.npmjs.com/package/@agentpay-dev/mcp-server) | MCP Server: 8 payment tools for Claude/GPT |
| [`@agentpay-dev/x402-facilitator`](packages/x402-facilitator) | [![npm](https://img.shields.io/npm/v/@agentpay-dev/x402-facilitator)](https://www.npmjs.com/package/@agentpay-dev/x402-facilitator) | HTTP 402 payment middleware with Fiber settlement |
| [`@agentpay-dev/ap2`](packages/ap2) | [![npm](https://img.shields.io/npm/v/@agentpay-dev/ap2)](https://www.npmjs.com/package/@agentpay-dev/ap2) | Google AP2 protocol bridge to Fiber |
| [`create-agentpay`](packages/create-agentpay) | [![npm](https://img.shields.io/npm/v/create-agentpay)](https://www.npmjs.com/package/create-agentpay) | CLI scaffolding tool |

## Key Features

### Hold Invoice - Trustless Escrow

The killer feature. Agent A locks payment, Agent B delivers, funds release only on confirmation:

```typescript
import { ServiceProvider } from '@agentpay-dev/sdk';

const provider = new ServiceProvider({
  fiberRpcUrl: process.env.FIBER_RPC_URL,
  services: {
    translate: {
      price: 100_000_000n,  // 1 CKB per request
      handler: async (params) => {
        const result = await doTranslation(params.text, params.target);
        return { translation: result };
      }
    }
  }
});

// Hold flow: Lock -> Deliver -> Release (atomic)
// If service fails, funds auto-refund via HTLC timeout
```

### MCP Server - AI-Native Payments

Registered on the [official MCP Registry](https://registry.modelcontextprotocol.io/) as `io.github.alefnt/agentpay`.

Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "agentpay": {
      "command": "npx",
      "args": ["@agentpay-dev/mcp-server"],
      "env": { "FIBER_RPC_URL": "http://localhost:8227" }
    }
  }
}
```

**8 MCP Tools:**

| Tool | Description |
|------|-------------|
| `get_balance` | Check wallet balance (CKB + xUDT) |
| `send_payment` | Send a payment via Fiber invoice |
| `create_invoice` | Generate a Fiber invoice to receive payment |
| `pay_for_service` | Pay-and-call another agent's API |
| `create_hold_invoice` | Create escrow payment (lock funds) |
| `settle_hold` | Release held funds after service delivery |
| `cancel_hold` | Cancel and refund held payment |
| `list_channels` | View active payment channels |

### x402 HTTP Compatibility

Any HTTP API becomes a paid API with one middleware:

```typescript
import { createX402Middleware } from '@agentpay-dev/x402-facilitator';

const paywall = createX402Middleware({ price: '100000000' });

http.createServer((req, res) => {
  paywall(req, res, () => {
    res.end(JSON.stringify({ data: 'premium content' }));
  });
});
// Client: HTTP 402 -> pay Fiber invoice -> retry -> get content
```

### BTC Cross-Chain

Pay with BTC, settle on CKB via Lightning-Fiber bridge:

```typescript
import { CchClient } from '@agentpay-dev/core';

const cch = new CchClient({ cchRpcUrl: process.env.CCH_RPC_URL });

await cch.sendBtcToCkb({
  btcPayReq: 'lnbc100n1p...',
  fiberChannelId: '0x...',
});
```

## Ecosystem Integration

AgentPay enhances existing payment solutions:

| Platform | How AgentPay Helps |
|----------|-------------------|
| **x402 (Coinbase)** | Zero-gas Fiber settlement backend for HTTP 402 protocol |
| **AP2 (Google)** | Settlement layer for agent authorization framework |
| **Stripe** | Complements with agent-to-agent micropayments (sub-cent) |
| **Lightning Network** | Cross-chain via Cch bridge, expanding BTC payment reach |

## Project Structure

```
AgentPay/
  packages/
    core/               # Protocol core (Fiber RPC, settlement, DePIN)
    sdk/                # Developer SDK (Wallet, Provider, Hub)
    mcp-server/         # MCP Server for AI agents
    x402-facilitator/   # HTTP 402 middleware
    ap2/                # Google AP2 bridge
    create-agentpay/    # CLI scaffolding
  services/
    hub/                # Hosted wallet service
    registry/           # Agent discovery service
  examples/
    translate-agent/    # Translation service example
    code-review-agent/  # Code review agent example
    btc-to-ckb/         # Cross-chain payment example
  docs/
    product.md          # Product overview
    architecture.md     # Technical architecture
```

## Documentation

- [Product Overview](docs/product.md) - What AgentPay solves and how
- [Architecture](docs/architecture.md) - Technical design and protocol layers
- [Competitive Analysis](docs/competitive-analysis.md) - Comparison with x402, AP2, Stripe

## Tech Stack

- **Runtime**: Node.js 20+ / TypeScript 5.5+
- **L2 Network**: [CKB Fiber Network](https://fiber.nervos.org/) (Lightning-compatible)
- **L1 Blockchain**: [Nervos CKB](https://nervos.org/)
- **Asset Standard**: xUDT (extensible User Defined Token)
- **Identity**: [.bit](https://did.id/) decentralized identity
- **Cross-chain**: Cch (CKB - BTC Lightning bridge)
- **AI Integration**: [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- **Build**: pnpm workspace monorepo

## Development

```bash
git clone https://github.com/alefnt/AgentPay.git
cd AgentPay
pnpm install
pnpm build
pnpm test
```

## Roadmap

- [x] Core protocol (Fiber RPC, settlement, assets)
- [x] SDK (AgentWallet, ServiceProvider, HubClient)
- [x] MCP Server with 8 payment tools
- [x] x402 HTTP 402 facilitator
- [x] AP2 protocol bridge
- [x] DePIN metering module
- [x] BTC cross-chain (Cch + LND)
- [x] RGB++ bridge integration
- [x] npm packages published
- [x] MCP Registry registration
- [ ] Fiber mainnet deployment
- [ ] Stablecoin (RUSD) support on CKB
- [ ] Public demo site
- [ ] Production Hub service

## License

MIT - see [LICENSE](LICENSE) for details.

---

**Built for the Agent Economy** - where AI agents autonomously discover, negotiate, and pay for services.
