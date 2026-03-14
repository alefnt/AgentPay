# AgentPay — BTC Agent Payment Protocol

> **给 AI Agent 一个钱包，让 Agent 之间可以真正互相付费调用服务**
>
> Powered by CKB [Fiber Network](https://github.com/nervosnetwork/fiber) + [RGB++](https://github.com/RGBPlusPlus/rgbpp-sdk) | x402 兼容

---

## 解决什么问题

AI Agent 需要调用其他 Agent 的服务（翻译、推理、搜索等），但目前：
- ❌ 没有标准的 Agent 间支付协议
- ❌ 传统支付（Stripe/支付宝）不适合高频微支付
- ❌ ETH gas 费太高，不适合微支付场景

**AgentPay 的方案**：
- ✅ 基于 CKB Fiber Network 的即时微支付（毫秒级、手续费 < 0.001 CKB）
- ✅ Hold Invoice 机制 = 无信任担保（先锁钱 → 完成任务 → 解锁）
- ✅ 支持 CKB / BTC / USDT / USDC / USDI 多资产
- ✅ RGB++ 协议集成（BTC ↔ CKB 资产桥接）
- ✅ BTC Lightning 互通（通过 Cch 模块）
- ✅ x402 兼容（ETH Agent 可调用）
- ✅ MCP Server（Claude/GPT 直接使用）

## 架构

```
┌─────────────────────────────────────────────────┐
│  AI Agents (Claude, GPT, Grok, 自定义 Agent)     │
│                                                  │
│  MCP Server ←→ @agentpay/sdk                     │
├─────────────────────────────────────────────────┤
│  AgentPay 协议层                                 │
│  REQUEST → OFFER → PAY (Hold Invoice) → EXECUTE │
│  ↕ x402 Facilitator (ETH 桥接)                   │
├─────────────────────────────────────────────────┤
│  CKB Fiber Network (L2 支付通道)                  │
│  Channel / Invoice / Payment / Cch               │
├─────────────────────────────────────────────────┤
│  RGB++ (BTC ↔ CKB 资产桥接)                      │
│  xUDT Leap / BtcAssetsApi / Paymaster            │
├─────────────────────────────────────────────────┤
│  CKB L1 (PoW + UTXO) + BTC L1                   │
└─────────────────────────────────────────────────┘
```

## 快速开始

> **⚡ 不需要自己安装 Fiber 节点！** AgentPay 提供 3 种使用方式，全部内置 Fiber 支持。

### 方式 1: Docker 一键部署（推荐）

Fiber 节点已内置在 Docker 中，无需单独安装：

```bash
npx create-agentpay my-agent --provider
cd my-agent
docker compose up -d    # Fiber 节点 + Agent 自动启动
```

### 方式 2: Hub 托管模式（零基础设施）

通过 AgentPay Hub 接入，**完全不需要运行任何节点**：

```typescript
import { HubClient } from '@agentpay/sdk';

// Hub 代管 Fiber 节点，用户只需 API Key
const hub = new HubClient({
  hubUrl: 'https://hub.agentpay.dev',
  apiKey: process.env.AGENTPAY_API_KEY,
});

// 付费调用，和本地 Fiber 体验完全一致
const result = await hub.payAndCall(
  'https://translator-agent.example.com',
  'translate',
  { text: 'Hello World', target: 'zh' },
);
```

### 方式 3: SDK 直接集成（高级用户）

如果你已有 Fiber 节点或想用 Docker 内的节点：

**Caller Agent** (付费调用):
```typescript
import { AgentWallet } from '@agentpay/sdk';

const wallet = new AgentWallet({
  fiberRpcUrl: 'http://127.0.0.1:8227',  // Docker 自动提供
});

const result = await wallet.payAndCall(
  'http://translator-agent:3001',
  'translate',
  { text: 'Hello World', target: 'zh' },
  { maxBudget: '100000000', asset: 'CKB' }  // 1 CKB
);
console.log(result.output); // { translated: '你好世界' }
```

**Provider Agent** (收费服务):
```typescript
import { ServiceProvider } from '@agentpay/sdk';

const provider = new ServiceProvider({
  fiberRpcUrl: 'http://127.0.0.1:8227',  // Docker 自动提供
  services: [{
    name: 'translate',
    pricing: { model: 'per-call', amount: '100000000', asset: 'CKB' },
    input_schema: { text: 'string', target: 'string' },
    output_schema: { translated: 'string' },
    description: 'Translate text',
  }],
});

provider.onTask('translate', async (input) => {
  const { text, target } = input as any;
  return { translated: await myTranslateAPI(text, target) };
});

provider.listen(3001);
```

### 方式 4: 作为 MCP 工具 (Claude/GPT)

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

然后在 Claude 中直接说：*"用 AgentPay 支付 1 CKB 调用翻译服务"*

### RGB++ 资产桥接

BTC 资产通过 RGB++ 协议桥接到 CKB，用于 Fiber 通道支付：

```typescript
import { RgbppBridge } from '@agentpay/core';

const bridge = new RgbppBridge({
  network: 'testnet',
  serviceToken: process.env.RGBPP_SERVICE_TOKEN,
});

// 查询 BTC 地址上的 RGB++ 资产
const assets = await bridge.getAssets('tb1q...');

// Leap: BTC → CKB (资产桥接到 CKB，用于 Fiber 支付)
const leap = await bridge.leapToCkb({
  btcUtxoTxId: '0x...',
  btcUtxoVout: 0,
  xudtTypeArgs: '0x...',
  amount: '100000000',
  toCkbAddress: 'ckt1q...',
  btcPrivateKey: 'your_key',
});

// 查看 Leap 状态
const status = await bridge.getLeapStatus(leap.btcTxId);
```

## 项目结构

```
packages/
├── core/                 # @agentpay/core — Fiber RPC + RGB++ Bridge + 协议类型
│   ├── src/
│   │   ├── fiber-rpc.ts  #   完整 Fiber RPC (Channel/Invoice/Payment/Cch)
│   │   ├── rgbpp-bridge.ts  # RGB++ 资产桥接 (Leap BTC↔CKB)
│   │   ├── types.ts      #   协议类型定义 (匹配 Fiber 官方文档)
│   │   ├── assets.ts     #   资产注册表 (CKB/BTC/USDT/USDC/USDI/WBTC)
│   │   ├── identity.ts   #   Agent 身份 (= Fiber node pubkey)
│   │   └── logger.ts     #   零依赖结构化日志 (pino 兼容)
│   └── tests/            #   66 单元测试
│
├── sdk/                  # @agentpay/sdk — 开发者 SDK
│   └── src/
│       ├── wallet.ts     #   AgentWallet — 付费调用 + RGB++ Bridge
│       ├── provider.ts   #   ServiceProvider — 收费服务 (HTTP)
│       └── hub-client.ts #   HubClient — 托管模式 (无需 Fiber 节点)
│
├── mcp-server/           # @agentpay/mcp-server — Claude/GPT MCP 工具
│   └── src/index.ts      #   5 个 MCP 工具 (pay_and_call 等)
│
├── x402-facilitator/     # @agentpay/x402-facilitator — x402 兼容
│   └── src/index.ts      #   /verify + /settle + /schemes
│
└── create-agentpay/      # create-agentpay — 一键项目生成

services/
├── hub/                  # AgentPay Hub — 托管 Fiber 接入
└── registry/             # Agent 服务发现

deploy/
├── Dockerfile            # 多阶段构建 (含 Fiber 节点)
├── fiber-config-*.yml    # Fiber 节点配置
docker-compose.yml        # 一键部署 (Fiber + Agent)
.github/workflows/ci.yml  # GitHub Actions CI/CD
```

## 支持的资产

| 资产 | 类型 | 状态 | 说明 |
|---|---|---|---|
| CKB | 原生 | ✅ 可用 | 1 CKB = 10^8 shannons |
| BTC | Lightning/Cch | ✅ 可用 | 通过 Cch 模块跨链 |
| USDI | xUDT | 🟡 CKB 原生 | CKB 原生稳定币 |
| USDT | xUDT/RGB++ | 🟡 待 Tether | RGB++ 发行后可用 |
| USDC | xUDT | 🔴 未来 | Circle 暂无 CKB 计划 |
| WBTC | xUDT/RGB++ | 🟡 待部署 | 通过 RGB++ Leap |
| 自定义 | xUDT | ✅ 支持 | 任意 xUDT |

## 安全模型

```
Hold Invoice = 先锁钱 → Provider 执行 → 用 preimage 解锁

1. Provider 生成 preimage + hash
2. Provider 用 hash 创建 Hold Invoice (有 hash 没 preimage)
3. Caller 支付 Invoice → 资金锁定到 Fiber TLC
4. Provider 执行任务
5. Provider 用 preimage settle_invoice → 资金释放给 Provider
6. 如果 Provider 不执行 → Invoice 超时 → 资金退回 Caller

结果: 双方都无风险
```

## 开发

```bash
pnpm install      # 安装依赖
pnpm -r build     # 构建所有包
pnpm -r test      # 运行 160+ 测试
```

## 前置条件

- Node.js >= 20
- pnpm >= 9

> **不需要** 自己安装 Fiber 节点。Docker 部署自动包含 Fiber，Hub 模式完全托管。

## 路线图

- [x] **Phase 1**: Core SDK + Hold Invoice 支付
- [x] **Phase 2**: MCP Server + x402 Facilitator + Agent Skills
- [x] **Phase 3**: RGB++ Bridge 集成 (BTC↔CKB Leap)
- [ ] **Phase 4**: 主网部署 + Fiber 主网通道 + CKB Grant

## 测试覆盖

| 包 | 测试数 |
|---|---|
| @agentpay/core | 66 (含 RGB++ 13) |
| @agentpay/sdk | 17 |
| Hub Server | 23 |
| Registry Server | 27 |
| x402 Facilitator | 10 |
| MCP Server | 11 |
| create-agentpay CLI | 7 |
| **合计** | **161** |

## License

MIT
