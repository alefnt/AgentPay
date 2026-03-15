#!/usr/bin/env node

/**
 * create-agentpay — One-Command Deployment
 *
 * Usage:
 *   npx create-agentpay                   # Interactive setup
 *   npx create-agentpay --docker          # Generate Docker deployment
 *   npx create-agentpay --provider        # Setup as Provider Agent
 *   npx create-agentpay --caller          # Setup as Caller Agent
 *
 * What it does:
 *   1. Creates project directory with all configs
 *   2. Generates Fiber node config
 *   3. Generates docker-compose.yml (Fiber + AgentPay)
 *   4. Generates Agent code template
 *   5. User just runs: docker compose up
 *
 * No development knowledge required.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';

// ═══════════════════════════════════════════════════════════
//  CLI
// ═══════════════════════════════════════════════════════════

const BANNER = `
╔══════════════════════════════════════════════════════╗
║                                                      ║
║   🚀 create-agentpay                                 ║
║                                                      ║
║   一键部署 AgentPay + Fiber 节点                      ║
║   BTC 原生 Agent 支付协议                             ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
`;

interface Config {
  projectName: string;
  mode: 'provider' | 'caller' | 'both';
  network: 'testnet' | 'mainnet';
  port: number;
  fiberPort: number;
  services: string[];
}

async function main() {
  console.log(BANNER);

  const args = process.argv.slice(2);

  // Quick mode (non-interactive)
  if (args.includes('--docker') || args.includes('--provider') || args.includes('--caller')) {
    const config: Config = {
      projectName: args.find(a => !a.startsWith('--')) || 'my-agent',
      mode: args.includes('--provider') ? 'provider' : args.includes('--caller') ? 'caller' : 'both',
      network: args.includes('--mainnet') ? 'mainnet' : 'testnet',
      port: 3001,
      fiberPort: 8227,
      services: ['translate'],
    };
    await generate(config);
    return;
  }

  // Interactive mode
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string, def: string = ''): Promise<string> =>
    new Promise((resolve) => {
      rl.question(`${q}${def ? ` (${def})` : ''}: `, (answer) => resolve(answer || def));
    });

  console.log('回答以下问题来配置你的 Agent:\n');

  const projectName = await ask('项目名称', 'my-agent');

  console.log('\n你的 Agent 角色是什么？');
  console.log('  1. Provider  — 提供付费服务 (如翻译、审查)');
  console.log('  2. Caller    — 调用其他 Agent 的服务');
  console.log('  3. Both      — 同时提供和调用');
  const modeAnswer = await ask('选择 (1/2/3)', '3');
  const mode = modeAnswer === '1' ? 'provider' : modeAnswer === '2' ? 'caller' : 'both';

  const networkAnswer = await ask('网络 (testnet/mainnet)', 'testnet');
  const network = networkAnswer === 'mainnet' ? 'mainnet' : 'testnet';

  const port = parseInt(await ask('Agent HTTP 端口', '3001'));
  const fiberPort = parseInt(await ask('Fiber RPC 端口', '8227'));

  const servicesStr = await ask('提供的服务 (逗号分隔)', 'translate');
  const services = servicesStr.split(',').map(s => s.trim());

  rl.close();

  const config: Config = { projectName, mode, network, port, fiberPort, services };
  await generate(config);
}

// ═══════════════════════════════════════════════════════════
//  Generator
// ═══════════════════════════════════════════════════════════

async function generate(config: Config) {
  const dir = join(process.cwd(), config.projectName);

  console.log(`\n📁 创建项目: ${dir}\n`);

  // Create directories
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, 'data'), { recursive: true });

  // 1. docker-compose.yml
  writeFileSync(join(dir, 'docker-compose.yml'), generateDockerCompose(config));
  console.log('  ✅ docker-compose.yml');

  // 2. Fiber config
  writeFileSync(join(dir, 'fiber-config.yml'), generateFiberConfig(config));
  console.log('  ✅ fiber-config.yml');

  // 3. .env
  writeFileSync(join(dir, '.env'), generateEnv(config));
  console.log('  ✅ .env');

  // 4. Agent code template
  if (config.mode === 'provider' || config.mode === 'both') {
    writeFileSync(join(dir, 'agent.ts'), generateProviderAgent(config));
    console.log('  ✅ agent.ts (Provider)');
  }

  if (config.mode === 'caller' || config.mode === 'both') {
    writeFileSync(join(dir, 'caller.ts'), generateCallerAgent(config));
    console.log('  ✅ caller.ts (Caller)');
  }

  // 5. package.json
  writeFileSync(join(dir, 'package.json'), generatePackageJson(config));
  console.log('  ✅ package.json');

  // 6. README
  writeFileSync(join(dir, 'README.md'), generateReadme(config));
  console.log('  ✅ README.md');

  // 7. .gitignore
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndata/\n.env\ndist/\n');
  console.log('  ✅ .gitignore');

  // Done
  console.log(`
╔══════════════════════════════════════════════════════╗
║  ✅ 部署完成！                                       ║
╚══════════════════════════════════════════════════════╝

下一步:

  cd ${config.projectName}

  # 方式 1: Docker 一键启动 (推荐)
  docker compose up -d

  # 方式 2: 手动启动
  pnpm install
  pnpm start

首次启动后:
  1. Fiber 节点会自动同步区块 (~5分钟)
  2. 到 https://faucet.nervos.org 获取测试 CKB
  3. 你的 Agent 就可以开始接收/发送付费调用了！

  API 文档: http://localhost:${config.port}/agentpay/request
  Fiber RPC: http://localhost:${config.fiberPort}
  `);
}

// ═══════════════════════════════════════════════════════════
//  Template Generators
// ═══════════════════════════════════════════════════════════

function generateDockerCompose(config: Config): string {
  const ckbRpc = config.network === 'mainnet'
    ? 'https://mainnet.ckb.dev'
    : 'https://testnet.ckb.dev';

  return `# AgentPay — Auto-generated by create-agentpay
# 启动: docker compose up -d
# 停止: docker compose down
# 日志: docker compose logs -f

version: '3.8'

services:
  # ─── Fiber 节点 (支付通道) ────────────────────
  fiber:
    image: nervosnetwork/fiber:latest
    container_name: ${config.projectName}-fiber
    ports:
      - "${config.fiberPort}:8227"    # RPC
      - "8119:8119"                   # P2P
    volumes:
      - ./data/fiber:/data
      - ./fiber-config.yml:/config.yml:ro
    environment:
      - RUST_LOG=info
      - CKB_RPC_URL=${ckbRpc}
    command: ["fnn", "-c", "/config.yml"]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8227"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ─── Agent 服务 ──────────────────────────────
  agent:
    image: node:20-alpine
    container_name: ${config.projectName}-agent
    working_dir: /app
    ports:
      - "${config.port}:${config.port}"
    volumes:
      - .:/app
    environment:
      - FIBER_RPC_URL=http://fiber:8227
      - PORT=${config.port}
    depends_on:
      fiber:
        condition: service_healthy
    command: ["npx", "tsx", "${config.mode === 'caller' ? 'caller.ts' : 'agent.ts'}"]
    restart: unless-stopped
`;
}

function generateFiberConfig(config: Config): string {
  const ckbRpc = config.network === 'mainnet'
    ? 'https://mainnet.ckb.dev'
    : 'https://testnet.ckb.dev';

  return `# Fiber Network 节点配置
# Auto-generated by create-agentpay

[fiber]
listening_port = 8119
rpc_listening_addr = "0.0.0.0:8227"
announce_listening_addr = true

[ckb]
rpc_url = "${ckbRpc}"
udt_whitelist = []

[store]
path = "/data"

[network]
bootnode_addrs = []
`;
}

function generateEnv(config: Config): string {
  return `# AgentPay 配置
# Auto-generated by create-agentpay

# Fiber 节点 (Docker 内部通信)
FIBER_RPC_URL=http://fiber:8227

# Agent 端口
PORT=${config.port}

# 网络 (testnet/mainnet)
NETWORK=${config.network}
`;
}

function generateProviderAgent(config: Config): string {
  const serviceBlocks = config.services.map(svc => {
    return `    {
      name: '${svc}',
      description: '${svc} service',
      input_schema: { text: 'string' },
      output_schema: { result: 'string' },
      pricing: { model: 'per-call', amount: '100000000', asset: 'CKB' }, // 1 CKB
    }`;
  }).join(',\n');

  const handlerBlocks = config.services.map(svc => {
    return `
provider.onTask('${svc}', async (input: unknown) => {
  const { text } = input as { text: string };

  // ← 在这里写你的业务逻辑
  const result = \`[${svc}] Processed: \${text}\`;

  return { result };
});`;
  }).join('\n');

  return `/**
 * ${config.projectName} — Provider Agent
 *
 * 这个 Agent 提供付费服务。
 * 其他 Agent 通过 AgentPay 支付 CKB 来调用你的服务。
 *
 * 修改方法:
 *   1. 修改 services 数组来定义你的服务和价格
 *   2. 修改 onTask 处理函数来实现你的业务逻辑
 *   3. docker compose restart agent (重启生效)
 */

