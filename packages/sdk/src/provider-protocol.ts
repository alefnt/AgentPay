/**
 * AgentPay SDK — Provider Protocol Layer
 *
 * Handles AgentPay protocol logic: SERVICE_REQUEST → SERVICE_OFFER → TASK_INPUT → TASK_RESULT.
 * Pure protocol logic, no HTTP concerns.
 *
 * This is the middle layer of the refactored ServiceProvider.
 */

import { createHash, randomBytes } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { FiberRpcClient } from '@agentpay-dev/core';
import type {
  Pubkey,
  ServiceSpec,
  ProtocolMessage,
  ServiceRequestPayload,
  ServiceOfferPayload,
  TaskInputPayload,
  TaskResultPayload,
  FiberCurrency,
} from '@agentpay-dev/core';

// ╔════════════════════════════════════════════════════════════════╗
//  Types
// ╚════════════════════════════════════════════════════════════════╝

/** Function that processes a task and returns output */
export type TaskHandler = (input: unknown) => Promise<unknown>;

/** Pending offer state */
interface PendingOffer {
  offerId: string;
  serviceName: string;
  preimage: string;
  paymentHash: string;
  createdAt: number;
}

// ╔════════════════════════════════════════════════════════════════╗
//  ProtocolHandler Class
// ╚════════════════════════════════════════════════════════════════╝

export class ProtocolHandler {
  private readonly fiber: FiberRpcClient;
  private readonly services: ServiceSpec[];
  private readonly currency: FiberCurrency;
  private readonly handlers: Map<string, TaskHandler> = new Map();
  private readonly pendingOffers: Map<string, PendingOffer> = new Map();
  private _pubkey?: Pubkey;

  constructor(config: {
    fiber: FiberRpcClient;
    services: ServiceSpec[];
    currency?: FiberCurrency;
  }) {
    this.fiber = config.fiber;
    this.services = config.services;
    this.currency = config.currency || (process.env.FIBER_NETWORK === 'mainnet' ? 'Fibb' : 'Fibt');
  }

  /** Register a task handler for a service */
  registerHandler(serviceName: string, handler: TaskHandler): void {
    const svc = this.services.find(s => s.name === serviceName);
    if (!svc) {
      throw new Error(`Cannot register handler for unknown service '${serviceName}'. Registered services: ${this.services.map(s => s.name).join(', ')}`);
    }
    this.handlers.set(serviceName, handler);
  }

  /** Check if all services have handlers registered */
  hasAllHandlers(): boolean {
    return this.services.every(s => this.handlers.has(s.name));
  }

  /** Get the list of registered services */
  getServices(): ServiceSpec[] {
    return this.services;
  }

  /** Get the handlers map (shared with x402 gateway) */
  getHandlers(): Map<string, TaskHandler> {
    return this.handlers;
  }

  // ────────────────────────────────────────────────────────
  //  SERVICE_REQUEST → SERVICE_OFFER
  // ────────────────────────────────────────────────────────

  async handleServiceRequest(
    msg: ProtocolMessage<ServiceRequestPayload>,
  ): Promise<ProtocolMessage<ServiceOfferPayload>> {
    if (!msg.payload?.service) {
      throw new Error('Missing service name in REQUEST payload');
    }

    const service = this.services.find(s => s.name === msg.payload.service);
    if (!service) {
      throw new Error(
        `Service '${msg.payload.service}' not found. Available: ${this.services.map(s => s.name).join(', ')}`,
      );
    }

    // Check budget
    const budget = msg.payload.budget?.max_amount;
    if (budget && BigInt(budget) < BigInt(service.pricing.amount)) {
      throw new Error(`Budget ${budget} is less than service price ${service.pricing.amount}`);
    }

    // Generate preimage and payment hash
    const preimage = randomBytes(32).toString('hex');
    const paymentHash = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');

    // Create Hold Invoice on Fiber
    const { invoice_address } = await this.fiber.newInvoice({
      amount: service.pricing.amount,
      currency: this.currency,
      payment_hash: `0x${paymentHash}`,
      description: `AgentPay: ${service.name}`,
      expiry: 600,
    });

    // Store pending offer
    const offerId = randomUUID();
    this.pendingOffers.set(paymentHash, {
      offerId,
      serviceName: service.name,
      preimage,
      paymentHash,
      createdAt: Date.now(),
    });

    const pubkey = await this.getPubkey();

    return {
      protocol: 'agentpay/1.0',
      id: offerId,
      timestamp: Math.floor(Date.now() / 1000),
      from: pubkey,
      to: msg.from,
      signature: '',
      type: 'SERVICE_OFFER',
      payload: {
        request_id: msg.id,
        price: service.pricing.amount,
        asset: service.pricing.asset,
        hold_invoice: invoice_address,
        estimated_time_ms: service.sla?.max_latency_ms || 5000,
        offer_ttl_seconds: 60,
      },
    };
  }

