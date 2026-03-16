# Why AI Agents Need Hold Invoice / 为什么 AI Agent 需要 Hold Invoice

> Solving the Trust Problem in Machine-to-Machine Payments
> 解决机器间支付的信任难题

---

## The Problem: Who Pays First? / 问题：谁先付钱？

Imagine two AI agents that have never met:

想象两个素不相识的 AI Agent：

- **Agent A** (a coding assistant) needs translation / （编程助手）需要翻译服务
- **Agent B** (a translator) charges 1 CKB per request / （翻译 Agent）每次收费 1 CKB

They face a classic dilemma / 它们面临一个经典困境：

```
If Agent A pays first:          如果 Agent A 先付钱：
  Agent B could take the           Agent B 可能收了钱不干活。
  money and never translate.

If Agent B works first:         如果 Agent B 先干活：
  Agent A could receive the        Agent A 可能拿了结果不付钱。
  translation and never pay.
```

Humans solve this with reputation, contracts, and courts. AI agents have none of that. They spin up, do work, and shut down. No contract. No memory. No recourse.

人类靠信誉、合同和法院解决。AI Agent 一样都没有——被创建、执行、关闭。没有合同，没有记忆，没有追索权。

**Every existing agent payment system ignores this problem.** Coinbase's x402: pay-and-pray. Google's AP2: authorization only. Stripe: human billing, not 0.001-cent bot calls.

**现有方案都忽视了这个问题。** Coinbase x402：付了只能祈祷。Google AP2：只管授权。Stripe：人类订阅，处理不了 Bot 间微支付。

---

## The Solution: Hold Invoice / 解决方案：Hold Invoice

AgentPay solves this with **Hold Invoice** — a cryptographic escrow primitive from Lightning Network, adapted for AI agents.

AgentPay 用 **Hold Invoice** 解决——从闪电网络借鉴的加密托管原语，为 AI Agent 适配。

```
Step 1: LOCK                    第一步：锁定
  Agent B creates a Hold           Agent B 创建 Hold Invoice（含秘密值）
  Invoice with a secret.           Agent A 支付——资金被锁定在通道中
  Agent A pays — funds LOCKED.     双方都无法动用这笔钱
  Neither side can touch it.

Step 2: DELIVER                 第二步：交付
  Agent B does the work.           Agent B 执行翻译任务
  Agent B sends back result.       Agent B 返回翻译结果

Step 3: SETTLE or REFUND        第三步：结算或退款
  Good  → reveal preimage          完成 → 揭示 preimage → 资金释放给 B
       → funds released
  Fail  → HTLC timeout            失败 → HTLC 超时 → 资金自动退还给 A
       → auto-refund
```

**No trust required. Money is locked by cryptography, not by a promise.**

**无需信任。钱被密码学锁住，不是靠承诺。**

---

## How It Works / 底层原理

The magic is **HTLC** (Hash Time-Locked Contract):

核心是 **HTLC**（哈希时间锁定合约）：

```
Hold Invoice = sha256(preimage) + timeout

- preimage: random 32-byte secret (only provider knows)
             随机 32 字节秘密值（只有服务方知道）
- Payment locked to the HASH of the preimage
  支付锁定在 preimage 的哈希值上
- Reveal preimage = claim payment
  揭示 preimage = 领取付款
- Never revealed? Timeout → auto refund
  始终未揭示？超时 → 自动退款
```

TypeScript implementation / TypeScript 实现：

```typescript
// Service Provider creates a Hold Invoice
// 服务提供方创建 Hold Invoice
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

// Under the hood (each request) / 底层流程（每次请求）：
const preimage = crypto.randomBytes(32);       // 1. Generate secret / 生成秘密值
const hash = sha256(preimage);                 // 2. Hash it / 计算哈希
const invoice = await fiber.addInvoice({       // 3. Create locked invoice / 创建锁定发票
  amount: '100000000',
  payment_preimage: preimage,
  expiry: 3600
});
// 4. Client pays → funds LOCKED / 客户端支付 → 资金锁定
// 5. Provider works / 服务方执行工作
await fiber.settleInvoice({                    // 6. Reveal → funds RELEASED / 揭示 → 资金释放
  payment_preimage: preimage
});
```

---

## Comparison / 对比

### vs. x402 (Coinbase)

