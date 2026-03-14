# AgentPay — 产品说明书

> BTC 原生的 AI Agent 支付协议 | Powered by CKB Fiber Network + RGB++

---

## 一、解决什么问题

### 现状: AI Agent 无法互相付费

2025 年，AI Agent 正在从"工具"变成"员工"。Agent 之间需要互相协作：
- 翻译 Agent 需要调用 OCR Agent
- 研究 Agent 需要调用搜索 Agent + 总结 Agent
- 代码 Agent 需要调用安全审查 Agent

**但目前没有标准的 Agent 间支付方案:**

| 方案 | 问题 |
|---|---|
| Stripe/支付宝 | KYC 复杂, 不支持微支付 (最低 $0.50), 不适合 Agent |
| ETH 转账 | Gas 费 > 服务费 (mint 一个 0.01U 的服务要 0.1U gas) |
| x402 (Coinbase) | 不支持 BTC, 需要 EVM 钱包 |
| Skyfire | 托管模式, 只支持 USDC, 中心化 |

### AgentPay 的方案

```
Agent A (调用方)                    Agent B (服务方)
    │                                   │
    │── 1. SERVICE_REQUEST ────────────>│
    │<─ 2. SERVICE_OFFER (Hold Invoice) │  ← Fiber 创建锁定发票
    │                                   │
    │── 3. 支付 Hold Invoice ──────────>│  ← 资金锁定 (未结算)
    │                                   │
    │── 4. TASK_INPUT ─────────────────>│
    │                                   │── 5. 执行任务
    │<─ 6. TASK_RESULT + 结算 ──────────│  ← preimage 解锁 = 收款
```

**核心创新: Hold Invoice = 无信任担保**
- 先锁钱 → 干活 → 用密码学证明解锁
- 如果服务方不干活 → 发票超时 → 资金自动退回
- 双方都没有风险

---

## 二、做了哪些 (已完成)

### 核心协议层

| 模块 | 说明 | 测试 |
|---|---|---|
| **@agentpay/core** | Fiber Network RPC 客户端 (Channel/Invoice/Payment/Cch/Peer/Info/Graph) | 53 tests ✅ |
| **协议消息** | REQUEST → OFFER → PAY → EXECUTE 四步协议 | 完整实现 |
| **Hold Invoice** | 无信任担保支付 (preimage/hash 机制) | 集成测试验证 |

### 开发者 SDK

| 模块 | 说明 | 测试 |
|---|---|---|
| **AgentWallet** | 3 行代码付费调用: `wallet.payAndCall(url, service, input)` | 17 tests ✅ |
| **ServiceProvider** | 3 行代码注册服务: `provider.onTask('translate', handler)` | 集成 + 边界 |
| **HubClient** | 无需 Fiber 节点: `createHubWallet({ hubUrl, apiKey })` | ✅ |

### 基础设施

| 模块 | 说明 | 测试 |
|---|---|---|
| **Hub Server** | 托管 Fiber 节点访问, Agent 注册, API Key, 速率限制 | 13 tests ✅ |
| **Registry** | Agent 服务发现: 按名称/资产/价格搜索 | 17 tests ✅ |
| **x402 Facilitator** | x402 协议兼容, CKB Fiber 作为结算层 | 10 tests ✅ |

### 生态集成

| 模块 | 说明 |
|---|---|
| **MCP Server** | Claude/GPT 直接调用 (5 个 MCP 工具) |
| **Agent Skills** | `.agent/skills/agentpay/SKILL.md` (任何 Agent 框架) |
| **create-agentpay** | `npx create-agentpay` 一键部署 (生成 Docker + 代码) |
| **Docker** | `docker compose up` 一键启动 Fiber + Agent |
| **CI/CD** | GitHub Actions: 测试 + 构建 + Docker 镜像 |

### 支持的资产

| 资产 | 状态 | 说明 |
|---|---|---|
| **CKB** | ✅ 可用 | 原生代币, 1 CKB = 10^8 shannons |
| **BTC** | ✅ 可用 | Lightning ↔ Fiber 原子交换 (Cch 模块) |
| **自定义 UDT** | ✅ 可用 | `createCustomAsset()` 注册任意 xUDT |
| **USDT/USDC** | ⏳ 已注册 | 等待 RGB++ 在 CKB 部署 |
| **WBTC** | ⏳ 已注册 | 等待 RGB++ isomorphic binding |

### 质量指标

| 指标 | 数据 |
|---|---|
| **测试** | 110 个, 0 失败 |
| **测试文件** | 9 个 (跨 5 个包) |
| **构建** | 10 个包全部编译通过 |
| **npm 发布** | dry-run 验证通过 |
| **生产强化** | 超时/重试/校验/速率限制/结构化日志 |

