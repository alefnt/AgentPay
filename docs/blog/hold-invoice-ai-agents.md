# Why AI Agents Need Hold Invoice: Solving the Trust Problem in Machine-to-Machine Payments

> How AgentPay uses cryptographic escrow to let AI agents pay each other without trusting each other.

## The Problem: Who Pays First?

Imagine two AI agents that have never met:

- **Agent A** (a coding assistant) needs translation
- **Agent B** (a translator) charges 1 CKB per request

They face a classic dilemma:

```
If Agent A pays first:
  Agent B could take the money and never translate.

If Agent B works first:
  Agent A could receive the translation and never pay.
```

Humans solve this with reputation, contracts, and courts. AI agents have none of that. They spin up, do work, and shut down. No contract. No memory. No recourse.

**Every existing agent payment system ignores this problem.** Coinbase's x402 lets agents pay — but it's pay-and-pray. Google's AP2 handles authorization — but not settlement disputes. Stripe works for human billing — not for a 0.001-cent API call between two ephemeral bots.

## The Solution: Hold Invoice

AgentPay solves this with **Hold Invoice** — a cryptographic escrow primitive borrowed from the Lightning Network and adapted for AI agents.

Here's how it works:

```
Step 1: LOCK
  Agent B creates a Hold Invoice with a secret (preimage).
  Agent A pays it — funds are LOCKED in the payment channel.
  Neither side can touch the money.

Step 2: DELIVER
  Agent B performs the translation.
  Agent B sends back the result.

Step 3: SETTLE or REFUND
  ✅ If the work is good → Agent B reveals the preimage → funds released
  ❌ If Agent B never delivers → HTLC timeout → funds auto-refund to A
```

**No trust required.** The money is locked by cryptography, not by a promise.

## How It Works Under the Hood

The magic is in a cryptographic primitive called **HTLC** (Hash Time-Locked Contract):

```
Hold Invoice = sha256(preimage) + timeout

- The preimage is a random 32-byte secret
- Only the service provider knows it
- The payment is locked to the HASH of the preimage
- Revealing the preimage = claiming the payment
- If the preimage is never revealed, the timeout expires and funds return
```

In AgentPay's TypeScript implementation:

```typescript
// Service Provider creates a Hold Invoice
const provider = new ServiceProvider({
  fiberRpcUrl: 'http://localhost:8227',
  services: {
    translate: {
      price: 100_000_000n,  // 1 CKB
      handler: async (params) => {
        return await doTranslation(params.text, params.target);
      }
    }
  }
});

// Under the hood, for each request:
// 1. Generate random preimage
const preimage = crypto.randomBytes(32);
// 2. Hash it
const hash = sha256(preimage);
// 3. Create invoice locked to this hash
const invoice = await fiber.addInvoice({
  amount: '100000000',
  payment_preimage: preimage,
  expiry: 3600  // 1 hour timeout
});
// 4. Client pays the invoice — funds LOCKED
// 5. Provider does the work
// 6. Provider reveals preimage — funds RELEASED
await fiber.settleInvoice({ payment_preimage: preimage });
```

## What Makes This Different

### vs. x402 (Coinbase)

x402 works like this: Client sends money, then requests the resource. If the server is down, the money is gone.

```
x402 flow:
  Client pays → Server receives → Server maybe responds
  (No recourse if server fails)

AgentPay flow:
  Client locks → Server works → Server settles OR timeout refunds
  (Cryptographic guarantee)
```

### vs. Traditional Escrow (Stripe, PayPal)

Traditional escrow requires a trusted third party:

```
Traditional:
  Buyer → Escrow Service → Seller
  (Escrow service can be hacked, go offline, or freeze funds)

AgentPay:
  Buyer → Payment Channel (math) → Seller
  (No third party. Pure cryptography.)
```

### vs. Smart Contracts (Ethereum)

Ethereum can do escrow, but:

```
Ethereum:
  Gas fee: $0.50 - $50 per transaction
  Settlement: 12 seconds - 15 minutes
  Throughput: ~15 TPS

AgentPay (Fiber):
  Gas fee: $0 (payment channels)
  Settlement: ~20 milliseconds
  Throughput: thousands of TPS per channel
```

## Real-World Use Cases

### 1. Agent-to-Agent API Marketplace

```typescript
// A coding agent that pays for multiple services
const wallet = new AgentWallet({ fiberRpcUrl });

// Pay a code review agent
const review = await wallet.payAndCall(
  'https://review-agent.example.com',
  'review',
  { code: myCode, language: 'typescript' }
);

// Pay a testing agent
const tests = await wallet.payAndCall(
  'https://test-agent.example.com',
  'generate_tests',
  { code: myCode, framework: 'vitest' }
);

// Each call: Lock → Work → Settle (atomic, trustless)
```

### 2. DePIN Micropayments

IoT sensors selling data streams, billed per reading:

```typescript
// A weather station sells data via Hold Invoice
// Consumer pays per reading, locked until data is verified
const data = await wallet.payAndCall(
  'https://weather-station-42.device.network',
  'temperature',
  { location: 'tokyo', readings: 100 }
);
// 100 readings × 0.001 CKB each = 0.1 CKB total
// Each reading: micro Hold Invoice → verify → settle
```

### 3. HTTP 402 with Escrow

Any REST API becomes a paid API with cryptographic guarantees:

```typescript
import { createX402Middleware } from '@agentpay-dev/x402-facilitator';

// Server side: one line to add payment
const paywall = createX402Middleware({ price: '100000000' });

app.get('/api/premium', paywall, (req, res) => {
  res.json({ data: 'premium content' });
});

// Client side: automatic Hold Invoice payment
// GET /api/premium → HTTP 402 + Fiber Invoice
// Client pays Hold Invoice → retries → gets content
// If server down after payment → auto-refund
```

## The Bigger Picture

The AI agent economy is growing exponentially. Agents are being built to:
- Search the web and summarize
- Write and review code
- Manage infrastructure
- Trade financial instruments
- Coordinate with other agents

Every one of these interactions will involve payments — often micropayments too small for credit cards, too fast for blockchain confirmations, and between parties that have never met and will never meet again.

**Hold Invoice is the missing infrastructure.** It's not a new concept — it's battle-tested in Lightning Network since 2018. AgentPay adapts it for the agent economy by:

1. **Wrapping it in an SDK** — `npm install @agentpay-dev/sdk`
2. **Adding MCP support** — Claude and GPT can use it natively
3. **Making it settlement-agnostic** — Works on Fiber, CKB L1, or Hub
4. **Zero infrastructure option** — Hub mode means no nodes to run

## Try It

```bash
npm install @agentpay-dev/sdk @agentpay-dev/core
```

Or scaffold a complete agent:

```bash
npx create-agentpay my-agent
```

- **npm**: [@agentpay-dev/sdk](https://www.npmjs.com/package/@agentpay-dev/sdk)
- **MCP Registry**: [io.github.alefnt/agentpay](https://registry.modelcontextprotocol.io/)
- **GitHub**: [alefnt/AgentPay](https://github.com/alefnt/AgentPay)

---

*AgentPay is open source under MIT license. Built on CKB Fiber Network.*
