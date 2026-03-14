/**
 * Hub Database Unit Tests
 *
 * Tests agent registration, API key auth, transactions, and rate limiting.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HubDatabase } from '../src/database.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = './test-hub.db';
let db: HubDatabase;

beforeAll(() => {
  db = new HubDatabase(TEST_DB);
});

afterAll(() => {
  db.close();
  try { unlinkSync(TEST_DB); } catch {}
});

describe('Agent Registration', () => {
  it('should register an agent and return API key', () => {
    const { agentId, apiKey } = db.registerAgent('Test Agent');
    expect(agentId).toMatch(/^ag_/);
    expect(apiKey).toMatch(/^ap_/);
    expect(agentId.length).toBeGreaterThan(10);
    expect(apiKey.length).toBeGreaterThan(20);
  });

  it('should look up agent by API key', () => {
    const { agentId, apiKey } = db.registerAgent('Lookup Agent');
    const found = db.getAgentByApiKey(apiKey);
    expect(found).toBeDefined();
    expect(found!.id).toBe(agentId);
    expect(found!.name).toBe('Lookup Agent');
    expect(found!.status).toBe('active');
  });

  it('should not find agent with wrong API key', () => {
    const found = db.getAgentByApiKey('ap_fake_key_12345');
    expect(found).toBeUndefined();
  });

  it('should look up agent by ID', () => {
    const { agentId } = db.registerAgent('ID Agent');
    const found = db.getAgentById(agentId);
    expect(found).toBeDefined();
    expect(found!.name).toBe('ID Agent');
  });

  it('should update agent pubkey', () => {
    const { agentId } = db.registerAgent('Pubkey Agent');
    db.updateAgentPubkey(agentId, '0x02aabb');
    const found = db.getAgentById(agentId);
    expect(found!.pubkey).toBe('0x02aabb');
  });

  it('should generate unique API keys', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const { apiKey } = db.registerAgent(`Agent ${i}`);
      keys.add(apiKey);
    }
    expect(keys.size).toBe(10);
  });
});

describe('Transactions', () => {
  let agentId: string;

  beforeAll(() => {
    agentId = db.registerAgent('Tx Agent').agentId;
  });

  it('should create and retrieve a transaction', () => {
    db.createTransaction({
      id: 'tx_001',
      agent_id: agentId,
      type: 'sent',
      amount: '100000000',
      asset: 'CKB',
      provider_url: 'http://provider:3000',
      service: 'translate',
      payment_hash: '0xaabb',
      status: 'pending',
    });

    const { transactions, total } = db.getTransactions(agentId);
    expect(total).toBe(1);
    expect(transactions[0].id).toBe('tx_001');
    expect(transactions[0].type).toBe('sent');
    expect(transactions[0].status).toBe('pending');
  });

  it('should complete a transaction', () => {
    db.completeTransaction('tx_001', 'success');
    const { transactions } = db.getTransactions(agentId);
    expect(transactions[0].status).toBe('success');
    expect(transactions[0].completed_at).not.toBeNull();
  });

  it('should filter transactions by status', () => {
    db.createTransaction({
      id: 'tx_002',
      agent_id: agentId,
      type: 'sent',
      amount: '50000000',
      asset: 'CKB',
      provider_url: 'http://provider:3000',
      service: 'code_review',
      payment_hash: '0xccdd',
      status: 'pending',
    });

    const { transactions: pending } = db.getTransactions(agentId, { status: 'pending' });
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe('tx_002');

    const { transactions: success } = db.getTransactions(agentId, { status: 'success' });
    expect(success.length).toBe(1);
    expect(success[0].id).toBe('tx_001');
  });

  it('should paginate transactions', () => {
    const { transactions: page1 } = db.getTransactions(agentId, { limit: 1, offset: 0 });
    expect(page1.length).toBe(1);

    const { transactions: page2 } = db.getTransactions(agentId, { limit: 1, offset: 1 });
    expect(page2.length).toBe(1);
    expect(page1[0].id).not.toBe(page2[0].id);
  });
});

describe('Rate Limiting', () => {
  it('should allow requests within limit', () => {
    const agentId = db.registerAgent('Rate Agent').agentId;
    expect(db.checkRateLimit(agentId, 5)).toBe(true);
    expect(db.checkRateLimit(agentId, 5)).toBe(true);
  });

  it('should block requests exceeding limit', () => {
    const agentId = db.registerAgent('Blocked Agent').agentId;
    for (let i = 0; i < 3; i++) {
      db.checkRateLimit(agentId, 3);
    }
    expect(db.checkRateLimit(agentId, 3)).toBe(false);
  });

  it('should cleanup old rate limits', () => {
    db.cleanupRateLimits(); // Should not throw
  });
});
