/**
 * AgentPay x402 Facilitator — CKB Fiber as x402 Settlement Layer
 *
 * x402 协议的核心设计是 Facilitator 可插拔：
 *   - Coinbase 默认用 Base (EVM L2) 结算
 *   - 我们用 CKB Fiber Network 作为结算层
 *   - 结果: 更快 (毫秒 vs 2秒)，更便宜 (~0 vs $0.0001)
 *
 * 架构:
 *   x402 Client (ETH Agent)
 *       ↓ HTTP 402
 *   x402 Server (任何 HTTP 服务)
 *       ↓ verify / settle
 *   AgentPay Facilitator (本服务)
 *       ↓ Fiber RPC
 *   CKB Fiber Network (结算层)
 *
 * 使用方式 1: 独立服务
 *   FIBER_RPC_URL=http://127.0.0.1:8227 npx tsx src/server.ts
 *
 * 使用方式 2: 中间件 (集成到任何 HTTP 服务)
 *   import { createX402Middleware } from '@agentpay/x402-facilitator';
 *   app.use('/paid-api', createX402Middleware({ price: '100000000' }));
 *
 * 为什么 CKB/Fiber 可以做 x402 结算层:
 *   1. x402 规范支持自定义 scheme + network
 *   2. Facilitator 只需要实现 verify + settle 接口
 *   3. Fiber 的 Hold Invoice 比 EVM approve+transfer 更安全
 *   4. Fiber 结算速度: 毫秒 vs Base L2 的 2 秒
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { FiberRpcClient, resolveAssetScript, type AssetType, type Hash256, type FiberCurrency } from '@agentpay/core';

// ═══════════════════════════════════════════════════════════
//  x402 Types (compatible with Coinbase x402 spec)
// ═══════════════════════════════════════════════════════════

/**
 * Payment requirements sent in HTTP 402 response.
 * The key difference from Coinbase's x402: we use Fiber invoices.
 */
export interface PaymentRequirements {
  scheme: 'exact';
  network: 'ckb-fiber' | 'ckb-fiber-udt';
  maxAmountRequired: string;
  asset: AssetType;
  resource: string;
  description?: string;
  /** Fiber-specific: pre-generated invoice for immediate payment */
  extra: {
    fiberInvoice: string;
    paymentHash: string;
    facilitatorUrl: string;
    expiresAt: number;
  };
}

/**
 * Payment payload sent by x402 client after paying.
 */
export interface PaymentPayload {
  scheme: 'exact';
  network: 'ckb-fiber' | 'ckb-fiber-udt';
  paymentHash: string;
  amount: string;
  asset: AssetType;
  payer: string;          // Fiber node pubkey of payer
  signature: string;
  timestamp: number;
}

export interface VerifyResult {
  isValid: boolean;
  invalidReason?: string;
}

export interface SettleResult {
  success: boolean;
  txHash?: string;
  networkFee?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════
//  Facilitator Core
// ═══════════════════════════════════════════════════════════

export class X402Facilitator {
  private fiber: FiberRpcClient;
  private currency: FiberCurrency;

  constructor(config?: { fiberRpcUrl?: string; currency?: FiberCurrency }) {
    this.fiber = new FiberRpcClient({
      rpcUrl: config?.fiberRpcUrl || process.env.FIBER_RPC_URL || 'http://127.0.0.1:8227',
    });
    this.currency = config?.currency || 'Fibt';
  }

  /**
   * Create payment requirements for an HTTP 402 response.
   * This generates a Fiber invoice that the x402 client can pay.
   */
  async createPaymentRequirements(
    resource: string,
    amount: string,
    asset: AssetType = 'CKB',
    description?: string,
  ): Promise<PaymentRequirements> {
    const udtScript = asset !== 'CKB' ? resolveAssetScript(asset) : undefined;

    const { invoice_address, invoice } = await this.fiber.newInvoice({
      amount,
      currency: this.currency,
      description: description || `x402 payment for ${resource}`,
      expiry: 600,
      ...(udtScript ? { udt_type_script: udtScript } : {}),
    });

    return {
      scheme: 'exact',
      network: asset === 'CKB' ? 'ckb-fiber' : 'ckb-fiber-udt',
      maxAmountRequired: amount,
      asset,
      resource,
      description,
      extra: {
        fiberInvoice: invoice_address,
        paymentHash: invoice.data.payment_hash,
        facilitatorUrl: process.env.FACILITATOR_URL || 'http://localhost:4020',
        expiresAt: Date.now() + 600_000,
      },
    };
  }