import { ServiceProvider } from '@agentpay-dev/sdk';

const provider = new ServiceProvider({
  fiberRpcUrl: process.env.FIBER_RPC_URL || 'http://127.0.0.1:8227',
  currency: '${config.network === 'mainnet' ? 'Fibb' : 'Fibt'}',
  services: [
${serviceBlocks}
  ],
});

// ═══════════════════════════════════════════════════════════
//  业务逻辑 — 修改这里
// ═══════════════════════════════════════════════════════════
${handlerBlocks}

// ═══════════════════════════════════════════════════════════
//  启动服务
// ═══════════════════════════════════════════════════════════

const PORT = parseInt(process.env.PORT || '${config.port}');
provider.listen(PORT);

console.log(\`
╔══════════════════════════════════════════════════╗
║  ${config.projectName} — Provider Agent         
║                                                  ║
║  端口:   \${PORT}                                  
║  服务:   ${config.services.join(', ')}           
║  价格:   1 CKB per call                          ║
║                                                  ║
║  其他 Agent 可以这样调用你:                       ║
║  wallet.payAndCall(                              ║
║    'http://YOUR_IP:\${PORT}',                     
║    '${config.services[0]}',                      
║    { text: 'Hello' }                             ║
║  );                                              ║
╚══════════════════════════════════════════════════╝
\`);
`;
}

