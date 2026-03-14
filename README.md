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
│  CKB L1 + RGB++ (BTC 资产桥接)                    │
└─────────────────────────────────────────────────┘
```

## 快速开始

### 方式 1: 作为 SDK 集成

```bash
pnpm add @agentpay/sdk
```

**Caller Agent** (付费调用):
```typescript
import { AgentWallet } from '@agentpay/sdk';

const wallet = new AgentWallet({ fiberRpcUrl: 'http://127.0.0.1:8227' });

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
  fiberRpcUrl: 'http://127.0.0.1:8227',
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

### 方式 2: 作为 MCP 工具 (Claude/GPT)

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

### 方式 3: Docker 部署

```bash
cp .env.example .env  # 配置 CKB/Fiber 节点
docker compose up -d
```

## 项目结构

```
packages/
├── core/                 # @agentpay/core — Fiber RPC 客户端 + 协议类型
│   ├── src/
│   │   ├── fiber-rpc.ts  #   完整 Fiber RPC (Channel/Invoice/Payment/Cch)
│   │   ├── types.ts      #   协议类型定义 (匹配 Fiber 官方文档)
│   │   ├── assets.ts     #   资产注册表 (CKB/BTC/USDT/USDC/USDI/WBTC)
│   │   └── identity.ts   #   Agent 身份 (= Fiber node pubkey)
│   └── tests/            #   单元测试 (Fiber RPC mock + assets + identity)
│
├── sdk/                  # @agentpay/sdk — 开发者 SDK
│   └── src/
│       ├── wallet.ts     #   AgentWallet — 付费调用 (Hold Invoice)
│       └── provider.ts   #   ServiceProvider — 收费服务 (HTTP)
│
├── mcp-server/           # @agentpay/mcp-server — Claude/GPT MCP 工具
│   └── src/index.ts      #   5 个 MCP 工具 (pay_and_call 等)
│
└── x402-facilitator/     # @agentpay/x402-facilitator — x402 兼容
    └── src/index.ts      #   /verify + /settle + /schemes

examples/
└── translate-agent/      # 端到端示例 (Provider + Caller)

deploy/
├── Dockerfile            # 多阶段构建
├── fiber-config-*.yml    # Fiber 节点配置
docker-compose.yml        # 一键部署
.github/workflows/ci.yml  # GitHub Actions CI/CD
```

## 支持的资产

| 资产 | 类型 | 状态 | 说明 |
|---|---|---|---|
| CKB | 原生 | ✅ 可用 | 1 CKB = 10^8 shannons |
| BTC | Lightning | ✅ 可用 | 通过 Cch 模块跨链 |
| USDI | UDT | 🟡 CKB 原生 | CKB 原生稳定币 |
| USDT | UDT/RGB++ | 🟡 待部署 | 等 Tether RGB 部署 |
| USDC | UDT | 🔴 未来 | Circle 暂无 CKB 计划 |
| WBTC | UDT/RGB++ | 🟡 待部署 | 包装 BTC |
| 自定义 | UDT | ✅ 支持 | 任意 xUDT |

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
pnpm -r test      # 运行测试
```

## 前置条件

- Node.js >= 20
- pnpm >= 9
- [Fiber Network 节点](https://github.com/nervosnetwork/fiber) (fnn)
- CKB 测试网 RPC (`https://testnet.ckb.dev`)

## 路线图

- [x] **Phase 1**: Core SDK + Hold Invoice 支付
- [x] **Phase 2**: MCP Server + x402 Facilitator
- [ ] **Phase 3**: RGB++ xUDT Leap 集成
- [ ] **Phase 4**: 主网部署 + CKB Grant

## License

MIT
