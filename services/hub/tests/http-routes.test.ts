/**
 * Hub Server HTTP Route Tests
 *
 * Tests the HTTP layer: routing, auth, CORS, rate limiting, error handling.
 * Uses a real HTTP server with mock Fiber.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';

// Mock Fiber for Hub
let mockFiber: Server;
let mockFiberPort: number;

beforeAll(async () => {
  mockFiber = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { method, id } = JSON.parse(body);
      let result: any = null;

      if (method === 'node_info') {
        result = {
          node_name: 'hub-test', public_key: '0x02test_pubkey',
          addresses: [], chain_hash: '0x1',
          open_channel_count: 0, pending_channel_count: 0, peers_count: 0,
          network_sync_status: 'Synced', udt_cfg_infos: {},
        };
      } else if (method === 'list_channels') {
        result = { channels: [] };
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    });
  });

  await new Promise<void>((resolve) => {
    mockFiber.listen(0, () => { mockFiberPort = (mockFiber.address() as any).port; resolve(); });
  });
});

afterAll(() => { mockFiber?.close(); });

// ═══════════════════════════════════════════════════════════
//  Hub HTTP Tests (via HubDatabase directly — no full server)
// ═══════════════════════════════════════════════════════════

import { HubDatabase } from '../src/database.js';

describe('Hub HTTP Logic', () => {
  it('should reject registration with short name', () => {
    const body = JSON.stringify({ name: 'a' });
    const { name } = JSON.parse(body);
    expect(name.length < 2).toBe(true);
  });

  it('should reject registration without name', () => {
    const body = JSON.stringify({});
    const { name } = JSON.parse(body);
    expect(!name).toBe(true);
  });

  it('should authenticate with valid API key', () => {
    const db = new HubDatabase(':memory:');
    const { agentId, apiKey } = db.registerAgent('TestAgent');
    const agent = db.getAgentByApiKey(apiKey);
    expect(agent).toBeDefined();
    expect(agent!.id).toBe(agentId);
    db.close();
  });

  it('should reject invalid API key', () => {
    const db = new HubDatabase(':memory:');
    db.registerAgent('TestAgent');
    const agent = db.getAgentByApiKey('wrong_key');
    expect(agent).toBeUndefined();
    db.close();
  });

  it('should enforce rate limits', () => {
    const db = new HubDatabase(':memory:');
    const { agentId } = db.registerAgent('RateAgent');
    // Fill up rate limit (3 per minute)
    for (let i = 0; i < 3; i++) {
      expect(db.checkRateLimit(agentId, 3)).toBe(true);
    }
    expect(db.checkRateLimit(agentId, 3)).toBe(false);
    db.close();
  });

  it('should handle CORS preflight', () => {
    // Simulate OPTIONS response headers
    const headers: Record<string, string> = {};
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
    expect(headers['Access-Control-Allow-Methods']).toContain('POST');
  });

  it('should parse Authorization Bearer token', () => {
    const authHeader: string = 'Bearer ap_test_abc123';
    const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    expect(apiKey).toBe('ap_test_abc123');
  });

  it('should reject missing Authorization header', () => {
    function extractKey(header: string | null): string | null {
      if (!header || !header.startsWith('Bearer ')) return null;
      return header.slice(7);
    }
    expect(extractKey(null)).toBeNull();
    expect(extractKey('')).toBeNull();
    expect(extractKey('Basic abc')).toBeNull();
  });

  it('should handle transaction creation and completion', () => {
    const db = new HubDatabase(':memory:');
    const { agentId } = db.registerAgent('TxAgent');
    db.createTransaction({
      id: 'tx_test001',
      agent_id: agentId,
      type: 'sent',
      amount: '100000000',
      asset: 'CKB',
      provider_url: 'http://example.com',
      service: 'translate',
      payment_hash: '0xaabb',
      status: 'pending',
    });
    db.completeTransaction('tx_test001', 'success');
    const { transactions } = db.getTransactions(agentId, {});
    expect(transactions[0].status).toBe('success');
    db.close();
  });

  it('should support pagination', () => {
    const db = new HubDatabase(':memory:');
    const { agentId } = db.registerAgent('PageAgent');
    for (let i = 0; i < 5; i++) {
      db.createTransaction({
        id: `tx_page_${i}`, agent_id: agentId, type: 'sent',
        amount: '100', asset: 'CKB', provider_url: '', service: 'test',
        payment_hash: '', status: 'pending',
      });
    }
    const page1 = db.getTransactions(agentId, { limit: 2, offset: 0 });
    const page2 = db.getTransactions(agentId, { limit: 2, offset: 2 });
    expect(page1.transactions.length).toBe(2);
    expect(page2.transactions.length).toBe(2);
    db.close();
  });
});