function generateCallerAgent(config: Config): string {
  return `/**
 * ${config.projectName} — Caller Agent
 *
 * 这个 Agent 调用其他 Agent 的付费服务。
 * 通过 AgentPay 支付 CKB 来获取服务。
 *
 * 使用方法:
 *   1. 确保 Fiber 节点正在运行
 *   2. 确保通道已开启且有余额
 *   3. 修改 PROVIDER_URL 为目标 Agent 的地址
 */

import { AgentWallet } from '@agentpay-dev/sdk';

const wallet = new AgentWallet({
  fiberRpcUrl: process.env.FIBER_RPC_URL || 'http://127.0.0.1:8227',
  currency: '${config.network === 'mainnet' ? 'Fibb' : 'Fibt'}',
});

async function main() {
  // 获取自己的身份
  const pubkey = await wallet.getPubkey();
  console.log('Agent ID:', pubkey);

  // 查看节点状态
  const info = await wallet.nodeInfo();
  console.log('Channels:', info.channel_count || info.open_channel_count || 0);

  // ═══════════════════════════════════════════════════════
  //  调用其他 Agent — 修改这里
  // ═══════════════════════════════════════════════════════

  const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:3001';

  try {
    const result = await wallet.payAndCall(
      PROVIDER_URL,
      '${config.services[0] || 'translate'}',
      { text: 'Hello World' },
      { maxBudget: '1000000000', asset: 'CKB' },  // max 10 CKB
    );

    console.log('\\n✅ 调用成功!');
    console.log('Output:', result.output);
    console.log('Paid:', result.amount, result.asset);
    console.log('Fee:', result.fee);
  } catch (err: any) {
    console.error('\\n❌ 调用失败:', err.message);
  }
}

main();
`;
}

function generatePackageJson(config: Config): string {
  return JSON.stringify({
    name: config.projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      start: config.mode === 'caller' ? 'tsx caller.ts' : 'tsx agent.ts',
      caller: 'tsx caller.ts',
      provider: 'tsx agent.ts',
    },
    dependencies: {
      '@agentpay-dev/sdk': 'latest',
    },
    devDependencies: {
      tsx: '^4.0.0',
    },
  }, null, 2);
}

function generateReadme(config: Config): string {
  return `# ${config.projectName}

> Auto-generated by \`npx create-agentpay\`

## 一键启动

\`\`\`bash
docker compose up -d
\`\`\`

## 首次设置

1. 等待 Fiber 节点同步 (~5分钟)
2. 获取测试 CKB: https://faucet.nervos.org
3. 你的 Agent 已准备就绪!

## 文件说明

| 文件 | 作用 |
|---|---|
| \`docker-compose.yml\` | Docker 配置 (Fiber + Agent) |
| \`fiber-config.yml\` | Fiber 节点配置 |
| \`agent.ts\` | Provider Agent (修改业务逻辑) |
| \`caller.ts\` | Caller Agent (调用其他 Agent) |
| \`.env\` | 环境变量 |

## 修改服务

编辑 \`agent.ts\` 中的 \`onTask\` 处理函数，然后:

\`\`\`bash
docker compose restart agent
\`\`\`

## 查看日志

\`\`\`bash
docker compose logs -f agent   # Agent 日志
docker compose logs -f fiber   # Fiber 节点日志
\`\`\`

## 网络

- Agent: http://localhost:${config.port}
- Fiber RPC: http://localhost:${config.fiberPort}
`;
}

// ─── Run ─────────────────────────────────────────────────

main().catch(console.error);
