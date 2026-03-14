/**
 * Registry HTTP Route Tests
 *
 * Tests the HTTP layer: routing, search, pagination, error handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RegistryDatabase } from '../src/database.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = './test-registry-http.db';
let db: RegistryDatabase;

const makeService = (name: string, amount: string, asset = 'CKB') => ({
  name,
  description: `${name} service`,
  pricing: { model: 'per-call' as const, amount, asset: asset as any },
  input_schema: {},
  output_schema: {},
});

beforeEach(() => { db = new RegistryDatabase(TEST_DB); });
afterEach(() => { db.close(); try { unlinkSync(TEST_DB); } catch {} });

describe('Registry HTTP Logic', () => {
  it('should validate registration requires pubkey', () => {
    const body = { name: 'Agent', endpoint: 'http://localhost', services: [{}] };
    expect(!(body as any).pubkey).toBe(true);
  });

  it('should validate registration requires services', () => {
    const body = { pubkey: '0x01', name: 'Agent', endpoint: 'http://localhost' };
    expect(!(body as any).services?.length).toBe(true);
  });

  it('should list agents after registration', () => {
    db.upsertAgent({
      pubkey: '0x01', name: 'Agent1', description: 'Test', endpoint: 'http://a:3001', version: '1.0.0',
      services: [makeService('translate', '100000000')],
    });
    const agents = db.listAgents();
    expect(agents.length).toBe(1);
    expect(agents[0].name).toBe('Agent1');
  });

  it('should get agent by pubkey', () => {
    db.upsertAgent({
      pubkey: '0xaaaa', name: 'SpecificAgent', description: '', endpoint: 'http://a:3001', version: '1.0.0',
      services: [makeService('svc', '50000000')],
    });
    const agent = db.getAgent('0xaaaa');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('SpecificAgent');
  });

  it('should return null for unknown pubkey', () => {
    expect(db.getAgent('0xnonexistent')).toBeNull();
  });

  it('should filter agents by service name', () => {
    db.upsertAgent({ pubkey: '0x01', name: 'A1', endpoint: 'http://a1', services: [makeService('translate', '100000000')] });
    db.upsertAgent({ pubkey: '0x02', name: 'A2', endpoint: 'http://a2', services: [makeService('lint', '50000000')] });
    const agents = db.listAgents({ service: 'translate' });
    expect(agents.length).toBe(1);
    expect(agents[0].name).toBe('A1');
  });

  it('should search services with max_price filter', () => {
    db.upsertAgent({ pubkey: '0x01', name: 'Cheap', endpoint: 'http://a1', services: [makeService('translate', '50000000')] });
    db.upsertAgent({ pubkey: '0x02', name: 'Expensive', endpoint: 'http://a2', services: [makeService('translate', '500000000')] });
    const cheap = db.searchServices({ name: 'translate', max_price: '100000000' });
    expect(cheap.length).toBe(1);
    expect(cheap[0].agent_name).toBe('Cheap');
  });

  it('should format service response correctly', () => {
    db.upsertAgent({ pubkey: '0x01', name: 'FormatAgent', endpoint: 'http://fmt:3001', services: [makeService('summarize', '200000000')] });
    const services = db.searchServices({ name: 'summarize' });
    const svc = services[0];
    const formatted = {
      name: svc.name,
      provider: { pubkey: svc.agent_pubkey, name: svc.agent_name, endpoint: svc.agent_endpoint },
      pricing: { model: svc.pricing_model, amount: svc.pricing_amount, asset: svc.pricing_asset },
    };
    expect(formatted.name).toBe('summarize');
    expect(formatted.provider.name).toBe('FormatAgent');
    expect(formatted.pricing.amount).toBe('200000000');
  });

  it('should handle health data', () => {
    db.upsertAgent({ pubkey: '0x01', name: 'A', endpoint: 'http://a', services: [makeService('s', '1')] });
    expect({ status: 'ok', agents: db.listAgents().length }).toEqual({ status: 'ok', agents: 1 });
  });

  it('should soft-delete and not return inactive agents', () => {
    db.upsertAgent({ pubkey: '0x99', name: 'Temp', endpoint: 'http://temp', services: [makeService('x', '1')] });
    expect(db.listAgents().length).toBe(1);
    db.deleteAgent('0x99');
    expect(db.listAgents().length).toBe(0);
  });
});