  // ────────────────────────────────────────────────────────
  //  TASK_INPUT → TASK_RESULT
  // ────────────────────────────────────────────────────────

  async handleTaskInput(
    msg: ProtocolMessage<TaskInputPayload>,
  ): Promise<ProtocolMessage<TaskResultPayload>> {
    const { payment_hash, input } = msg.payload;

    if (!payment_hash || !input) {
      throw new Error('Missing payment_hash or input in TASK_INPUT');
    }

    const cleanHash = payment_hash.replace(/^0x/, '');
    const pending = this.pendingOffers.get(cleanHash);
    if (!pending) {
      throw new Error(`No pending offer found for payment_hash: ${cleanHash}`);
    }

    // Verify payment is locked
    const prefixedHash = payment_hash.startsWith('0x') ? payment_hash : `0x${payment_hash}`;
    const paymentStatus = await this.fiber.getInvoice({ payment_hash: prefixedHash });
    if (paymentStatus.status !== 'Received') {
      throw new Error(`Payment not received. Status: ${paymentStatus.status}`);
    }

    // Route to handler
    const handler = this.handlers.get(pending.serviceName);
    if (!handler) {
      throw new Error(`No handler for service '${pending.serviceName}'`);
    }

    // Execute
    const startTime = Date.now();
    let output: unknown;
    try {
      output = await handler(input);
    } catch (err: any) {
      // Cancel invoice on failure
      try {
        await this.fiber.cancelInvoice({ payment_hash: prefixedHash });
      } catch { /* best effort */ }
      this.pendingOffers.delete(cleanHash);
      throw new Error(`Task execution failed: ${err.message}`);
    }
    const executionTimeMs = Date.now() - startTime;

    // Settle — reveal preimage to Fiber to release locked funds
    await this.fiber.settleInvoice({
      payment_hash: prefixedHash,
      payment_preimage: `0x${pending.preimage}`,
    });

    this.pendingOffers.delete(cleanHash);

    const proofHash = createHash('sha256').update(JSON.stringify(output)).digest('hex');
    const pubkey = await this.getPubkey();

    return {
      protocol: 'agentpay/1.0',
      id: randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
      from: pubkey,
      to: msg.from,
      signature: '',
      type: 'TASK_RESULT',
      payload: {
        output,
        settled: true,
        payment_hash: prefixedHash,
        execution_time_ms: executionTimeMs,
        proof_hash: proofHash,
      },
    };
  }

  // ────────────────────────────────────────────────────────
  //  Maintenance
  // ────────────────────────────────────────────────────────

  /** Clean up expired offers (> 15 min) */
  cleanupExpiredOffers(): number {
    const cutoff = Date.now() - 15 * 60 * 1000;
    const expired: string[] = [];
    for (const [hash, offer] of this.pendingOffers) {
      if (offer.createdAt < cutoff) expired.push(hash);
    }
    for (const hash of expired) this.pendingOffers.delete(hash);
    return expired.length;
  }

  /** Get pubkey (cached) */
  async getPubkey(): Promise<Pubkey> {
    if (!this._pubkey) {
      const info = await this.fiber.nodeInfo();
      this._pubkey = info.node_id || info.public_key || '';
    }
    return this._pubkey;
  }
}