  /**
   * Verify a payment payload from x402 client.
   */
  async verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResult> {
    // 1. Scheme check
    if (payload.scheme !== 'exact') {
      return { isValid: false, invalidReason: `Unsupported scheme: ${payload.scheme}` };
    }
    if (!payload.network.startsWith('ckb-fiber')) {
      return { isValid: false, invalidReason: `Unsupported network: ${payload.network}` };
    }

    // 2. Amount check
    if (BigInt(payload.amount) < BigInt(requirements.maxAmountRequired)) {
      return { isValid: false, invalidReason: `Insufficient amount: ${payload.amount} < ${requirements.maxAmountRequired}` };
    }

    // 3. Timestamp check (not older than 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (now - payload.timestamp > 300) {
      return { isValid: false, invalidReason: 'Payment expired (>5 min old)' };
    }

    // 4. Verify on Fiber
    try {
      const invoiceStatus = await this.fiber.getInvoice({
        payment_hash: payload.paymentHash.startsWith('0x') ? payload.paymentHash : `0x${payload.paymentHash}`,
      });

      if (invoiceStatus.status === 'Received' || invoiceStatus.status === 'Paid') {
        return { isValid: true };
      }

      // If invoice is Open, payment hasn't arrived yet
      if (invoiceStatus.status === 'Open') {
        // Check if payment is in-flight
        try {
          const payment = await this.fiber.getPayment({
            payment_hash: payload.paymentHash.startsWith('0x') ? payload.paymentHash : `0x${payload.paymentHash}`,
          });
          if (payment.status === 'Success' || payment.status === 'Sending') {
            return { isValid: true };
          }
        } catch {
          // Payment not found
        }
        return { isValid: false, invalidReason: 'Payment not received by Fiber node' };
      }

      return { isValid: false, invalidReason: `Invoice status: ${invoiceStatus.status}` };
    } catch (err: any) {
      return { isValid: false, invalidReason: `Fiber verification failed: ${err.message}` };
    }
  }

