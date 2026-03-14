/**
 * Registry Database Unit Tests
 *
 * Tests agent registration, service discovery, search, deregistration.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RegistryDatabase } from '../src/database.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = './test-registry.db';
let db: RegistryDatabase;

beforeAll(() => {
  db = new RegistryDatabase(TEST_DB);
});

afterAll(() => {
  db.close();
  try { unlinkSync(TEST_DB); } catch {}
});

const TRANSLATE_AGENT = {
  pubkey: '0x02translate',
  name: 'TranslateBot',
  description: 'AI translation service',
  endpoint: 'http://translate:3001',
  services: [{
    name: 'translate',
    description: 'Translate text between languages',
    input_schema: { text: 'string', target: 'string' },
    output_schema: { translated: 'string' },
    pricing: { model: 'per-call' as const, amount: '100000000', asset: 'CKB' as const },
    sla: { max_latency_ms: 3000 },
  }],
};

const CODE_REVIEW_AGENT = {
  pubkey: '0x02codereview',
  name: 'CodeReviewBot',
  description: 'Automated code review',
  endpoint: 'http://codereview:3002',
  services: [
    {
      name: 'code_review',
      description: 'Static analysis code review',
      input_schema: { code: 'string', language: 'string' },
      output_schema: { issues: 'array', score: 'number' },
      pricing: { model: 'per-call' as const, amount: '200000000', asset: 'CKB' as const },
    },
    {
      name: 'lint',
      description: 'Lint code for style issues',
      input_schema: { code: 'string' },
      output_schema: { issues: 'array' },
      pricing: { model: 'per-call' as const, amount: '50000000', asset: 'CKB' as const },
    },
  ],
};

describe('Agent Registration', () => {
  it('should register an agent with services', () => {
    db.upsertAgent(TRANSLATE_AGENT);
    const agent = db.getAgent('0x02translate');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('TranslateBot');
    expect(agent!.endpoint).toBe('http://translate:3001');
    expect(agent!.services.length).toBe(1);
    expect(agent!.services[0].name).toBe('translate');
    expect(agent!.services[0].pricing_amount).toBe('100000000');
  });

  it('should register agent with multiple services', () => {
    db.upsertAgent(CODE_REVIEW_AGENT);
    const agent = db.getAgent('0x02codereview');
    expect(agent!.services.length).toBe(2);
    expect(agent!.services.map(s => s.name).sort()).toEqual(['code_review', 'lint']);
  });

  it('should update existing agent on re-registration', () => {
    db.upsertAgent({ ...TRANSLATE_AGENT, name: 'TranslateBot v2', endpoint: 'http://new-translate:3001' });
    const agent = db.getAgent('0x02translate');
    expect(agent!.name).toBe('TranslateBot v2');
    expect(agent!.endpoint).toBe('http://new-translate:3001');
  });

  it('should return null for non-existent agent', () => {
    const agent = db.getAgent('0x02nonexistent');
    expect(agent).toBeNull();
  });
});

describe('Agent Listing', () => {
  it('should list all active agents', () => {
    const agents = db.listAgents();
    expect(agents.length).toBe(2);
  });

  it('should filter agents by service name', () => {
    const agents = db.listAgents({ service: 'translate' });
    expect(agents.length).toBe(1);
    expect(agents[0].name).toBe('TranslateBot v2');
  });

  it('should filter agents by asset', () => {
    const agents = db.listAgents({ asset: 'CKB' });
    expect(agents.length).toBe(2);
  });
});

describe('Service Search', () => {
  it('should search services by name', () => {
    const services = db.searchServices({ name: 'translate' });
    expect(services.length).toBe(1);
    expect(services[0].name).toBe('translate');
    expect(services[0].agent_name).toBe('TranslateBot v2');
  });

  it('should search services by asset', () => {
    const services = db.searchServices({ asset: 'CKB' });
    expect(services.length).toBe(3); // translate + code_review + lint
  });

  it('should search services by max price', () => {
    const cheap = db.searchServices({ max_price: '100000000' });
    expect(cheap.length).toBe(2); // translate(100M) + lint(50M)
    expect(cheap.every(s => parseInt(s.pricing_amount) <= 100000000)).toBe(true);
  });

  it('should combine search filters', () => {
    const result = db.searchServices({ name: 'code', max_price: '300000000' });
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('code_review');
  });

  it('should return services sorted by price (ascending)', () => {
    const services = db.searchServices({ asset: 'CKB' });
    for (let i = 1; i < services.length; i++) {
      expect(parseInt(services[i].pricing_amount)).toBeGreaterThanOrEqual(parseInt(services[i - 1].pricing_amount));
    }
  });
});

describe('Agent Deregistration', () => {
  it('should soft-delete an agent', () => {
    const deleted = db.deleteAgent('0x02codereview');
    expect(deleted).toBe(true);

    const agent = db.getAgent('0x02codereview');
    expect(agent).toBeNull(); // status = inactive → not found
  });

  it('should not find deleted agent in listings', () => {
    const agents = db.listAgents();
    expect(agents.length).toBe(1);
    expect(agents[0].pubkey).toBe('0x02translate');
  });

  it('should not find deleted agent services in search', () => {
    const services = db.searchServices({ name: 'code_review' });
    expect(services.length).toBe(0);
  });

  it('should return false for non-existent delete', () => {
    const deleted = db.deleteAgent('0x02nonexistent');
    expect(deleted).toBe(false);
  });

  it('should re-activate agent on re-registration', () => {
    db.upsertAgent(CODE_REVIEW_AGENT);
    const agent = db.getAgent('0x02codereview');
    expect(agent).toBeDefined();
    expect(agent!.status).toBe('active');
  });
});
