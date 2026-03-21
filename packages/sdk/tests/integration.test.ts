/**
 * End-to-End Integration Test
 *
 * Spins up:
 *   1. A mock Fiber node (JSON-RPC) — shared by both wallet and provider
 *   2. A ServiceProvider HTTP server (translation agent)
 *   3. An AgentWallet (caller)
 *
 * Then runs the full AgentPay protocol:
 *   REQUEST → OFFER → PAY → EXECUTE → SETTLE
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { AgentWallet } from '../src/wallet.js';
import { ServiceProvider } from '../src/provider.js';

// ═══════════════════════════════════════════════════════════
//  Mock Fiber Node (shared by wallet and provider)
// ═══════════════════════════════════════════════════════════

const MOCK_PUBKEY = '0x02aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb2222cc';

let fiberServer: Server;
let fiberPort: number;

// Tracks invoices created via new_invoice — key: payment_hash → status
const invoices = new Map<string, string>();
// Tracks the most recently created invoice hash
let lastCreatedHash = '';

function handleFiberRpc(method: string, params: any): any {
  switch (method) {
    case 'node_info':
      return {
        node_name: 'test-fiber',
        public_key: MOCK_PUBKEY,
        addresses: ['/ip4/127.0.0.1/tcp/8119'],
        chain_hash: '0x10639e',
        open_channel_count: 1,
        pending_channel_count: 0,
        peers_count: 1,
        network_sync_status: 'Synced',
        udt_cfg_infos: {},
      };

    case 'new_invoice': {
      const hash = params[0]?.payment_hash || '0x_default';
      invoices.set(hash, 'Open');
      lastCreatedHash = hash;
      return {
        invoice_address: `fibt1q_hold_${hash.slice(2, 14)}`,
        invoice: {
          currency: params[0]?.currency || 'Fibt',
          amount: params[0]?.amount || '0x5f5e100',
          data: { timestamp: String(Date.now()), payment_hash: hash, attrs: [] },
        },
      };
    }

    case 'send_payment': {
      // When wallet pays, mark the last created invoice as Received
      // In real Fiber, the payment hash from the invoice is used automatically
      if (lastCreatedHash) {
        invoices.set(lastCreatedHash, 'Received');
      }
      return {
        payment_hash: lastCreatedHash || params[0]?.payment_hash || '0x000',
        status: 'Success',
        created_at: String(Date.now()),
        last_updated_at: String(Date.now()),
        fee: '0x186a0',
        routers: [],
      };
    }

    case 'get_invoice': {
      const hash = params[0]?.payment_hash;
      const status = invoices.get(hash) || 'Open';
      return {
        invoice_address: `fibt1q_hold_${hash?.slice(2, 14)}`,
        invoice: {
          currency: 'Fibt',
          amount: '0x5f5e100',
          data: { timestamp: String(Date.now()), payment_hash: hash, attrs: [] },
        },
        status,
      };
    }

    case 'settle_invoice': {
      const hash = params[0]?.payment_hash;
      invoices.set(hash, 'Paid');
      return null;
    }

    case 'get_payment':
      return {
        payment_hash: params[0]?.payment_hash,
        status: 'Success',
        created_at: String(Date.now()),
        last_updated_at: String(Date.now()),
        fee: '0x186a0',
        routers: [],
      };

    case 'list_channels':
      return { channels: [] };

    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════
//  Setup / Teardown
// ═══════════════════════════════════════════════════════════

let providerObj: ServiceProvider;
let providerPort: number;
let providerServer: Server;

beforeAll(async () => {
  // Start mock Fiber node
  fiberServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { method, params, id } = JSON.parse(body);
        const result = handleFiberRpc(method, params);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
      } catch (err: any) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: 0, error: { code: -1, message: err.message } }));
      }
    });
  });

  await new Promise<void>((resolve) => {
    fiberServer.listen(0, () => {
      fiberPort = (fiberServer.address() as any).port;
      resolve();
    });
  });

  // Create Provider with a handle to the shared mock Fiber
  providerObj = new ServiceProvider({
    fiberRpcUrl: `http://127.0.0.1:${fiberPort}`,
    currency: 'Fibt',
    services: [
      {
        name: 'translate',
        description: 'Translate text',
        input_schema: { text: 'string', target: 'string' },
        output_schema: { translated: 'string' },
        pricing: { model: 'per-call', amount: '100000000', asset: 'CKB' },
      },
    ],
  });

  providerObj.onTask('translate', async (input: unknown) => {
    const { text, target } = input as { text: string; target: string };
    return { translated: `[${target}] ${text}` };
  });

  // Start Provider HTTP server (using Provider's internal handlers)
  const http = await import('node:http');
  providerServer = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end();
        return;
      }
      const body = await readBody(req);
      const msg = JSON.parse(body);
      const prov = providerObj as any;

      let response;
      if (req.url === '/agentpay/request') {
        response = await prov.protocol.handleServiceRequest(msg);
      } else if (req.url === '/agentpay/execute') {
        response = await prov.protocol.handleTaskInput(msg);
      } else {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  await new Promise<void>((resolve) => {
    providerServer.listen(0, () => {
      providerPort = (providerServer.address() as any).port;
      resolve();
    });
  });
});

afterAll(() => {
  fiberServer?.close();
  providerServer?.close();
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: any) => { data += chunk; });
    req.on('end', () => resolve(data));
  });
}

// ═══════════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════════

describe('AgentPay End-to-End', () => {
  it('should complete full REQUEST → OFFER → PAY → EXECUTE flow', async () => {
    const wallet = new AgentWallet({
      fiberRpcUrl: `http://127.0.0.1:${fiberPort}`,
      currency: 'Fibt',
    });

    const result = await wallet.payAndCall<{ translated: string }>(
      `http://127.0.0.1:${providerPort}`,
      'translate',
      { text: 'Hello World', target: 'zh' },
      { maxBudget: '1000000000' },
    );

    // Verify output
    expect(result.output).toBeDefined();
    expect(result.output.translated).toContain('Hello World');
    expect(result.output.translated).toContain('zh');

    // Verify payment info
    expect(result.payment_hash).toBeDefined();
    expect(result.payment_hash.startsWith('0x')).toBe(true);
    expect(result.amount).toBe('100000000'); // 1 CKB
    expect(result.asset).toBe('CKB');
    expect(result.execution_time_ms).toBeGreaterThan(0);
    expect(result.provider).toBe(MOCK_PUBKEY);
  });

  it('should reject if budget is too low', async () => {
    const wallet = new AgentWallet({
      fiberRpcUrl: `http://127.0.0.1:${fiberPort}`,
      currency: 'Fibt',
    });

    await expect(
      wallet.payAndCall(
        `http://127.0.0.1:${providerPort}`,
        'translate',
        { text: 'test', target: 'en' },
        { maxBudget: '1' },
      ),
    ).rejects.toThrow(/less than service price|exceeds max budget/);
  });

  it('should get wallet info from Fiber node', async () => {
    const wallet = new AgentWallet({
      fiberRpcUrl: `http://127.0.0.1:${fiberPort}`,
    });
    const info = await wallet.nodeInfo();
    expect(info.public_key).toBe(MOCK_PUBKEY);
    expect(info.open_channel_count).toBe(1);
  });

  it('should get pubkey consistently (cached)', async () => {
    const wallet = new AgentWallet({
      fiberRpcUrl: `http://127.0.0.1:${fiberPort}`,
    });
    const pk1 = await wallet.getPubkey();
    const pk2 = await wallet.getPubkey();
    expect(pk1).toBe(pk2);
    expect(pk1).toBe(MOCK_PUBKEY);
  });

  it('should fail gracefully on unreachable provider', async () => {
    const wallet = new AgentWallet({
      fiberRpcUrl: `http://127.0.0.1:${fiberPort}`,
    });
    await expect(
      wallet.payAndCall('http://127.0.0.1:1', 'translate', { text: 'a', target: 'b' }),
    ).rejects.toThrow();
  });
});

describe('ServiceProvider', () => {
  it('should handle SERVICE_REQUEST and return offer with hold invoice', async () => {
    const prov = providerObj as any;
    const offer = await prov.protocol.handleServiceRequest({
      protocol: 'agentpay/1.0',
      id: 'test-req-1',
      timestamp: Math.floor(Date.now() / 1000),
      from: '0x03bbbb',
      to: MOCK_PUBKEY,
      signature: '',
      type: 'SERVICE_REQUEST',
      payload: {
        service: 'translate',
        budget: { max_amount: '1000000000', asset: 'CKB' },
      },
    });
    expect(offer.type).toBe('SERVICE_OFFER');
    expect(offer.payload.price).toBe('100000000');
    expect(offer.payload.hold_invoice).toContain('fibt1q');
    expect(offer.payload.request_id).toBe('test-req-1');
  });

  it('should reject unknown service', async () => {
    const prov = providerObj as any;
    await expect(
      prov.protocol.handleServiceRequest({
        protocol: 'agentpay/1.0',
        id: 'bad',
        timestamp: Math.floor(Date.now() / 1000),
        from: '0x03bbbb',
        to: MOCK_PUBKEY,
        signature: '',
        type: 'SERVICE_REQUEST',
        payload: { service: 'nonexistent', budget: { max_amount: '1000000000', asset: 'CKB' } },
      }),
    ).rejects.toThrow('not found');
  });
});
