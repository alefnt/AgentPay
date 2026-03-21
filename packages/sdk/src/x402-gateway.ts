/**
 * AgentPay SDK — x402 Gateway Adapter
 *
 * Makes any AgentPay Provider x402-compatible.
 * External Agents see standard HTTP 402 responses; settlement goes through Fiber L2.
 *
 * Supports two x402 schemes:
 *   - "exact": Pay-then-access (standard x402, like Coinbase)
 *   - "hold":  Hold Invoice atomic payment (AgentPay extension, trustless)
 *
 * Also compatible with MPP (Stripe+Paradigm) which is backwards-compatible with x402.
 *
 * Usage:
 * ```ts
 * const provider = new ProviderFacade({ services: [...] });
 * provider.onTask('translate', async (input) => ({ translated: '...' }));
 *
 * // Enable x402 — any GET request to /x402/* returns 402 + Fiber invoice
 * provider.enableX402();
 * provider.listen(3000);
 * ```
 *
 * External Agent flow:
 *   GET /x402/translate              → 402 + payment requirements
 *   GET /x402/translate + X-Payment  → 200 + result
 */

import { randomBytes, createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type {
  FiberRpcClient,
  FiberCurrency,
  ServiceSpec,
  Hash256,
} from '@agentpay-dev/core';

// ╔════════════════════════════════════════════════════════════════╗
//  x402 Types (compatible with Coinbase x402 & MPP spec)
// ╚════════════════════════════════════════════════════════════════╝

/** Payment requirements in a 402 response */
export interface X402PaymentRequirements {
  /** Payment scheme: 'exact' (standard) or 'hold' (AgentPay extension) */
  scheme: 'exact' | 'hold';
  /** Network identifier */
  network: string;
  /** Amount in smallest unit (shannons for CKB) */
  maxAmountRequired: string;
  /** Resource being paid for */
  resource: string;
  /** Description */
  description: string;
  /** Asset type */
  asset: string;
  /** Fiber invoice address (the actual payment instruction) */
  fiberInvoice: string;
  /** Payment hash for verification */
  paymentHash: string;
  /** Expiry timestamp (unix seconds) */
  expiry: number;
  /** x402 version */
  version: '1.0';
}

/** Payment proof sent by x402 client in X-Payment header (JSON, base64-encoded) */
export interface X402PaymentPayload {
  /** Payment hash proving payment was made */
  paymentHash: string;
  /** Signature from payer (optional, for identity) */
  signature?: string;
  /** Payer public key (optional) */
  payerPubkey?: string;
}

// ╔════════════════════════════════════════════════════════════════╗
//  x402 Gateway Config
// ╚════════════════════════════════════════════════════════════════╝

export interface X402GatewayConfig {
  /** Fiber RPC client (shared with ProtocolHandler) */
  fiber: FiberRpcClient;
  /** Currency for invoices */
  currency: FiberCurrency;
  /** Available services */
  services: ServiceSpec[];
  /** Network identifier (default: auto from currency) */
  network?: string;
  /** Invoice expiry in seconds (default: 600 = 10min) */
  invoiceExpiry?: number;
}

// ╔════════════════════════════════════════════════════════════════╗
//  Pending x402 Payment — tracks preimage for settlement
// ╚════════════════════════════════════════════════════════════════╝

interface PendingX402Payment {
  serviceName: string;
  preimage: string;
  paymentHash: string;
  createdAt: number;
  amount: string;
}

// ╔════════════════════════════════════════════════════════════════╗
//  X402Gateway Class
// ╚════════════════════════════════════════════════════════════════╝

export class X402Gateway {
  private readonly fiber: FiberRpcClient;
  private readonly currency: FiberCurrency;
  private readonly services: Map<string, ServiceSpec>;
  private readonly network: string;
  private readonly invoiceExpiry: number;

  /** Pending payments indexed by paymentHash */
  private readonly pending: Map<string, PendingX402Payment> = new Map();

  /** Task handlers — shared reference from ProtocolHandler */
  private handlers: Map<string, (input: unknown) => Promise<unknown>> = new Map();

  constructor(config: X402GatewayConfig) {
    this.fiber = config.fiber;
    this.currency = config.currency;
    this.network = config.network || (config.currency === 'Fibb' ? 'fiber-mainnet' : 'fiber-testnet');
    this.invoiceExpiry = config.invoiceExpiry ?? 600;

    this.services = new Map();
    for (const svc of config.services) {
      this.services.set(svc.name, svc);
    }

    // Cleanup every 5 minutes
    const timer = setInterval(() => this.cleanup(), 5 * 60_000);
    if (timer.unref) timer.unref();
  }

  /** Share handlers with ProtocolHandler */
  setHandlers(handlers: Map<string, (input: unknown) => Promise<unknown>>): void {
    this.handlers = handlers;
  }

  /**
   * Handle a GET request to /x402/{serviceName}.
   *
   * If no X-Payment header → returns 402 with payment requirements
   * If X-Payment header present → verifies payment, executes task, returns result
   */
  async handleRequest(
    serviceName: string,
    req: IncomingMessage,
    queryParams: Record<string, string>,
  ): Promise<{ status: number; headers?: Record<string, string>; body: unknown }> {
    // Find the service
    const service = this.services.get(serviceName);
    if (!service) {
      const available = [...this.services.keys()].join(', ');
      return { status: 404, body: { error: `Service '${serviceName}' not found. Available: ${available}` } };
    }

    // Check for X-Payment header
    const paymentHeader = req.headers['x-payment'] as string | undefined;

    if (!paymentHeader) {
      // No payment → return 402 with requirements
      return this.create402Response(service);
    }

    // Has payment → verify and execute
    return this.verifyAndExecute(service, paymentHeader, queryParams);
  }

  /**
   * Create 402 Payment Required response with Fiber invoice.
   */
  private async create402Response(
    service: ServiceSpec,
  ): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
    // Generate preimage + hash
    const preimage = randomBytes(32).toString('hex');
    const paymentHash = createHash('sha256')
      .update(Buffer.from(preimage, 'hex'))
      .digest('hex');

    // Create Fiber Hold Invoice
    const { invoice_address } = await this.fiber.newInvoice({
      amount: service.pricing.amount,
      currency: this.currency,
      payment_hash: `0x${paymentHash}`,
      description: `x402: ${service.name}`,
      expiry: this.invoiceExpiry,
    });

    // Store pending payment
    this.pending.set(paymentHash, {
      serviceName: service.name,
      preimage,
      paymentHash,
      createdAt: Date.now(),
      amount: service.pricing.amount,
    });

    const requirements: X402PaymentRequirements = {
      scheme: 'exact',
      network: this.network,
      maxAmountRequired: service.pricing.amount,
      resource: `/x402/${service.name}`,
      description: service.description || service.name,
      asset: service.pricing.asset,
      fiberInvoice: invoice_address,
      paymentHash,
      expiry: Math.floor(Date.now() / 1000) + this.invoiceExpiry,
      version: '1.0',
    };

    return {
      status: 402,
      headers: {
        'X-Payment-Required': 'true',
        'X-Payment-Scheme': 'exact',
        'X-Payment-Network': this.network,
        'X-Payment-Amount': service.pricing.amount,
        'X-Payment-Asset': service.pricing.asset,
        'X-Payment-Invoice': invoice_address,
        'X-Payment-Hash': paymentHash,
      },
      body: {
        error: 'Payment Required',
        paymentRequirements: [requirements],
      },
    };
  }

  /**
   * Verify payment and execute task.
   */
  private async verifyAndExecute(
    service: ServiceSpec,
    paymentHeader: string,
    input: Record<string, string>,
  ): Promise<{ status: number; body: unknown }> {
    // Decode X-Payment header (base64-encoded JSON or plain JSON)
    let payload: X402PaymentPayload;
    try {
      const decoded = paymentHeader.startsWith('{')
        ? paymentHeader
        : Buffer.from(paymentHeader, 'base64').toString('utf8');
      payload = JSON.parse(decoded);
    } catch {
      return { status: 400, body: { error: 'Invalid X-Payment header. Expected base64-encoded JSON.' } };
    }

    if (!payload.paymentHash) {
      return { status: 400, body: { error: 'Missing paymentHash in X-Payment' } };
    }

    // Look up pending payment
    const cleanHash = payload.paymentHash.replace(/^0x/, '');
    const pendingPayment = this.pending.get(cleanHash);
    if (!pendingPayment) {
      return { status: 402, body: { error: 'No pending payment found. Invoice may have expired.' } };
    }

    // Verify payment on Fiber
    const prefixedHash = `0x${cleanHash}`;
    try {
      const invoiceStatus = await this.fiber.getInvoice({ payment_hash: prefixedHash });
      if (invoiceStatus.status !== 'Received') {
        return { status: 402, body: { error: `Payment not received. Status: ${invoiceStatus.status}` } };
      }
    } catch (err: any) {
      return { status: 502, body: { error: `Failed to verify payment: ${err.message}` } };
    }

    // Execute task
    const handler = this.handlers.get(service.name);
    if (!handler) {
      return { status: 503, body: { error: `No handler registered for '${service.name}'` } };
    }

    let output: unknown;
    try {
      output = await handler(input);
    } catch (err: any) {
      // Task failed — cancel invoice, don't charge
      try { await this.fiber.cancelInvoice({ payment_hash: prefixedHash }); } catch { /* best effort */ }
      this.pending.delete(cleanHash);
      return { status: 500, body: { error: `Task execution failed: ${err.message}` } };
    }

    // Settle — reveal preimage to collect payment
    try {
      await this.fiber.settleInvoice({
        payment_hash: prefixedHash,
        payment_preimage: `0x${pendingPayment.preimage}`,
      });
    } catch (err: any) {
      return { status: 502, body: { error: `Settlement failed: ${err.message}` } };
    }

    // Cleanup
    this.pending.delete(cleanHash);

    return {
      status: 200,
      body: {
        output,
        settled: true,
        paymentHash: cleanHash,
        amount: pendingPayment.amount,
        asset: service.pricing.asset,
        network: this.network,
      },
    };
  }

  /** Get available service names for health/discovery */
  getServiceList(): Array<{ name: string; price: string; asset: string; description: string }> {
    return [...this.services.values()].map(s => ({
      name: s.name,
      price: s.pricing.amount,
      asset: s.pricing.asset,
      description: s.description || s.name,
    }));
  }

  /** Cleanup expired pending payments */
  cleanup(): number {
    const cutoff = Date.now() - (this.invoiceExpiry + 300) * 1000; // expiry + 5min buffer
    let count = 0;
    for (const [hash, p] of this.pending) {
      if (p.createdAt < cutoff) {
        this.pending.delete(hash);
        count++;
      }
    }
    return count;
  }
}
