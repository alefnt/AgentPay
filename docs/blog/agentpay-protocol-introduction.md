# AgentPay: BTC-Native Payment Protocol for AI Agents
# AgentPay：面向 AI Agent 的 BTC 原生支付协议

> Built on CKB Fiber Network | Open Source | MIT License
> 构建在 CKB Fiber Network 之上 | 开源 | MIT 协议

**GitHub**: [github.com/alefnt/AgentPay](https://github.com/alefnt/AgentPay)
**npm**: `npm install @agentpay-dev/sdk`
**MCP Registry**: `io.github.alefnt/agentpay`

---

## 1. What is AgentPay? / AgentPay 是什么？

AgentPay is a payment protocol that gives every AI Agent a wallet. It lets agents autonomously discover, negotiate, and pay each other for services — with zero gas fees, millisecond settlement, and cryptographic escrow guarantees.

AgentPay 是一个支付协议，为每个 AI Agent 提供钱包。它让 Agent 能够自主发现、协商并互相付费——零 Gas 费、毫秒级结算、密码学托管保证。

**Why does this matter?**

The AI agent economy is emerging. Agents are being built to write code, translate text, analyze data, manage infrastructure, and coordinate with other agents. Every one of these interactions needs payments — but existing solutions don't work:

**为什么这很重要？**

AI Agent 经济正在兴起。Agent 被构建来编写代码、翻译文本、分析数据、管理基础设施，并与其他 Agent 协作。这些交互中的每一个都需要支付——但现有方案都不行：

| Problem / 问题 | Traditional / 传统方案 | AgentPay |
|---|---|---|
| Agents can't open bank accounts / Agent 无法开银行账户 | Requires human KYC / 需要人类 KYC | Keypair = account / 密钥对 = 账户 |
| Micropayments are expensive / 微支付太贵 | Stripe min $0.50 + 2.9% / Stripe 最低 $0.50 + 2.9% | $0.001, zero fee / 零手续费 |
| Settlement is slow / 结算太慢 | 3-7 days / 3-7 天 | ~20 milliseconds / 约 20 毫秒 |
| No trust between agents / Agent 之间没有信任 | Human arbitration / 人工仲裁 | Hold Invoice (automatic) / 自动托管 |
| Cross-border friction / 跨境摩擦 | Region-locked / 地区限制 | Borderless / 无国界 |

---

## 2. Why CKB Fiber Network? / 为什么选择 CKB Fiber Network？

AgentPay chose Fiber Network as its settlement layer for specific technical reasons:

AgentPay 选择 Fiber Network 作为结算层，有明确的技术原因：

**1. Native multi-asset channels / 原生多资产通道**

Fiber channels natively carry CKB + any xUDT token in a single channel. This means an agent can pay with USDI (stablecoin), CKB, or any custom token without opening separate channels.

Fiber 通道原生支持在单通道中承载 CKB + 任意 xUDT 代币。Agent 可以用 USDI（稳定币）、CKB 或任何自定义代币支付，无需开设多个通道。

**2. PTLC (not just HTLC) / PTLC（不仅是 HTLC）**

Fiber uses Point Time-Locked Contracts, which provide better privacy than Lightning's HTLC by preventing correlation attacks across payment hops.

Fiber 使用 PTLC（点时间锁定合约），比闪电网络的 HTLC 提供更好的隐私性，防止跨跳关联攻击。

**3. Lightning interoperability via Cch / 通过 Cch 实现闪电网络互操作**

The Cross-chain (Cch) module bridges Fiber and BTC Lightning Network. An agent on Fiber can pay a Lightning invoice, and vice versa. This connects AgentPay to the existing Lightning ecosystem.

跨链（Cch）模块桥接 Fiber 和 BTC 闪电网络。Fiber 上的 Agent 可以支付闪电网络发票，反之亦然。这将 AgentPay 接入现有的闪电网络生态。

**4. RGB++ cross-chain assets / RGB++ 跨链资产**

Via RGB++ protocol, BTC-native assets can be mapped to CKB and used in Fiber channels, enabling true BTC-native agent payments.

通过 RGB++ 协议，BTC 原生资产可以映射到 CKB 并在 Fiber 通道中使用，实现真正的 BTC 原生 Agent 支付。

---

## 3. Architecture / 架构

```
+-----------------------------------------------------+
|                   Applications                       |
|   AI Agents  |  DePIN Devices  |  API Marketplaces   |
+-----------------------------------------------------+
|                   AgentPay SDK                       |
|   AgentWallet  |  ServiceProvider  |  HubClient      |
+-----------------------------------------------------+
|                   AgentPay Core                      |
|   Settlement  |  Metering  |  DID (.bit)  |  Assets  |
+-----------------------------------------------------+
|  EXTENSION: x402  |  EXTENSION: AP2  |  EXTENSION: Cch |
|  (HTTP 402)        |  (Google)         |  (BTC Lightning)|
+-----------------------------------------------------+
|              CKB Fiber Network (L2)                  |
|   Payment Channels  |  Hold Invoice  |  PTLC Routing |
+-----------------------------------------------------+
|         CKB L1  +  BTC Lightning Network             |
|     xUDT Assets  |  RGB++  |  Cross-chain Bridge     |
+-----------------------------------------------------+
```

### Core Layer / 核心层

The core layer is settlement-agnostic. It defines interfaces that work identically across three backends:

核心层与结算层无关。它定义了在三种后端上行为完全一致的接口：

| Backend / 后端 | Speed / 速度 | Cost / 成本 | Use Case / 适用场景 |
|---|---|---|---|
| **Fiber Network** (primary) | ~20ms | Free / 免费 | Production agent payments / 生产环境 |
| **CKB L1** (fallback) | ~30s | ~0.001 CKB | When Fiber unavailable / Fiber 不可用时 |
| **Hub** (managed) | ~100ms | Free / 免费 | Quick start, no node needed / 快速开始 |

### Extension Layer / 扩展层

Each extension lets a different community adopt AgentPay:

每个扩展让不同社区能够接入 AgentPay：

- **x402 Facilitator** — ETH/Coinbase ecosystem agents use HTTP 402 protocol, AgentPay handles Fiber settlement behind the scenes

  x402 中间件——ETH/Coinbase 生态的 Agent 使用 HTTP 402 协议，AgentPay 在幕后用 Fiber 结算

- **AP2 Bridge** — Google's Agent-to-Agent Payment protocol, with AgentPay providing the settlement layer

  AP2 桥——Google 的 Agent 间支付协议，AgentPay 提供结算层

- **Cch (Cross-chain)** — BTC Lightning users pay CKB Fiber agents and vice versa

  Cch（跨链）——BTC 闪电网络用户向 Fiber Agent 付款，反之亦然

---

## 4. Key Innovation: Hold Invoice / 核心创新：Hold Invoice

The most important feature of AgentPay. It solves the fundamental trust problem in agent-to-agent payments.

AgentPay 最重要的功能。它解决了 Agent 间支付的根本信任问题。

**The problem / 问题：**

Two agents that have never met need to transact. Who pays first? If A pays first, B might not deliver. If B works first, A might not pay.

两个素不相识的 Agent 需要交易。谁先付钱？A 先付，B 可能不交付。B 先干活，A 可能不付钱。

**The solution / 解决方案：**

```
1. LOCK / 锁定
   Provider creates Hold Invoice (contains secret preimage)
   服务方创建 Hold Invoice（包含秘密 preimage）
   Caller pays it — funds LOCKED in payment channel
   调用方支付——资金锁定在支付通道中

2. DELIVER / 交付
   Provider performs the service
   服务方执行服务

3. SETTLE or REFUND / 结算或退款
   Success → Provider reveals preimage → funds released
   成功 → 服务方揭示 preimage → 资金释放
   Failure → HTLC timeout → automatic refund
   失败 → HTLC 超时 → 自动退款
```

**Code example / 代码示例：**

```typescript
// Caller side — 3 lines to pay any agent
// 调用方——3 行代码付费调用任意 Agent
import { AgentWallet } from '@agentpay-dev/sdk';

const wallet = new AgentWallet({
  fiberRpcUrl: 'http://localhost:8227'
});

const result = await wallet.payAndCall(
  'https://translator-agent.example.com',
  'translate',
  { text: 'Hello World', target: 'zh' }
);
// Internally: Lock → Translate → Settle (atomic)
// 内部流程：锁定 → 翻译 → 结算（原子化）
```

```typescript
// Provider side — define services and pricing
// 服务方——定义服务和定价
import { ServiceProvider } from '@agentpay-dev/sdk';

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
```

---

## 5. MCP Integration / MCP 集成

AgentPay is registered on the [official MCP Registry](https://registry.modelcontextprotocol.io/) as `io.github.alefnt/agentpay`. This means Claude, GPT, and other MCP-compatible AI assistants can use AgentPay tools natively.

AgentPay 已注册在[官方 MCP 注册表](https://registry.modelcontextprotocol.io/)上，名称为 `io.github.alefnt/agentpay`。这意味着 Claude、GPT 和其他兼容 MCP 的 AI 助手可以原生使用 AgentPay 工具。

**8 MCP Tools / 8 个 MCP 工具：**

| Tool / 工具 | Description / 描述 |
|---|---|
| `get_balance` | Check wallet balance / 查询钱包余额 |
| `send_payment` | Send payment via invoice / 通过发票发送付款 |
| `create_invoice` | Generate invoice to receive / 生成收款发票 |
| `pay_for_service` | Pay-and-call agent API / 付费调用 Agent API |
| `create_hold_invoice` | Create escrow payment / 创建托管付款 |
| `settle_hold` | Release escrowed funds / 释放托管资金 |
| `cancel_hold` | Cancel and refund / 取消并退款 |
| `list_channels` | View payment channels / 查看支付通道 |

**Claude Desktop configuration / Claude Desktop 配置：**

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

---

## 6. Ecosystem Positioning / 生态定位

AgentPay enhances — not replaces — existing payment infrastructure:

AgentPay 增强而非取代现有支付基础设施：

```
                      AgentPay Ecosystem
                      AgentPay 生态系统

   x402 (Coinbase)          AP2 (Google)         Stripe/Fiat
   HTTP 402 protocol        Agent authorization   Credit cards
   HTTP 402 协议             Agent 授权框架         信用卡
        |                        |                    |
        v                        v                    v
   +----------------------------------------------------------+
   |                     AgentPay Core                         |
   |              Settlement + Metering + DID                  |
   +----------------------------------------------------------+
        |                        |                    |
        v                        v                    v
   CKB Fiber               CKB L1                 Hub
   (Primary)               (Fallback)             (Managed)
        |
        v
   BTC Lightning (via Cch cross-chain bridge)
```

| Platform / 平台 | What AgentPay adds / AgentPay 提供的价值 |
|---|---|
| **x402 (Coinbase)** | Zero-gas Fiber settlement for HTTP 402 / 零 Gas Fiber 结算 |
| **AP2 (Google)** | Settlement layer for agent authorization / Agent 授权的结算层 |
| **Lightning Network** | Cross-chain via Cch / 通过 Cch 跨链 |
| **RGB++** | BTC-native asset bridging / BTC 原生资产桥接 |
| **.bit** | Decentralized identity for agents / Agent 去中心化身份 |

---

## 7. Published Packages / 已发布的包

All packages are live on npm:

所有包已在 npm 上线：

```bash
# Install SDK / 安装 SDK
npm install @agentpay-dev/sdk @agentpay-dev/core

# Scaffold a project / 脚手架创建项目
npx create-agentpay my-agent
```

| Package / 包名 | Version / 版本 | Purpose / 用途 |
|---|---|---|
| `@agentpay-dev/core` | 0.1.0 | Protocol core / 协议核心 |
| `@agentpay-dev/sdk` | 0.1.0 | Developer SDK / 开发者 SDK |
| `@agentpay-dev/mcp-server` | 0.1.1 | MCP Server (8 tools) / MCP 服务器 |
| `@agentpay-dev/x402-facilitator` | 0.1.0 | HTTP 402 middleware / HTTP 402 中间件 |
| `@agentpay-dev/ap2` | 0.1.0 | Google AP2 bridge / AP2 桥 |
| `create-agentpay` | 0.1.0 | CLI scaffolding / 命令行脚手架 |

---

## 8. Use Cases / 使用场景

### AI Agent API Marketplace / AI Agent API 市场

Agents discover and pay each other for services. A coding agent pays a translation agent, a review agent, a testing agent — each call is an atomic Hold Invoice transaction.

Agent 互相发现和付费。编程 Agent 付费给翻译 Agent、审查 Agent、测试 Agent——每次调用是一个原子化的 Hold Invoice 交易。

### DePIN Micropayments / DePIN 微支付

IoT sensors sell data streams with per-reading billing. Weather stations, traffic sensors, air quality monitors — each sells data via micro Hold Invoices.

物联网传感器按条计费卖数据流。气象站、交通传感器、空气质量监测器——每个通过微型 Hold Invoice 卖数据。

### HTTP 402 Paid APIs / HTTP 402 付费 API

Any REST API becomes a paid API with one line of middleware. Standard HTTP protocol — any language, any framework.

任何 REST API 加一行中间件变成付费 API。标准 HTTP 协议——任何语言，任何框架。

### Cross-Chain Agent Payments / 跨链 Agent 支付

BTC Lightning agents pay CKB Fiber agents and vice versa. The Cch bridge handles conversion transparently.

BTC 闪电网络 Agent 向 CKB Fiber Agent 付款，反之亦然。Cch 桥透明处理转换。

---

## 9. Roadmap / 路线图

- [x] Core protocol (Fiber RPC, settlement, assets) / 核心协议
- [x] SDK (AgentWallet, ServiceProvider, HubClient) / 开发者 SDK
- [x] MCP Server — 8 payment tools / MCP 服务器
- [x] x402 HTTP 402 facilitator / x402 中间件
- [x] AP2 protocol bridge / AP2 桥
- [x] DePIN metering module / DePIN 计量模块
- [x] BTC cross-chain (Cch + LND) / BTC 跨链
- [x] RGB++ bridge integration / RGB++ 桥集成
- [x] npm packages published / npm 包发布
- [x] MCP Registry registration / MCP 注册表注册
- [ ] Fiber mainnet deployment / Fiber 主网部署
- [ ] Stablecoin (RUSD/USDI) live on CKB / CKB 上稳定币上线
- [ ] Public demo site / 公开演示站点
- [ ] Production Hub service / 生产 Hub 服务
- [ ] Agent discovery marketplace / Agent 发现市场

---

## 10. How to Contribute / 如何参与

We welcome contributions from the Nervos community:

欢迎 Nervos 社区参与贡献：

```bash
git clone https://github.com/alefnt/AgentPay.git
cd AgentPay
pnpm install
pnpm build
pnpm test
```

- **Report issues / 反馈问题**: [GitHub Issues](https://github.com/alefnt/AgentPay/issues)
- **Discuss / 讨论**: Nervos Talk thread
- **Build agents / 构建 Agent**: `npx create-agentpay my-agent`

---

## Links / 链接

| Resource / 资源 | URL |
|---|---|
| GitHub | [github.com/alefnt/AgentPay](https://github.com/alefnt/AgentPay) |
| npm (SDK) | [npmjs.com/package/@agentpay-dev/sdk](https://www.npmjs.com/package/@agentpay-dev/sdk) |
| MCP Registry | [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/) |
| Fiber Network | [fiber.nervos.org](https://fiber.nervos.org/) |
| Nervos CKB | [nervos.org](https://nervos.org/) |

---

*AgentPay is open source under MIT license. Built on CKB Fiber Network for the Agent Economy.*

*AgentPay 基于 MIT 协议开源。构建在 CKB Fiber Network 上，为 Agent 经济服务。*
