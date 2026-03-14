/**
 * x402 Facilitator Unit Tests
 *
 * Tests payment verification logic, middleware behavior, and settlement.
 * Uses a mock Fiber RPC server for middleware tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { X402Facilitator, createX402Middleware } from '../src/index.js';
import { createServer, type Server } from 'node:http';
import type { PaymentPayload, PaymentRequirements } from '../src/index.js';

// ═══════════════════════════════════════════════════════════
//  Mock Fiber RPC for middleware tests
// ═══════════════════════════════════════════════════════════

let mockFiber: Server;
let mockFiberPort: number;

beforeAll(async () => {
  mockFiber = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { method, id } = JSON.parse(body);
      let result: any = null;

      if (method === 'new_invoice') {
        result = {
          invoice_address: 'fibt1q_test_invoice',
          invoice: {
            currency: 'Fibt',
            amount: '0x5f5e100',
            data: { timestamp: String(Date.now()), payment_hash: '0xdeadbeef', attrs: [] },
          },
        };
      } else if (method === 'get_invoice') {
        result = { invoice_address: 'fibt1q_test', invoice: {}, status: 'Open' };
      } else if (method === 'get_payment') {
        result = { payment_hash: '0xdeadbeef', status: 'Success', fee: '0x0', routers: [] };
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    });
  });

  await new Promise<void>((resolve) => {
    mockFiber.listen(0, () => {
      mockFiberPort = (mockFiber.address() as any).port;
      resolve();
    });
  });
});

afterAll(() => { mockFiber?.close(); });

// ═══════════════════════════════════════════════════════════
//  Verify Logic Tests (no Fiber needed)
// ═══════════════════════════════════════════════════════════

describe('X402Facilitator Verify', () => {
  const facilitator = new X402Facilitator({ fiberRpcUrl: 'http://127.0.0.1:1' });

  const validPayload: PaymentPayload = {
    scheme: 'exact',
    network: 'ckb-fiber',
    paymentHash: '0xaabb',
    amount: '200000000',
    asset: 'CKB',
    payer: '0x02caller',
    signature: 'sig',
    timestamp: Math.floor(Date.now() / 1000),
  };

  const requirements: PaymentRequirements = {
    scheme: 'exact',
    network: 'ckb-fiber',
    maxAmountRequired: '100000000',
    asset: 'CKB',
    resource: 'http://example.com/api',
    extra: {
      fiberInvoice: 'fibt1q_test',
      paymentHash: '0xaabb',
      facilitatorUrl: '',
      expiresAt: Date.now() + 600_000,
    },
  };

  it('should reject unsupported scheme', async () => {
    const result = await facilitator.verify({ ...validPayload, scheme: 'other' as any }, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toContain('Unsupported scheme');
  });

  it('should reject unsupported network', async () => {
    const result = await facilitator.verify({ ...validPayload, network: 'eth-mainnet' as any }, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toContain('Unsupported network');
  });

  it('should reject insufficient amount', async () => {
    const result = await facilitator.verify({ ...validPayload, amount: '50000000' }, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toContain('Insufficient');
  });

  it('should reject expired payment', async () => {
    const result = await facilitator.verify(
      { ...validPayload, timestamp: Math.floor(Date.now() / 1000) - 400 }, requirements,
    );
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toContain('expired');
  });

  it('should fail gracefully when Fiber is unreachable', async () => {
    const result = await facilitator.verify(validPayload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toContain('failed');
  });
});

// ═══════════════════════════════════════════════════════════
//  Middleware Tests (uses mock Fiber)
// ═══════════════════════════════════════════════════════════

describe('x402 Middleware', () => {
  it('should be a function', () => {
    const mw = createX402Middleware({ price: '100000000' });
    expect(typeof mw).toBe('function');
  });

  it('should return 402 with payment requirements when no header', async () => {
    const facilitator = new X402Facilitator({ fiberRpcUrl: `http://127.0.0.1:${mockFiberPort}` });
    const mw = createX402Middleware({ price: '100000000', asset: 'CKB', facilitator });

    const server = createServer(async (req, res) => {
      await mw(req, res, () => {
        res.writeHead(200);
        res.end(JSON.stringify({ data: 'protected' }));
      });
    });

    const port = await new Promise<number>((resolve) => {
      server.listen(0, () => resolve((server.address() as any).port));
    });

    try {
      const res = await fetch(`http://localhost:${port}/test`);
      expect(res.status).toBe(402);
      const body = await res.json() as any;
      expect(body.paymentRequirements).toBeDefined();
      expect(body.paymentRequirements.scheme).toBe('exact');
      expect(body.paymentRequirements.network).toBe('ckb-fiber');
      expect(body.paymentRequirements.extra.fiberInvoice).toBe('fibt1q_test_invoice');
    } finally {
      server.close();
    }
  });

  it('should return 400 for invalid payment header', async () => {
    const facilitator = new X402Facilitator({ fiberRpcUrl: `http://127.0.0.1:${mockFiberPort}` });
    const mw = createX402Middleware({ price: '100000000', facilitator });

    const server = createServer(async (req, res) => {
      await mw(req, res, () => { res.writeHead(200); res.end('ok'); });
    });

    const port = await new Promise<number>((resolve) => {
      server.listen(0, () => resolve((server.address() as any).port));
    });

    try {
      const res = await fetch(`http://localhost:${port}/test`, {
        headers: { 'X-Payment': 'invalid-base64!!!' },
      });
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.error).toContain('Invalid payment header');
    } finally {
      server.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════
//  Settle Tests
// ═══════════════════════════════════════════════════════════

describe('X402Facilitator Settle', () => {
  it('should succeed when Fiber payment is confirmed', async () => {
    const facilitator = new X402Facilitator({ fiberRpcUrl: `http://127.0.0.1:${mockFiberPort}` });
    const result = await facilitator.settle({
      scheme: 'exact',
      network: 'ckb-fiber',
      paymentHash: '0xaabb',
      amount: '100000000',
      asset: 'CKB',
      payer: '0x02test',
      signature: 'sig',
      timestamp: Math.floor(Date.now() / 1000),
    });
    expect(result.success).toBe(true);
  });

  it('should fail gracefully when Fiber is unreachable', async () => {
    const facilitator = new X402Facilitator({ fiberRpcUrl: 'http://127.0.0.1:1' });
    const result = await facilitator.settle({
      scheme: 'exact',
      network: 'ckb-fiber',
      paymentHash: '0xaabb',
      amount: '100000000',
      asset: 'CKB',
      payer: '0x02test',
      signature: 'sig',
      timestamp: Math.floor(Date.now() / 1000),
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
