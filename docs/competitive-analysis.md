# AgentPay 竞品分析 — 从 Agent 的需求出发

> 一份对 AgentPay 协议的诚实评估，从 AI Agent 的真实需求出发，
> 对比 x402 (Coinbase)、L402 (Lightning Labs)、Skyfire 等竞品。

---

## 1. Agent 真正需要什么？

在分析协议之前，先明确 AI Agent 的支付需求：

| # | Agent 的需求 | 为什么重要 |
|---|---|---|
| 1 | **纯编程接口** | Agent 没有 UI，不能点按钮，不能扫码 |
| 2 | **毫秒级结算** | Agent 的思考速度是毫秒级，等 12 秒确认不可接受 |
| 3 | **超低手续费** | 一个复杂任务可能调用 100+ 个 Agent，每次 $0.50 gas 会变成 $50 |
| 4 | **稳定币计价** | Agent 不想承担 ETH/BTC 波动风险，需要 USD 计价 |
| 5 | **无信任** | Agent 不认识对方，不能先付钱后祈祷 |
| 6 | **零配置上手** | Agent 开发者想 `npm install` 然后 3 行代码搞定 |
| 7 | **跨链互通** | BTC Agent 要能调用 ETH Agent 的服务 |
| 8 | **自主身份** | Agent 需要独立身份，不依赖人类账户 |
| 9 | **流动性充足** | 支付通道里要有足够的钱可用 |
| 10 | **合规/可审计** | 企业 Agent 需要交易记录、合规报告 |

---

## 2. 竞品矩阵

### 全面对比

| 维度 | **AgentPay** (我们) | **x402** (Coinbase) | **L402** (Lightning Labs) | **Skyfire** |
|---|---|---|---|---|
| **底层结算** | CKB Fiber Network | Base/EVM (L2) | BTC Lightning | 多链 (Base 为主) |
| **主要货币** | CKB + UDT | USDC | BTC (sats) | USDC |
| **手续费** | ~0.001 CKB (~$0.00001) | ~$0.0001 (Base L2) | ~1-10 sats (~$0.001) | 平台抽成 |
| **结算速度** | 毫秒级 (offchain) | ~2秒 (Base L2) | 毫秒级 (offchain) | 秒级 |
| **信任模型** | ✅ 无信任 (Hold Invoice) | ⚠️ 半信任 (Facilitator) | ✅ 无信任 (preimage) | ❌ 托管钱包 |
| **Agent 身份** | Fiber node pubkey | EVM 地址 | Lightning node ID | 平台账户 |
| **上手复杂度** | 需要 Fiber 节点 | npm + EVM 钱包 | 需要 Lightning 节点 | API Key |
| **生态成熟度** | 🔴 极早期 | 🟢 100M+ 交易 | 🟡 成熟但小众 | 🟡 $9.5M 融资 |
| **稳定币** | 🟡 USDI (小众) | ✅ USDC (主流) | ❌ 仅 BTC | ✅ USDC |
| **BTC 支持** | ✅ 通过 Cch | ❌ 不支持 | ✅ 原生 | ❌ |
| **合作伙伴** | CKB 基金会 | Cloudflare/Stripe/AWS | 无大型合作 | Coinbase/a16z |
| **开源** | ✅ 完全开源 | ✅ 完全开源 | ✅ 完全开源 | ❌ 封闭平台 |
| **MCP 支持** | ✅ 原生 MCP Server | 🟡 社区实现 | ❌ 无 | ❌ 无 |

---

## 3. AgentPay 的真实优势

### ✅ 优势 1: 真正的无信任 (Hold Invoice)

**这是我们最大的差异化优势。**

| | AgentPay | x402 | Skyfire |
|---|---|---|---|
| 担保机制 | Hold Invoice (链上锁定) | Facilitator 中心化验证 | 平台托管 |
| 谁持有资金 | Fiber 通道 (去中心化) | 买方钱包 → 卖方 | Skyfire 平台 |
| 作恶风险 | ✅ 双方零风险 | ⚠️ Facilitator 可作恶 | ❌ 平台可冻结 |

**为什么这对 Agent 重要**：Agent 没有法律手段追诉，不能"打电话投诉"。如果被骗钱，Agent 无法维权。Hold Invoice 是唯一让 Agent 真正安全的方案。

### ✅ 优势 2: BTC 原生 + 多链

AgentPay 通过 Fiber 的 Cch 模块原生支持 BTC Lightning。x402 完全不支持 BTC。

```
BTC Agent ←(Lightning)→ Cch ←(Fiber)→ CKB Agent
```

这意味着 BTC 生态的 Agent 可以直接和 AgentPay 生态互通。

### ✅ 优势 3: 极低手续费

| | 10,000 次调用的总费用 |
|---|---|
| AgentPay (Fiber) | ~$0.1 |
| x402 (Base L2) | ~$1.0 |
| L402 (Lightning) | ~$10 |
| Stripe (传统) | ~$2,900 (0.29/次) |

### ✅ 优势 4: 原生 MCP Server

AgentPay 是唯一自带 MCP Server 的 Agent 支付协议。Claude/GPT 可以直接通过 MCP 工具调用。

---

## 4. AgentPay 的真实劣势

### ❌ 劣势 1: 生态极小 (最大问题)