  /**
   * Settle a verified payment on Fiber.
   */
  async settle(payload: PaymentPayload): Promise<SettleResult> {
    try {
      const payment = await this.fiber.getPayment({
        payment_hash: payload.paymentHash.startsWith('0x') ? payload.paymentHash : `0x${payload.paymentHash}`,
      });

      if (payment.status === 'Success') {
        return {
          success: true,
          txHash: payload.paymentHash,
          networkFee: payment.fee,
        };
      }

      if (payment.status === 'Failed') {
        return { success: false, error: `Payment failed: ${payment.failed_error || 'Unknown'}` };
      }

      return { success: false, error: `Payment still in progress: ${payment.status}` };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  x402 HTTP Middleware
//
//  让任何 HTTP 服务一行代码加入 x402 付费墙:
//
//  import { createX402Middleware } from '@agentpay/x402-facilitator';
//
//  // 保护你的 API
//  const paywall = createX402Middleware({
//    price: '100000000',  // 1 CKB per request
//    asset: 'CKB',
//  });
//
//  http.createServer((req, res) => {
//    paywall(req, res, () => {
//      // 只有付费后才会执行到这里
//      res.end(JSON.stringify({ data: 'premium content' }));
//    });
//  });
// ═══════════════════════════════════════════════════════════

export interface MiddlewareConfig {
  /** Price per request in shannons (CKB) or smallest unit */
  price: string;
  /** Asset type (default: CKB) */
  asset?: AssetType;
  /** Facilitator instance (will create default if not provided) */
  facilitator?: X402Facilitator;
  /** Description shown to payer */
  description?: string;
}

type NextFn = () => void;

/**
 * Create an x402 paywall middleware.
 *
 * Workflow:
 * 1. Client requests resource without payment → 402 + Fiber invoice
 * 2. Client pays Fiber invoice
 * 3. Client retries request with X-PAYMENT header
 * 4. Middleware verifies payment on Fiber → grants access
 */
export function createX402Middleware(config: MiddlewareConfig) {
  const facilitator = config.facilitator || new X402Facilitator();
  const asset = config.asset || 'CKB';

  return async (req: IncomingMessage, res: ServerResponse, next: NextFn) => {
    // Check for payment header
    const paymentHeader = req.headers['x-payment'] as string | undefined;

    if (!paymentHeader) {
      // No payment — return 402 with Fiber invoice
      const resource = `${req.headers.host}${req.url}`;
      const requirements = await facilitator.createPaymentRequirements(
        resource, config.price, asset, config.description,
      );

      res.writeHead(402, {
        'Content-Type': 'application/json',
        'X-Payment-Required': 'true',
        'X-Payment-Scheme': 'exact',
        'X-Payment-Network': requirements.network,
        'X-Payment-Amount': config.price,
        'X-Payment-Asset': asset,
        'X-Payment-Invoice': requirements.extra.fiberInvoice,
      });
      res.end(JSON.stringify({
        error: 'Payment Required',
        message: 'Pay the Fiber invoice to access this resource',
        paymentRequirements: requirements,
      }));
      return;
    }

    // Has payment header — verify
    try {
      const payload: PaymentPayload = JSON.parse(
        Buffer.from(paymentHeader, 'base64').toString(),
      );

      const requirements: PaymentRequirements = {
        scheme: 'exact',
        network: asset === 'CKB' ? 'ckb-fiber' : 'ckb-fiber-udt',
        maxAmountRequired: config.price,
        asset,
        resource: `${req.headers.host}${req.url}`,
        extra: {
          fiberInvoice: '',
          paymentHash: payload.paymentHash,
          facilitatorUrl: '',
          expiresAt: 0,
        },
      };

      const result = await facilitator.verify(payload, requirements);

      if (!result.isValid) {
        res.writeHead(402, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payment invalid', reason: result.invalidReason }));
        return;
      }

      // Payment valid — grant access
      // Add payment info to request for downstream use
      (req as any).x402Payment = {
        paymentHash: payload.paymentHash,
        amount: payload.amount,
        asset: payload.asset,
        payer: payload.payer,
      };

      next();
    } catch (err: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid payment header', details: err.message }));
    }
  };
}

// ═══════════════════════════════════════════════════════════
//  Standalone Server
// ═══════════════════════════════════════════════════════════

export function startFacilitatorServer(port: number = 4020): void {
  const facilitator = new X402Facilitator();

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
      const url = req.url;

      if (url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', settlement: 'ckb-fiber' }));
        return;
      }

      if (url === '/x402/schemes') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          facilitator: 'agentpay',
          settlementLayer: 'CKB Fiber Network',
          advantage: 'Millisecond settlement, near-zero fees, Hold Invoice trustless escrow',
          schemes: [
            { scheme: 'exact', network: 'ckb-fiber', assets: ['CKB'], description: 'Native CKB via Fiber' },
            { scheme: 'exact', network: 'ckb-fiber-udt', assets: ['USDT', 'USDC', 'USDI', 'WBTC'], description: 'UDT tokens via Fiber' },
          ],
        }));
        return;
      }

      if (req.method === 'POST' && url === '/x402/create-requirements') {
        const body = JSON.parse(await readBody(req));
        const requirements = await facilitator.createPaymentRequirements(
          body.resource, body.amount, body.asset, body.description,
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(requirements));
        return;
      }

      if (req.method === 'POST' && url === '/x402/verify') {
        const body = JSON.parse(await readBody(req));
        const result = await facilitator.verify(body.paymentPayload, body.paymentRequirements);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      if (req.method === 'POST' && url === '/x402/settle') {
        const body = JSON.parse(await readBody(req));
        const result = await facilitator.settle(body.paymentPayload);
        res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  server.listen(port, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║  x402 Facilitator — CKB/Fiber Settlement Layer   ║
║                                                  ║
║  Port: ${port}                                    ║
║  Settlement: CKB Fiber Network                   ║
║                                                  ║
║  vs Base L2:  ⚡ 毫秒结算 (vs 2秒)               ║
║               💰 ~$0 费用 (vs $0.0001)            ║
║               🔒 Hold Invoice (vs approve+tx)     ║
║                                                  ║
║  POST /x402/create-requirements                  ║
║  POST /x402/verify                               ║
║  POST /x402/settle                               ║
║  GET  /x402/schemes                              ║
╚══════════════════════════════════════════════════╝
    `);
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: any) => { data += chunk; });
    req.on('end', () => resolve(data));
  });
}

// ─── Main ─────────────────────────────────────────────────

if (process.argv[1]?.includes('server') || process.argv[1]?.includes('index')) {
  startFacilitatorServer(parseInt(process.env.PORT || '4020'));
}