---

## 三、竞品对比

```
                    BTC 支持    Agent SDK    无信任担保    多资产    门槛
AgentPay              ✅           ✅           ✅          ✅      低 (Hub)
x402 (Coinbase)       ❌           ⚠️ 中间件    ❌          ❌      中
Skyfire               ❌           ✅           ❌          ❌      低 (托管)
L402 (Lightning)      ✅           ❌           ❌          ❌      高
```

**AgentPay 的差异化三角 (竞品无法同时复制):**
1. **BTC 原生** — x402/Skyfire 做不到
2. **Hold Invoice 无信任** — 比 L402/x402 的先付后用更安全
3. **多资产 + MCP** — L402 只有 BTC, x402 只有 USDC

---

## 四、未来路线图

### Phase 1: ✅ 已完成 — SDK + 协议

- 核心 SDK (Wallet + Provider)
- Hold Invoice 支付流程
- 生产强化 + 110 测试

### Phase 2: ✅ 已完成 — 生态集成

- MCP Server (Claude/GPT)
- x402 Facilitator (ETH Agent 兼容)
- Agent Registry (服务发现)
- Hub Server (托管 Fiber)
- create-agentpay CLI (一键部署)

### Phase 3: 🔜 下一步 — 主网 + 生态

| 项 | 说明 | 优先级 |
|---|---|---|
| **Fiber 测试网验证** | 真实 Fiber 节点端到端测试 | P0 |
| **npm 发布** | @agentpay/core + sdk + x402 | P0 |
| **RGB++ UDT 集成** | USDT/USDC 实际部署后接入 | P1 |
| **Cch Hub 运营** | BTC ↔ CKB 流动性节点 | P1 |
| **Agent 市场 UI** | Web 界面浏览/搜索 Agent 服务 | P2 |

### Phase 4: 🎯 愿景 — BTC Agent 经济

| 目标 | 说明 |
|---|---|
| **BTC Agent 支付标准** | 成为 BTC 生态的 Agent 间支付默认协议 |
| **x402 流量桥接** | ETH Agent 通过 x402 Facilitator → Fiber 结算 |
| **Agent 服务市场** | Registry 开放, 任何 Agent 可注册/发现/调用 |
| **CKB Grant 申请** | 向 Nervos Foundation 申请生态发展基金 |
| **Lightning 生态** | 对接 LND/CLN 节点, 扩大 BTC Agent 覆盖 |

### 长期愿景

```
AgentPay = BTC 生态的 Stripe for AI Agents
         = 每个 AI Agent 都有一个 BTC 原生钱包
         = Agent 之间像人类用微信支付一样自然
```

---

## 五、技术架构

```
┌─────────────────────────────────────────────────────┐
│  AI Agents (Claude, GPT, Grok, LangChain, AutoGPT) │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ MCP Tools│  │ SDK 直接 │  │ Hub REST API     │  │
│  │(Claude)  │  │ 集成     │  │ (无需 Fiber 节点)│  │
│  └────┬─────┘  └────┬─────┘  └────┬─────────────┘  │
├───────┴──────────────┴─────────────┴────────────────┤
│  AgentPay 协议层                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ REQUEST → OFFER → PAY (Hold Invoice) → EXEC │   │
│  │ x402 Facilitator (ETH 兼容桥)                │   │
│  └──────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│  CKB Fiber Network (L2 支付通道)                     │
│  Channel / Invoice / Payment / Cch (BTC 桥)         │
├─────────────────────────────────────────────────────┤
│  CKB L1 + RGB++ (BTC 资产桥接)                       │
│  PoW 共识 | UTXO 模型 | xUDT 多资产                 │
└─────────────────────────────────────────────────────┘
```

---

## 六、项目结构

```
agentpay/
├── packages/
│   ├── core/              @agentpay/core — Fiber RPC + 类型 + 资产 + 日志
│   ├── sdk/               @agentpay/sdk — AgentWallet + ServiceProvider
│   ├── mcp-server/        @agentpay/mcp-server — Claude/GPT 工具
│   ├── x402-facilitator/  @agentpay/x402 — x402 结算层
│   └── create-agentpay/   npx create-agentpay CLI
├── services/
│   ├── hub/               Hub Server (托管 Fiber 访问)
│   └── registry/          Agent Registry (服务发现)
├── examples/              3 个示例 (翻译/BTC 跨链/代码审查)
├── scripts/               e2e 测试 + npm 发布
├── deploy/                Docker + Fiber 配置
├── docs/                  协议规范 + 竞品分析 + 战略定位
└── .agent/skills/         Agent Skills 定义
```
