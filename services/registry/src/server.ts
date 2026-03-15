/**
 * AgentPay Registry — Agent Service Discovery
 *
 * HTTP API for Agent registration and service discovery.
 * Refactored to use extracted RegistryDatabase for testability.
 *
 * Endpoints:
 *   POST   /agents           — Register/update an Agent and its services
 *   GET    /agents           — List all Agents (with filters)
 *   GET    /agents/:pubkey   — Get a specific Agent's details
 *   GET    /services         — Search services across all Agents
 *   DELETE /agents/:pubkey   — Deregister an Agent
 *   GET    /health           — Health check
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createLogger } from '@agentpay/core';
import { RegistryDatabase, type AgentRow, type ServiceRow } from './database.js';

const log = createLogger({ name: 'registry', version: '0.1.0' });

// ═══════════════════════════════════════════════════════════
//  Config
// ═══════════════════════════════════════════════════════════

const PORT = parseInt(process.env.REGISTRY_PORT || '4001');
const DB_PATH = process.env.REGISTRY_DB || './registry.db';
const db = new RegistryDatabase(DB_PATH);

// ═══════════════════════════════════════════════════════════
//  HTTP Server
// ═══════════════════════════════════════════════════════════

const MAX_BODY_SIZE = 1_048_576; // 1MB

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    const url = new URL(req.url || '', `http://localhost:${PORT}`);
    const path = url.pathname;

    // ── Routes ──
    if (path === '/health') {
      return json(res, 200, { status: 'ok', agents: db.listAgents().length });
    }

    if (path === '/agents' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req, MAX_BODY_SIZE));
      if (!body.pubkey || !body.name || !body.endpoint || !body.services?.length) {
        return json(res, 400, { error: 'pubkey, name, endpoint, and services[] are required' });
      }
      db.upsertAgent(body);
      log.info({ pubkey: body.pubkey, name: body.name, serviceCount: body.services.length }, 'Agent registered');
      return json(res, 201, { status: 'registered', pubkey: body.pubkey });
    }

    if (path === '/agents' && req.method === 'GET') {
      const service = url.searchParams.get('service') || undefined;
      const asset = url.searchParams.get('asset') || undefined;
      const agents = db.listAgents({ service, asset });
      return json(res, 200, { count: agents.length, agents: agents.map(formatAgent) });
    }

    if (path.startsWith('/agents/') && req.method === 'GET') {
      const pubkey = decodeURIComponent(path.slice(8));
      const agent = db.getAgent(pubkey);
      if (!agent) return json(res, 404, { error: 'Agent not found' });
      return json(res, 200, formatAgent(agent));
    }

    if (path.startsWith('/agents/') && req.method === 'DELETE') {
      const pubkey = decodeURIComponent(path.slice(8));
      const ok = db.deleteAgent(pubkey);
      if (ok) log.info({ pubkey }, 'Agent deregistered');
      return json(res, ok ? 200 : 404, { status: ok ? 'deleted' : 'not found' });
    }

    if (path === '/services' && req.method === 'GET') {
      const name = url.searchParams.get('name') || undefined;
      const asset = url.searchParams.get('asset') || undefined;
      const max_price = url.searchParams.get('max_price') || undefined;
      const services = db.searchServices({ name, asset, max_price });
      return json(res, 200, {
        count: services.length,
        services: services.map((s) => ({
          name: s.name,
          description: s.description,
          provider: { pubkey: s.agent_pubkey, name: s.agent_name, endpoint: s.agent_endpoint },
          pricing: { model: s.pricing_model, amount: s.pricing_amount, asset: s.pricing_asset },
        })),
      });
    }

    // Heartbeat — agents periodically signal they're alive
    if (path.match(/^\/agents\/[^/]+\/heartbeat$/) && req.method === 'POST') {
      const pubkey = decodeURIComponent(path.split('/')[2]);
      const agent = db.getAgent(pubkey);
      if (!agent) return json(res, 404, { error: 'Agent not found' });
      db.updateHeartbeat(pubkey);
      return json(res, 200, { status: 'ok', pubkey, last_heartbeat: new Date().toISOString() });
    }

    // Discovery — find healthy agents offering a specific service
    if (path === '/services/discover' && req.method === 'GET') {
      const name = url.searchParams.get('name') || undefined;
      const asset = url.searchParams.get('asset') || undefined;
      const staleMinutes = parseInt(url.searchParams.get('stale_minutes') || '10');
      const services = db.searchServices({ name, asset });

      const now = Date.now();
      const staleThreshold = now - staleMinutes * 60 * 1000;

      const healthy = services.filter((s) => {
        const agents = db.listAgents();
        const agent = agents.find((a) => a.pubkey === s.agent_pubkey);
        if (!agent) return false;
        const hbTime = new Date(agent.last_heartbeat).getTime();
        return hbTime > staleThreshold;
      });

      return json(res, 200, {
        total: services.length,
        healthy: healthy.length,
        services: healthy.map((s) => ({
          name: s.name,
          description: s.description,
          provider: { pubkey: s.agent_pubkey, name: s.agent_name, endpoint: s.agent_endpoint },
          pricing: { model: s.pricing_model, amount: s.pricing_amount, asset: s.pricing_asset },
        })),
      });
    }

    json(res, 404, { error: 'Not found' });
  } catch (err: any) {
    log.error({ err }, 'Request error');
    json(res, 500, { error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) { req.destroy(); reject(new Error(`Body exceeds ${maxSize} bytes`)); }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function formatAgent(agent: AgentRow & { services: ServiceRow[] }) {
  return {
    pubkey: agent.pubkey,
    name: agent.name,
    description: agent.description,
    endpoint: agent.endpoint,
    bit_name: agent.bit_name || null,
    version: agent.version,
    registered_at: agent.registered_at,
    last_heartbeat: agent.last_heartbeat,
    services: agent.services.map((s) => ({
      name: s.name,
      description: s.description,
      pricing: { model: s.pricing_model, amount: s.pricing_amount, asset: s.pricing_asset },
      max_latency_ms: s.max_latency_ms,
    })),
  };
}

// ═══════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════

server.listen(PORT, () => {
  log.info({ port: PORT, dbPath: DB_PATH }, 'Registry Server started');
});
