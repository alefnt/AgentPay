# AgentPay — BTC-Native AI Agent Payment Protocol

> **Give every AI Agent a wallet. Let Agents pay each other for services — trustlessly.**
>
> Powered by CKB [Fiber Network](https://github.com/nervosnetwork/fiber) + [RGB++](https://github.com/RGBPlusPlus/rgbpp-sdk) | x402 + [AP2](https://github.com/google-agentic-commerce/AP2) Compatible

---

## The Problem

AI Agents need to call other Agents' services (translation, inference, search, code review), but today:
- ❌ No standard Agent-to-Agent payment protocol
- ❌ Traditional payments (Stripe) can't handle high-frequency micropayments
- ❌ ETH gas fees are too high for micropayment scenarios

## The Solution

AgentPay is the **first BTC-native payment protocol** designed for AI Agents:
- ✅ Instant micropayments via CKB Fiber Network (millisecond settlement, < $0.001 fees)
- ✅ **Hold Invoice** = trustless escrow (lock funds → complete task → unlock)
- ✅ Multi-asset: CKB / BTC / USDT / USDC / custom xUDT
- ✅ **RGB++ Bridge** — BTC ↔ CKB asset bridging
- ✅ BTC Lightning interop via Cch module
- ✅ x402 compatible (ETH Agents can participate)
- ✅ MCP Server for Claude/GPT

## Architecture

> **Core = Fiber + Stablecoins. Extensions = Ecosystem On-ramps.**

```
                    AI Agents (Claude, GPT, Grok, Custom)
                              │
                   ┌──────────┼──────────┐
                   MCP        SDK      Skills
                   └──────────┼──────────┘
                              │
                     AgentPay Protocol
              (Hold Invoice + Stablecoin Settlement)
                              │
              ╔═══════════════╧═══════════════╗
              ║     CKB Fiber Network (L2)    ║  ← CORE
              ║                               ║  99% of payments
              ║  USDI / USDT / USDC (xUDT)   ║  happen here
              ║  Zero fee · Millisecond · P2P ║
              ╚═══════════════╤═══════════════╝
                              │
           ┌──────┬───────────┼───────────┬──────┐
           │      │           │           │      │
         x402    Cch        RGB++       AP2    Fiat
         ETH     BTC         BTC       Google  Future
         agents  on/off     assets     agents  compliant
                 ramp       bridge              on-ramp
```

> See [docs/architecture.md](docs/architecture.md) for the full layered architecture.

## Quick Start

> **⚡ No Fiber node installation required!** AgentPay provides 3 deployment modes, all with built-in Fiber support.

### Option 1: Docker (Recommended)

Fiber node is bundled in Docker — no separate installation needed:

```bash
npx create-agentpay my-agent --provider
cd my-agent
docker compose up -d    # Fiber node + Agent start automatically
```

### Option 2: Hub Managed Mode (Zero Infrastructure)

Connect via AgentPay Hub — **no nodes to run at all**:

```typescript
import { HubClient } from '@agentpay/sdk';

// Hub manages the Fiber node for you
const hub = new HubClient({
  hubUrl: 'https://hub.agentpay.dev',
  apiKey: process.env.AGENTPAY_API_KEY,
});

// Pay and call — same experience as running your own node
const result = await hub.payAndCall(
  'https://translator-agent.example.com',
  'translate',
  { text: 'Hello World', target: 'zh' },
);
```

### Option 3: SDK Direct Integration

**Caller Agent** (pay for services):
```typescript
import { AgentWallet } from '@agentpay/sdk';

const wallet = new AgentWallet({
  fiberRpcUrl: 'http://127.0.0.1:8227',  // Docker provides this
});

const result = await wallet.payAndCall(
  'http://translator-agent:3001',
  'translate',
  { text: 'Hello World', target: 'zh' },
  { maxBudget: '100000000', asset: 'CKB' }  // 1 CKB
);
console.log(result.output); // { translated: '你好世界' }
```

**Provider Agent** (sell services):
```typescript
import { ServiceProvider } from '@agentpay/sdk';

const provider = new ServiceProvider({
  fiberRpcUrl: 'http://127.0.0.1:8227',
  services: [{
    name: 'translate',
    pricing: { model: 'per-call', amount: '100000000', asset: 'CKB' },
    input_schema: { text: 'string', target: 'string' },
    output_schema: { translated: 'string' },
    description: 'AI-powered translation',
  }],
});

provider.onTask('translate', async (input) => {
  const { text, target } = input as any;
  return { translated: await myTranslateAPI(text, target) };
});

provider.listen(3001);
```

### Option 4: MCP Tools (Claude/GPT)

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "agentpay": {
      "command": "npx",
      "args": ["agentpay-mcp"],
      "env": { "FIBER_RPC_URL": "http://127.0.0.1:8227" }
    }
  }
}
```

Then tell Claude: *"Use AgentPay to pay 1 CKB for translation service"*

### RGB++ Asset Bridge

Bridge BTC assets to CKB via RGB++ protocol for Fiber channel payments:

```typescript
import { RgbppBridge } from '@agentpay/core';