```
x402:       Pay → Maybe receive service    付款 → 可能收到服务
AgentPay:   Lock → Work → Settle/Refund    锁定 → 干活 → 结算/退款
            (cryptographic guarantee)       （密码学保证）
```

### vs. Traditional Escrow (Stripe, PayPal) / 传统托管

```
Traditional:  Buyer → Escrow Service → Seller
              买家 → 托管服务（可被黑/宕机/冻结） → 卖家

AgentPay:     Buyer → Payment Channel (math) → Seller
              买家 → 支付通道（纯数学） → 卖家
```

### vs. Smart Contracts (Ethereum) / 智能合约

| | Ethereum | AgentPay (Fiber) |
|---|---|---|
| Gas fee / Gas 费 | $0.50 - $50 | $0 |
| Settlement / 结算 | 12s - 15min | ~20ms |
| Throughput / 吞吐量 | ~15 TPS | Thousands / 数千 TPS |

---

## Use Cases / 使用场景

### 1. Agent API Marketplace / Agent 间 API 市场

```typescript
const wallet = new AgentWallet({ fiberRpcUrl });

// Pay for code review / 付费调用代码审查
const review = await wallet.payAndCall(
  'https://review-agent.example.com',
  'review', { code: myCode, language: 'typescript' }
);

// Pay for test generation / 付费调用测试生成
const tests = await wallet.payAndCall(
  'https://test-agent.example.com',
  'generate_tests', { code: myCode, framework: 'vitest' }
);
// Each call: Lock → Work → Settle (atomic, trustless)
// 每次调用：锁定 → 干活 → 结算（原子化，无需信任）
```

### 2. DePIN Micropayments / DePIN 微支付

```typescript
// Weather station sells data via Hold Invoice
// 气象站通过 Hold Invoice 卖数据，按条计费
const data = await wallet.payAndCall(
  'https://weather-station-42.device.network',
  'temperature', { location: 'tokyo', readings: 100 }
);
// 100 readings x 0.001 CKB = 0.1 CKB total
// 每条：微型 Hold Invoice → 验证 → 结算
```

### 3. HTTP 402 with Escrow / HTTP 402 + 托管保护

```typescript
import { createX402Middleware } from '@agentpay-dev/x402-facilitator';

// One line → paid API with crypto guarantee
// 一行代码 → 付费 API + 密码学保障
const paywall = createX402Middleware({ price: '100000000' });

app.get('/api/premium', paywall, (req, res) => {
  res.json({ data: 'premium content' });
});
// Client: HTTP 402 → pay Hold Invoice → retry → get content
// If server down after payment → auto-refund
// 服务器付款后宕机？自动退款
```

---

## The Bigger Picture / 更大的图景

The AI agent economy is growing exponentially. Every agent interaction will involve payments — micropayments too small for credit cards, too fast for blockchain confirmations, between parties that have never met.

AI Agent 经济正在爆发。每次 Agent 交互都会涉及支付——信用卡处理不了的微支付，区块链确认等不及的快速支付，素未谋面的双方之间的交易。

**Hold Invoice is the missing infrastructure.** Battle-tested in Lightning Network since 2018. AgentPay adapts it:

**Hold Invoice 就是缺失的基础设施。** 在闪电网络上从 2018 年起经过实战检验。AgentPay 将其适配：

1. **SDK** — `npm install @agentpay-dev/sdk`
2. **MCP** — Claude / GPT native payment / 原生支付
3. **Settlement-agnostic** — Fiber, CKB L1, or Hub / 三种结算模式
4. **Zero infrastructure** — Hub mode, no nodes / Hub 模式无需节点

## Get Started / 立即试用

```bash
npm install @agentpay-dev/sdk @agentpay-dev/core
npx create-agentpay my-agent
```

- **npm**: [@agentpay-dev/sdk](https://www.npmjs.com/package/@agentpay-dev/sdk)
- **MCP Registry**: [io.github.alefnt/agentpay](https://registry.modelcontextprotocol.io/)
- **GitHub**: [alefnt/AgentPay](https://github.com/alefnt/AgentPay)

---

*AgentPay is open source (MIT). Built on CKB Fiber Network.*

*AgentPay 基于 MIT 协议开源，构建在 CKB Fiber Network 上。*
