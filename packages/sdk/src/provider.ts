/**
 * AgentPay SDK — Service Provider
 *
 * Production-hardened HTTP server for receiving paid service requests.
 * Uses Fiber Hold Invoice for trustless payment guarantee.
 *
 * Security features:
 * - Request body size limit (1MB default)
 * - JSON parse error handling
 * - CORS headers
 * - Service-specific handler routing (critical fix)
 * - Input validation
 * - Graceful error responses (no stack traces leaked)
 * - Preimage cleanup after use
 *
 * ```ts
 * import { ServiceProvider } from '@agentpay/sdk';
 *
 * const provider = new ServiceProvider({
 *   services: [{
 *     name: 'translate',
 *     description: 'Translate text',
 *     pricing: { model: 'per-call', amount: '1000000000', asset: 'CKB' },
 *     input_schema: { text: 'string', target: 'string' },
 *     output_schema: { translated: 'string' },
 *   }],
 * });
 *
 * provider.onTask('translate', async (input) => {
 *   return { translated: `[translated] ${input.text}` };
 * });
 *
 * provider.listen(3000);
 * ```
 */

import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  FiberRpcClient,
  createLogger,
  type Pubkey,
  type Hash256,
  type FiberCurrency,
  type ProtocolMessage,
  type ServiceRequestPayload,
  type ServiceOfferPayload,
  type TaskInputPayload,
  type TaskResultPayload,
  type ServiceSpec,
} from '@agentpay/core';

const log = createLogger({ name: 'provider', version: '0.1.0' });

// ═══════════════════════════════════════════════════════════
//  Config
// ═══════════════════════════════════════════════════════════

export interface ProviderConfig {
  fiberRpcUrl?: string;
  currency?: FiberCurrency;
  services: ServiceSpec[];
  /** Max request body size in bytes (default: 1MB) */
  maxBodySize?: number;
  /** Enable CORS (default: true) */
  cors?: boolean;
}

// ═══════════════════════════════════════════════════════════
//  Task Handler Type
// ═══════════════════════════════════════════════════════════

export type TaskHandler = (input: unknown) => Promise<unknown>;

// ═══════════════════════════════════════════════════════════
//  Pending Offer — tracks which service a specific offer is for
// ═══════════════════════════════════════════════════════════

interface PendingOffer {
  offerId: string;
  serviceName: string;
  preimage: string;
  paymentHash: string;
  createdAt: number;
}

// ═══════════════════════════════════════════════════════════
//  Service Provider
// ═══════════════════════════════════════════════════════════

export class ServiceProvider {
  private fiber: FiberRpcClient;
  private currency: FiberCurrency;
  private services: ServiceSpec[];
  private handlers: Map<string, TaskHandler> = new Map();
  private maxBodySize: number;
  private enableCors: boolean;

  /** Pending offers indexed by payment_hash — tracks service + preimage */
  private pendingOffers: Map<string, PendingOffer> = new Map();

  private _pubkey?: Pubkey;

  constructor(config: ProviderConfig) {
    if (!config.services || config.services.length === 0) {
      throw new Error('ServiceProvider requires at least one service');
    }
    this.fiber = new FiberRpcClient({
      rpcUrl: config.fiberRpcUrl || 'http://127.0.0.1:8227',
    });
    this.currency = config.currency || 'Fibt';
    this.services = config.services;
    this.maxBodySize = config.maxBodySize || 1_048_576; // 1MB
    this.enableCors = config.cors !== false;

    // Cleanup expired offers every 5 minutes
    setInterval(() => this.cleanupExpiredOffers(), 5 * 60 * 1000);
  }

  /**
   * Register a handler for a specific service.
   * The handler receives input and must return output.
   */
  onTask(serviceName: string, handler: TaskHandler): this {
    const service = this.services.find(s => s.name === serviceName);
    if (!service) {
      throw new Error(`Cannot register handler for unknown service '${serviceName}'. Registered services: ${this.services.map(s => s.name).join(', ')}`);
    }
    this.handlers.set(serviceName, handler);
    return this;
  }