const bridge = new RgbppBridge({
  network: 'testnet',
  serviceToken: process.env.RGBPP_SERVICE_TOKEN,
});

// Query RGB++ assets on a BTC address
const assets = await bridge.getAssets('tb1q...');

// Leap: BTC → CKB (bridge assets for Fiber payments)
const leap = await bridge.leapToCkb({
  btcUtxoTxId: '0x...', btcUtxoVout: 0,
  xudtTypeArgs: '0x...', amount: '100000000',
  toCkbAddress: 'ckt1q...', btcPrivateKey: 'key',
});

// Track Leap status
const status = await bridge.getLeapStatus(leap.btcTxId);
```

### BTC Lightning ↔ CKB Fiber (Cross-Chain Hub)

We are building the bridge between **BTC Lightning Network** and **CKB Fiber Network** using the Cch (Cross-Chain Hub) module:

```
BTC Lightning Network              CKB Fiber Network
┌──────────────┐                   ┌──────────────┐
│  BTC Agent   │                   │  CKB Agent   │
│  (LND node)  │                   │  (Fiber node)│
└──────┬───────┘                   └──────┬───────┘
       │ Lightning HTLC                    │ Fiber PTLC
       │                                   │
       └───────────┐       ┌───────────────┘
                   ▼       ▼
              ┌──────────────┐
              │  Cch Module  │
              │ Atomic Swap  │
              │ Same Hash H  │
              └──────────────┘
              Both succeed or
              both fail (atomic)
```

**How it works**: Lightning uses HTLC (Hash Time-Locked Contracts), Fiber uses PTLC (Point Time-Locked Contracts — more private). The Cch module bridges between them using a shared hash — either both payments complete, or both refund. No trust needed.

**Verification Status**:

| Component | Status | Evidence |
|---|---|---|
| Fiber Cch source code | ✅ Verified | `cch/config.rs`, `cch/actor.rs` in Fiber repo |
| Cch RPC methods | ✅ Working | `send_btc` / `receive_btc` / `get_cch_order` respond |
| Cch → LND gRPC | ✅ Connected | Log: `cch started successfully` |
| Invoice parsing | ✅ Working | Returns validation error for test invoice (correct) |
| Real cross-chain payment | 🔄 In progress | LND syncing signet via Neutrino |
| Wrapped BTC xUDT | ⬜ Not yet | Needs CKB-side BTC representation |

**Docker Quick Start** (full stack):
```bash
docker compose up lnd fiber-node-1 -d
# LND (Neutrino signet) + Fiber (Cch connected to LND)
```

### Google AP2 Compatibility

AgentPay is compatible with [Google's Agent Payments Protocol (AP2)](https://github.com/google-agentic-commerce/AP2):

```typescript
import { AP2Adapter } from '@agentpay/ap2';

const adapter = new AP2Adapter({
  agentDid: 'did:bit:my-agent.bit',  // .bit DID identity
  signingKeyHex: '...',
});

// Create AP2 Intent Mandate (W3C Verifiable Credential)
const mandate = await adapter.createIntentMandate({
  intent: 'translate text to Chinese',
  maxAmount: '1000000000',
  currency: 'CKB',
});

// Process incoming AP2 mandate → Fiber Hold Invoice
const request = adapter.processIntentMandate(incomingMandate);
```

**AP2 Mandate ↔ Fiber Hold Invoice mapping**:
- `IntentMandate` → Service Request
- `PaymentMandate` → Hold Invoice (HTLC lock)
- `Receipt` → Settled Invoice (preimage proof)

### .bit Identity (CKB DID)

Each Agent gets a decentralized identity via [.bit protocol](https://d.id):

```typescript
import { BitIdentity } from '@agentpay/core';

const identity = new BitIdentity();

// Resolve .bit name → CKB address
const account = await identity.resolve('translator.bit');
console.log(account?.did);  // "did:bit:translator.bit"