**这是生死攸关的问题。**

| | 交易量 | 开发者数 | 合作伙伴 |
|---|---|---|---|
| x402 | 100M+ | 数千 | Cloudflare/Stripe/AWS |
| Skyfire | 数万 | 数百 | Coinbase/a16z |
| L402 | 数百万 | 数百 | -- |
| **AgentPay** | **0** | **1** | **CKB 基金会** (潜在) |

**Agent 的视角**: "我为什么要用一个没人用的支付协议？我找不到可以调用的服务。"

**对策建议**:
1. 优先做 x402 Facilitator，让 x402 生态的 Agent 可以通过 AgentPay 结算
2. 做 MCP Server 生态，让 Claude/GPT 用户自然带入
3. 先在 CKB 社区做 Agent 服务市场 (翻译、推理等)

### ❌ 劣势 2: 没有主流稳定币

**这是实际使用的最大障碍。**

| | USDC 支持 | USDT 支持 |
|---|---|---|
| x402 | ✅ 原生 (Circle 官方) | ❌ |
| Skyfire | ✅ 原生 | ❌ |
| **AgentPay** | 🔴 **无** (CKB 上无 USDC) | 🔴 **无** (CKB 上无 USDT) |

**Agent 的视角**: "我不想持有 CKB，我想用美元计价。我的客户也只认 USDC。"

**对策建议**:
1. 短期: 用 USDI 或 CKB-native 稳定币
2. 中期: 通过 RGB++ Leap，如果 USDT 在 BTC/RGB 上发行，可以 Leap 到 CKB
3. 长期: 通过 x402 Facilitator，让 USDC 在 ETH 侧结算，AgentPay 在 Fiber 侧执行

### ❌ 劣势 3: 上手门槛高

| | Agent 接入步骤 |
|---|---|
| x402 | `npm install` → 配一个 EVM 钱包 → 完成 |
| Skyfire | 注册 → 拿 API Key → 完成 |
| **AgentPay** | 编译 Fiber 节点 → 部署到服务器 → 获取测试 CKB → 开通道 → 等确认 → 完成 |

**Agent 的视角**: "Skyfire 5 分钟搞定，你们要 2 小时？"

**对策建议**:
1. 提供托管 Fiber 节点 (类似 Infura 对 ETH 的角色)
2. 做一键部署脚本 / Docker
3. 或者做 "Lite Mode"，通过中继节点，不需要每个 Agent 自己跑 Fiber

### ❌ 劣势 4: 通道资金锁定

Fiber (和 Lightning) 都需要在通道中锁定资金。

| | 资金模型 |
|---|---|
| x402 | 按次付款，不需要预锁 |
| Skyfire | 充值到钱包，按需扣 |
| **AgentPay** | 必须在通道中锁至少 62 CKB (~$0.31) + 服务费用 |

**Agent 的视角**: "我要调用 100 个不同的 Agent，要开 100 个通道，每个锁 $1？"

**对策建议**:
1. 利用 Fiber 的路由网络，通过中间节点路由（不需要和每个 Provider 直接开通道）
2. 做路由节点服务 (AgentPay Hub)，所有 Agent 只需要和 Hub 开一个通道

---

## 5. 定位建议

### 不要和 x402 / Skyfire 正面竞争

他们有 Coinbase / a16z 的钱和生态。正面打不过。

### 应该做的定位

```
AgentPay = BTC Agent 支付协议
         = BTC 生态 Agent 经济的 Stripe
         = 唯一无信任的 Agent-to-Agent 支付方案
```

**差异化三角**:

1. **BTC 原生** — x402 不支持 BTC，L402 不支持多资产、没有 SDK
2. **真正无信任** — Hold Invoice 是唯一不需要第三方托管的方案
3. **CKB 底层** — Fiber 比 Lightning 更灵活 (多资产通道、UDT)

### 具体策略

| 阶段 | 策略 | 目标 |
|---|---|---|
| **现在** | 做好 x402 Facilitator | 借 x402 流量 |
| **3个月** | 做 AgentPay Hub (托管路由节点) | 降低接入门槛 |
| **6个月** | RGB++ USDT | 解决稳定币问题 |
| **12个月** | 成为 BTC Agent 支付标准 | CKB Grant + 社区 |

---

## 6. 总结

| | AgentPay 评分 | 说明 |
|---|---|---|
| **安全性** | ⭐⭐⭐⭐⭐ | Hold Invoice = 最安全 |
| **手续费** | ⭐⭐⭐⭐⭐ | 几乎为零 |
| **速度** | ⭐⭐⭐⭐⭐ | 毫秒级 |
| **BTC 互通** | ⭐⭐⭐⭐ | Cch 模块原生支持 |
| **MCP 集成** | ⭐⭐⭐⭐ | 原生 MCP Server |
| **稳定币** | ⭐ | 无 USDC/USDT |
| **生态** | ⭐ | 极早期 |
| **上手难度** | ⭐⭐ | 需要 Fiber 节点 |
| **流动性** | ⭐ | 通道需要锁定资金 |

**一句话**: AgentPay 的技术是最强的 (安全、便宜、快)，但生态和可用性是最弱的。
技术好不等于能赢。需要在生态和易用性上追赶。