  /**
   * Start the HTTP server.
   */
  listen(port: number, hostname = '0.0.0.0'): void {
    // Validate all services have handlers
    for (const svc of this.services) {
      if (!this.handlers.has(svc.name)) {
        console.warn(`[AgentPay Provider] WARNING: No handler registered for service '${svc.name}'`);
      }
    }

    const server = createServer((req, res) => {
      this.handleHttp(req, res).catch((err) => {
        console.error('[AgentPay Provider] Unhandled error:', err.message);
        this.sendError(res, 500, 'Internal server error');
      });
    });

    server.listen(port, hostname, () => {
      console.log(`[AgentPay Provider] Listening on ${hostname}:${port}`);
      console.log(`[AgentPay Provider] Services: ${this.services.map((s) => `${s.name} (${s.pricing.amount} ${s.pricing.asset})`).join(', ')}`);
    });
  }

  // ─────────────────────────────────────────────────────────
  //  HTTP Request Handling
  // ─────────────────────────────────────────────────────────

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS
    if (this.enableCors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    // Health check
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        services: this.services.map(s => ({
          name: s.name,
          pricing: s.pricing,
          hasHandler: this.handlers.has(s.name),
        })),
      }));
      return;
    }

    if (req.method !== 'POST') {
      return this.sendError(res, 405, 'Method not allowed. Use POST.');
    }

    // Read body with size limit
    let body: string;
    try {
      body = await this.readBody(req, this.maxBodySize);
    } catch (err: any) {
      return this.sendError(res, 413, err.message);
    }

    // Parse JSON
    let msg: ProtocolMessage;
    try {
      msg = JSON.parse(body) as ProtocolMessage;
    } catch {
      return this.sendError(res, 400, 'Invalid JSON body');
    }

    // Validate protocol
    if (!msg.protocol || !msg.type) {
      return this.sendError(res, 400, 'Missing protocol or type field');
    }

    // Route
    try {
      let response: ProtocolMessage;

      switch (req.url) {
        case '/agentpay/request':
          response = await this.handleServiceRequest(msg as ProtocolMessage<ServiceRequestPayload>);
          break;
        case '/agentpay/execute':
          response = await this.handleTaskInput(msg as ProtocolMessage<TaskInputPayload>);
          break;
        default:
          return this.sendError(res, 404, 'Not found. Endpoints: /agentpay/request, /agentpay/execute, /health');
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (err: any) {
      console.error(`[AgentPay Provider] ${req.url} error:`, err.message);
      return this.sendError(res, 502, err.message);
    }
  }

  // ─────────────────────────────────────────────────────────
  //  Protocol Message Handlers
  // ─────────────────────────────────────────────────────────

  /**
   * Handle SERVICE_REQUEST:
   * 1. Find matching service by name
   * 2. Generate preimage + hash
   * 3. Create Hold Invoice (hash only, no preimage)
   * 4. Store pending offer (maps payment_hash → service + preimage)
   * 5. Return SERVICE_OFFER with Hold Invoice
   */
  private async handleServiceRequest(
    msg: ProtocolMessage<ServiceRequestPayload>,
  ): Promise<ProtocolMessage<ServiceOfferPayload>> {
    // Validate
    if (!msg.payload?.service) {
      throw new Error('Missing service name in REQUEST payload');
    }

    const service = this.services.find((s) => s.name === msg.payload.service);
    if (!service) {
      throw new Error(`Service '${msg.payload.service}' not found. Available: ${this.services.map(s => s.name).join(', ')}`);
    }

    if (!this.handlers.has(service.name)) {
      throw new Error(`Service '${service.name}' has no handler registered`);
    }

    // Generate HTLC preimage and hash
    const preimage = randomBytes(32).toString('hex');
    const paymentHash = createHash('sha256')
      .update(Buffer.from(preimage, 'hex'))
      .digest('hex');

    // Create Hold Invoice on Fiber
    const { invoice_address } = await this.fiber.newInvoice({
      amount: service.pricing.amount,
      currency: this.currency,
      payment_hash: `0x${paymentHash}`,
      description: `AgentPay: ${service.name}`,
      expiry: 600,  // 10 minutes
    });

    // Store pending offer — maps payment_hash to service name + preimage
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

  /**
   * Handle TASK_INPUT:
   * 1. Look up pending offer by payment_hash → get service name + preimage
   * 2. Route to correct handler by service name
   * 3. Execute the task handler
   * 4. Settle the Hold Invoice with preimage
   * 5. Cleanup pending offer
   * 6. Return TASK_RESULT
   */
  private async handleTaskInput(
    msg: ProtocolMessage<TaskInputPayload>,
  ): Promise<ProtocolMessage<TaskResultPayload>> {
    const { payment_hash, input } = msg.payload;

    if (!payment_hash || !input) {
      throw new Error('Missing payment_hash or input in TASK_INPUT');
    }

    // Normalize hash
    const cleanHash = payment_hash.replace(/^0x/, '');

    // Look up pending offer by payment_hash → get service name + preimage
    const pending = this.pendingOffers.get(cleanHash);
    if (!pending) {
      throw new Error(`No pending offer found for payment_hash: ${cleanHash}. Offer may have expired.`);
    }

    // Verify payment is locked on Fiber
    const prefixedHash = payment_hash.startsWith('0x') ? payment_hash : `0x${payment_hash}`;
    const paymentStatus = await this.fiber.getInvoice({ payment_hash: prefixedHash });

    if (paymentStatus.status !== 'Received') {
      throw new Error(`Payment not received. Status: ${paymentStatus.status}`);
    }

    // Route to correct handler by service name (CRITICAL: was using first handler!)
    const handler = this.handlers.get(pending.serviceName);
    if (!handler) {
      throw new Error(`No handler for service '${pending.serviceName}'`);
    }

    // Execute task
    const startTime = Date.now();
    let output: unknown;
    try {
      output = await handler(input);
    } catch (err: any) {
      // Task execution failed — cancel the invoice, don't charge the caller
      try {
        await this.fiber.cancelInvoice({ payment_hash: prefixedHash });
      } catch { /* best effort */ }
      this.pendingOffers.delete(cleanHash);
      throw new Error(`Task execution failed: ${err.message}`);
    }
    const executionTimeMs = Date.now() - startTime;

    // Settle the Hold Invoice — releases locked funds to us
    await this.fiber.settleInvoice({
      payment_hash: prefixedHash,
      payment_preimage: `0x${pending.preimage}`,
    });

    // Cleanup
    this.pendingOffers.delete(cleanHash);

    // Compute proof hash
    const proofHash = createHash('sha256')
      .update(JSON.stringify(output))
      .digest('hex');

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
        preimage: `0x${pending.preimage}`,
        execution_time_ms: executionTimeMs,
        proof_hash: proofHash,
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────────

  private async getPubkey(): Promise<Pubkey> {
    if (!this._pubkey) {
      const info = await this.fiber.nodeInfo();
      this._pubkey = info.public_key;
    }
    return this._pubkey;
  }

  private readBody(req: IncomingMessage, maxSize: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxSize) {
          req.destroy();
          reject(new Error(`Request body exceeds max size (${maxSize} bytes)`));
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });
  }

  private sendError(res: ServerResponse, status: number, message: string): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }

  /**
   * Clean up offers older than 15 minutes (they expire at 10 min on Fiber side).
   */
  private cleanupExpiredOffers(): void {
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [hash, offer] of this.pendingOffers) {
      if (offer.createdAt < cutoff) {
        this.pendingOffers.delete(hash);
      }
    }
  }
}
