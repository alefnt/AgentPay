/**
 * SDK Edge Case Tests
 *
 * Tests wallet input validation, provider edge cases, and error handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { AgentWallet } from '../src/wallet.js';
import { ServiceProvider } from '../src/provider.js';

// ═══════════════════════════════════════════════════════════
//  Mock Fiber
// ═══════════════════════════════════════════════════════════

const MOCK_PUBKEY = '0x02aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb2222cc';
let fiberServer: Server;
let fiberPort: number;

beforeAll(async () => {
  fiberServer = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { method, id } = JSON.parse(body);
      let result: any = null;
      if (method === 'node_info') {
        result = {
          node_name: 'edge-test', public_key: MOCK_PUBKEY,
          addresses: ['/ip4/127.0.0.1/tcp/8119'], chain_hash: '0x1',
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
    fiberServer.listen(0, () => { fiberPort = (fiberServer.address() as any).port; resolve(); });
  });
});

afterAll(() => { fiberServer?.close(); });

// ═══════════════════════════════════════════════════════════
//  Wallet Input Validation
// ═══════════════════════════════════════════════════════════

describe('AgentWallet Input Validation', () => {
  it('should reject empty providerUrl', async () => {
    const wallet = new AgentWallet({ fiberRpcUrl: `http://127.0.0.1:${fiberPort}` });
    await expect(
      wallet.payAndCall('', 'svc', { data: '1' }),
    ).rejects.toThrow('providerUrl is required');
  });

  it('should reject empty service name', async () => {
    const wallet = new AgentWallet({ fiberRpcUrl: `http://127.0.0.1:${fiberPort}` });
    await expect(
      wallet.payAndCall('http://localhost:3000', '', { data: '1' }),
    ).rejects.toThrow('service is required');
  });

  it('should reject non-object input', async () => {
    const wallet = new AgentWallet({ fiberRpcUrl: `http://127.0.0.1:${fiberPort}` });
    await expect(
      wallet.payAndCall('http://localhost:3000', 'svc', null as any),
    ).rejects.toThrow('input is required');
  });

  it('should list channels (empty)', async () => {
    const wallet = new AgentWallet({ fiberRpcUrl: `http://127.0.0.1:${fiberPort}` });
    const result = await wallet.listChannels();
    expect(result).toBeDefined();
  });

  it('should get node info', async () => {
    const wallet = new AgentWallet({ fiberRpcUrl: `http://127.0.0.1:${fiberPort}` });
    const info = await wallet.nodeInfo();
    expect(info.node_name).toBe('edge-test');
    expect(info.open_channel_count).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  ServiceProvider Edge Cases
// ═══════════════════════════════════════════════════════════

describe('ServiceProvider Edge Cases', () => {
  it('should require at least one service', () => {
    expect(() => new ServiceProvider({
      services: [],
    })).toThrow('at least one service');
  });

  it('should reject handler for unknown service', () => {
    const provider = new ServiceProvider({
      fiberRpcUrl: `http://127.0.0.1:${fiberPort}`,
      services: [{
        name: 'translate',
        description: 'Translate text',
        pricing: { model: 'per-call', amount: '100000000', asset: 'CKB' },
        input_schema: { text: 'string' },
        output_schema: { translated: 'string' },
      }],
    });
    expect(() => provider.onTask('nonexistent', async () => ({}))).toThrow('unknown service');
  });

  it('should accept handler for known service', () => {
    const provider = new ServiceProvider({
      fiberRpcUrl: `http://127.0.0.1:${fiberPort}`,
      services: [{
        name: 'code_review',
        description: 'Review code',
        pricing: { model: 'per-call', amount: '200000000', asset: 'CKB' },
        input_schema: { code: 'string' },
        output_schema: { issues: 'array' },
      }],
    });
    // Should not throw
    provider.onTask('code_review', async (input) => ({ issues: [] }));
  });

  it('should support chaining onTask', () => {
    const provider = new ServiceProvider({
      fiberRpcUrl: `http://127.0.0.1:${fiberPort}`,
      services: [
        {
          name: 'translate',
          description: 'Translate',
          pricing: { model: 'per-call', amount: '100000000', asset: 'CKB' },
          input_schema: {}, output_schema: {},
        },
        {
          name: 'lint',
          description: 'Lint',
          pricing: { model: 'per-call', amount: '50000000', asset: 'CKB' },
          input_schema: {}, output_schema: {},
        },
      ],
    });
    // Chaining should work (returns `this`)
    const result = provider
      .onTask('translate', async () => ({}))
      .onTask('lint', async () => ({}));
    expect(result).toBe(provider);
  });

  it('should reject SERVICE_REQUEST with missing service', async () => {
    const provider = new ServiceProvider({
      fiberRpcUrl: `http://127.0.0.1:${fiberPort}`,
      services: [{
        name: 'translate',
        description: 'Translate',
        pricing: { model: 'per-call', amount: '100000000', asset: 'CKB' },
        input_schema: {}, output_schema: {},
      }],
    });
    provider.onTask('translate', async () => ({}));

    const prov = provider as any;
    await expect(
      prov.handleServiceRequest({
        protocol: 'agentpay/1.0', id: 'test', timestamp: 0,
        from: '0x01', to: '0x02', signature: '',
        type: 'SERVICE_REQUEST',
        payload: { budget: { max_amount: '1000', asset: 'CKB' } },
      }),
    ).rejects.toThrow('Missing service name');
  });
});
