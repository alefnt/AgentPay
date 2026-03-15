/**
 * AgentPay Hub Server
 *
 * Managed Fiber node access for Agents.
 * Agents connect with an API key �?no need to run their own Fiber node.
 *
 * Endpoints:
 *   POST   /api/agent/register    �?Register new Agent, get API key
 *   GET    /api/agent/info        �?Get Agent identity info
 *   GET    /api/agent/balance     �?Get available balance
 *   POST   /api/pay-and-call      �?Pay and call a Provider Agent
 *   GET    /api/transactions      �?Transaction history
 *   GET    /health                �?Health check
 *
 * Authentication: Bearer token in Authorization header
 *   Authorization: Bearer ap_test_...
 *
 * Usage:
 *   FIBER_RPC_URL=http://127.0.0.1:8227 npx tsx src/server.ts
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { FiberRpcClient, createLogger, type AssetType } from '@agentpay-dev/core';
import { AgentWallet } from '@agentpay-dev/sdk';
import { HubDatabase, type AgentRecord } from './database.js';

const log = createLogger({ name: 'hub', version: '0.1.0' });

// ══════════════════════════════════════════════════════════�?//  Config
// ══════════════════════════════════════════════════════════�?
const PORT = parseInt(process.env.HUB_PORT || '4000');
const FIBER_RPC_URL = process.env.FIBER_RPC_URL || 'http://127.0.0.1:8227';
const DB_PATH = process.env.HUB_DB_PATH || './hub.db';
const RATE_LIMIT_PER_MINUTE = parseInt(process.env.RATE_LIMIT || '60');

// ══════════════════════════════════════════════════════════�?//  Hub Server
// ══════════════════════════════════════════════════════════�?
export class HubServer {
  private db: HubDatabase;
  private wallet: AgentWallet;
  private fiber: FiberRpcClient;

  constructor() {
    this.db = new HubDatabase(DB_PATH);
    this.wallet = new AgentWallet({ fiberRpcUrl: FIBER_RPC_URL });
    this.fiber = new FiberRpcClient({ rpcUrl: FIBER_RPC_URL });
  }

  start(): void {
    const server = createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        log.error({ err }, 'Unhandled request error');
        this.json(res, 500, { error: 'Internal server error' });
      });
    });

    server.listen(PORT, () => {
      log.info({ port: PORT, fiberRpcUrl: FIBER_RPC_URL, dbPath: DB_PATH }, 'Hub Server started');
    });

    // Cleanup rate limits every 5 minutes
    setInterval(() => this.db.cleanupRateLimits(), 5 * 60 * 1000);
  }

  // ─── Request Router ─────────────────────────────────────

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url?.split('?')[0];

    // Public endpoints (no auth required)
    if (url === '/health') {
      return this.handleHealth(res);
    }
    if (req.method === 'POST' && url === '/api/agent/register') {
      return this.handleRegister(req, res);
    }

    // Authenticated endpoints
    const agent = this.authenticate(req);
    if (!agent) {
      return this.json(res, 401, { error: 'Invalid or missing API key. Use Authorization: Bearer <api_key>' });
    }

    // Rate limit
    if (!this.db.checkRateLimit(agent.id, RATE_LIMIT_PER_MINUTE)) {
      return this.json(res, 429, { error: `Rate limit exceeded (${RATE_LIMIT_PER_MINUTE}/min)` });
    }

    switch (`${req.method} ${url}`) {
      case 'GET /api/agent/info':
        return this.handleAgentInfo(agent, res);
      case 'GET /api/agent/balance':
        return this.handleBalance(agent, res);
      case 'POST /api/pay-and-call':
        return this.handlePayAndCall(agent, req, res);
      case 'GET /api/transactions':
        return this.handleTransactions(agent, req, res);
      default:
        return this.json(res, 404, { error: 'Not found' });
    }
  }

  // ─── Auth ───────────────────────────────────────────────

  private authenticate(req: IncomingMessage): AgentRecord | null {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    const apiKey = auth.slice(7);
    return this.db.getAgentByApiKey(apiKey) || null;
  }

  // ─── Handlers ───────────────────────────────────────────

  private async handleHealth(res: ServerResponse): Promise<void> {
    let fiberOk = false;
    try {
      await this.fiber.nodeInfo();
      fiberOk = true;
    } catch {}
    this.json(res, 200, {
      status: fiberOk ? 'ok' : 'degraded',
      version: '0.1.0',
      fiber_connected: fiberOk,
    });
  }

  private async handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { name } = JSON.parse(body || '{}');

    if (!name || typeof name !== 'string' || name.length < 2) {
      return this.json(res, 400, { error: 'name is required (min 2 chars)' });
    }

    const { agentId, apiKey } = this.db.registerAgent(name);
    log.info({ agentId, name }, 'Agent registered');

    // Assign the Hub's Fiber pubkey as the agent's pubkey
    try {
      const info = await this.fiber.nodeInfo();
      this.db.updateAgentPubkey(agentId, info.node_id || info.public_key || '');
    } catch {}

    this.json(res, 201, {
      agent_id: agentId,
      api_key: apiKey,
      message: 'Save your API key �?it cannot be retrieved later.',
      usage: {
        header: `Authorization: Bearer ${apiKey}`,
        sdk: `createHubWallet({ hubUrl: 'http://localhost:${PORT}', apiKey: '${apiKey}' })`,
      },
    });
  }

  private async handleAgentInfo(agent: AgentRecord, res: ServerResponse): Promise<void> {
    let fiberInfo;
    try {
      fiberInfo = await this.fiber.nodeInfo();
    } catch {}

    this.json(res, 200, {
      agent_id: agent.id,
      name: agent.name,
      pubkey: agent.pubkey || fiberInfo?.node_id || fiberInfo?.public_key || '',
      created_at: agent.created_at,
      fiber_node: fiberInfo ? {
        node_name: fiberInfo.node_name,
        open_channels: fiberInfo.open_channel_count,
        peers: fiberInfo.peers_count,
      } : null,
    });
  }

  private async handleBalance(agent: AgentRecord, res: ServerResponse): Promise<void> {
    // Query Fiber channels for actual balance
    let available = '0';
    let locked = '0';
    try {
      const { channels } = await this.fiber.listChannels();
      let totalLocal = BigInt(0);
      let totalOffered = BigInt(0);
      for (const ch of channels) {
        totalLocal += BigInt(ch.local_balance);
        totalOffered += BigInt(ch.offered_tlc_balance);
      }
      available = totalLocal.toString();
      locked = totalOffered.toString();
    } catch {}

    this.json(res, 200, {
      available,
      locked,
      asset: 'CKB' as AssetType,
      channels: 'managed by Hub',
    });
  }

  private async handlePayAndCall(agent: AgentRecord, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { provider_url, service, input, max_budget, asset } = JSON.parse(body);

    if (!provider_url || !service || !input) {
      return this.json(res, 400, { error: 'provider_url, service, and input are required' });
    }

    // Create transaction record
    const txId = `tx_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    this.db.createTransaction({
      id: txId,
      agent_id: agent.id,
      type: 'sent',
      amount: max_budget || '100000000',
      asset: asset || 'CKB',
      provider_url,
      service,
      payment_hash: '',
      status: 'pending',
    });

    try {
      // Use the shared wallet to pay and call
      const result = await this.wallet.payAndCall(
        provider_url,
        service,
        input,
        {
          maxBudget: max_budget || '100000000',
          asset: asset || 'CKB',
        },
      );

      this.db.completeTransaction(txId, 'success');

      this.json(res, 200, {
        success: true,
        transaction_id: txId,
        output: result.output,
        payment: {
          hash: result.payment_hash,
          amount: result.amount,
          asset: result.asset,
          fee: result.fee,
        },
        provider: result.provider,
        execution_time_ms: result.execution_time_ms,
      });
    } catch (err: any) {
      this.db.completeTransaction(txId, 'failed');
      log.error({ txId, agentId: agent.id, service, err: err.message }, 'Pay-and-call failed');
      this.json(res, 502, {
        success: false,
        transaction_id: txId,
        error: err.message,
      });
    }
  }

  private async handleTransactions(agent: AgentRecord, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '', `http://localhost:${PORT}`);
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const status = url.searchParams.get('status') || undefined;

    const result = this.db.getTransactions(agent.id, { limit, offset, status });
    this.json(res, 200, result);
  }

  // ─── Helpers ────────────────────────────────────────────

  private json(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });
  }
}

// ══════════════════════════════════════════════════════════�?//  Main
// ══════════════════════════════════════════════════════════�?
const hub = new HubServer();
hub.start();