// Auto-register .bit for your Agent
const order = await identity.register('my-agent.bit', ckbAddress);
```

### Agent Skills

AgentPay can be used as an **Agent Skill** by any AI framework:

```
.agent/skills/agentpay/SKILL.md
```

Any Agent that reads this skill file learns how to pay for services, sell services, and discover other Agents — no manual integration needed.

## Project Structure

```
packages/
├── core/                 # @agentpay/core — Fiber RPC + RGB++ + .bit Identity
│   ├── src/
│   │   ├── fiber-rpc.ts     # Full Fiber RPC (Channel/Invoice/Payment/Cch)
│   │   ├── rgbpp-bridge.ts  # RGB++ Asset Bridge (Leap BTC↔CKB)
│   │   ├── bit-identity.ts  # .bit DID (resolve/register/DID helpers)
│   │   ├── types.ts         # Protocol types (matches Fiber spec)
│   │   ├── assets.ts        # Asset registry (CKB/BTC/USDT/USDC/USDI/WBTC)
│   │   ├── identity.ts      # Agent identity (= Fiber node pubkey)
│   │   └── logger.ts        # Zero-dep structured logger
│   └── tests/               # 66+ unit tests
│
├── sdk/                  # @agentpay/sdk — Developer SDK
│   └── src/
│       ├── wallet.ts        # AgentWallet — pay for services + RGB++ Bridge
│       ├── provider.ts      # ServiceProvider — sell services (HTTP)
│       └── hub-client.ts    # HubClient — managed mode (no Fiber node)
│
├── ap2/                  # @agentpay/ap2 — Google AP2 Compatibility
│   └── src/
│       ├── types.ts         # W3C VC Mandate types (IntentMandate/PaymentMandate/Receipt)
│       ├── adapter.ts       # AP2 Mandate ↔ Fiber Hold Invoice adapter
│       └── verify.ts        # Ed25519 VC signature verify/sign
│
├── mcp-server/           # @agentpay/mcp-server — Claude/GPT MCP Tools
├── x402-facilitator/     # @agentpay/x402-facilitator — x402 Compatibility
└── create-agentpay/      # create-agentpay — One-command project generator

services/
├── hub/                  # AgentPay Hub — Managed Fiber access
└── registry/             # Agent service discovery

deploy/
├── Dockerfile.fiber       # Fiber v0.7.1 node (official binary)
├── lnd.conf               # LND config (Neutrino signet)
├── fiber-testnet-config.yml  # Fiber config + Cch cross-chain
docker-compose.yml         # Full stack: LND + Fiber + Cch
```

## Supported Assets

| Asset | Type | Status | Notes |
|---|---|---|---|
| CKB | Native | ✅ Ready | 1 CKB = 10^8 shannons |
| BTC | Lightning/Cch | ✅ Ready | Cross-chain via Cch module |
| USDI | xUDT | 🟡 CKB Native | CKB native stablecoin |
| USDT | xUDT/RGB++ | 🟡 Pending | Available after Tether RGB++ deployment |
| USDC | xUDT | 🔴 Future | No Circle CKB plans yet |
| WBTC | xUDT/RGB++ | 🟡 Pending | Via RGB++ Leap |
| Custom | xUDT | ✅ Ready | Any xUDT token |

## Security Model

```
Hold Invoice = Lock funds → Provider executes → Unlock with preimage

1. Provider generates preimage + hash
2. Provider creates Hold Invoice (has hash, NOT preimage)
3. Caller pays Invoice → funds LOCKED on Fiber TLC
4. Provider executes the task
5. Provider reveals preimage → settle_invoice → funds RELEASED to Provider
6. If Provider doesn't execute → Invoice expires → funds RETURN to Caller

Result: Zero risk for both parties
```

## Development

```bash
pnpm install      # Install dependencies
pnpm -r build     # Build all packages
pnpm -r test      # Run 161 tests
```

## Prerequisites

- Node.js >= 20
- pnpm >= 9

> **No Fiber node installation needed.** Docker deployment bundles Fiber, Hub mode is fully managed.

## Roadmap

- [x] **Phase 1**: Core SDK + Hold Invoice payments
- [x] **Phase 2**: MCP Server + x402 Facilitator + Agent Skills
- [x] **Phase 3**: RGB++ Bridge + Cch cross-chain verification
- [x] **Phase 3.5**: AP2 compatibility + .bit DID identity
- [ ] **Phase 4**: End-to-end BTC Lightning ↔ Fiber payment
- [ ] **Phase 5**: Mainnet deployment + CKB Grant

## Test Coverage

| Package | Tests |
|---|---|
| @agentpay/core | 66+ (incl. RGB++ 13, .bit 4) |
| @agentpay/sdk | 17 |
| @agentpay/ap2 | 7 |
| Hub Server | 23 |
| Registry Server | 27 |
| x402 Facilitator | 10 |
| MCP Server | 11 |
| create-agentpay CLI | 7 |
| **Total** | **172+** |

## License

MIT
