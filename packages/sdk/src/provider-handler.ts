/**
 * AgentPay SDK — Provider Handler Facade
 *
 * Composes ProviderServer (HTTP) + ProtocolHandler (protocol logic)
 * into a single convenient entrypoint that maintains the same public API
 * as the original ServiceProvider but with clean separation of concerns.
 *
 * Supports dual-mode:
 *   - AgentPay native: POST /agentpay/request + /agentpay/execute (Hold Invoice)
 *   - x402 standard:   GET /x402/{service} with X-Payment header (HTTP 402)
 *
 * ```ts
 * const provider = new ProviderFacade({ services: [...] });
 * provider.onTask('translate', async (input) => ({ translated: '...' }));
 * provider.enableX402(); // Enable x402 compatibility
 * provider.listen(3000);
 * ```
 */

import { FiberRpcClient, type ServiceSpec, type FiberCurrency } from '@agentpay-dev/core';
import type { ProtocolMessage, ServiceRequestPayload, TaskInputPayload, ResourceSpec } from '@agentpay-dev/core';
import { ProviderServer, type ServerConfig } from './provider-server.js';
import { ProtocolHandler, type TaskHandler } from './provider-protocol.js';
import { X402Gateway } from './x402-gateway.js';
import { StreamingProvider, type StreamingConfig } from './streaming-provider.js';
import { DepositGateway } from './x402-deposit.js';

// ╔════════════════════════════════════════════════════════════════╗
//  Config
// ╚════════════════════════════════════════════════════════════════╝

export interface ProviderFacadeConfig {
  services: ServiceSpec[];
  fiberRpcUrl?: string;
  currency?: FiberCurrency;
  server?: ServerConfig;
}

// ╔════════════════════════════════════════════════════════════════╗
//  ProviderFacade Class
// ╚════════════════════════════════════════════════════════════════╝

export class ProviderFacade {
  readonly protocol: ProtocolHandler;
  readonly server: ProviderServer;
  private x402?: X402Gateway;
  private streaming?: StreamingProvider;
  private deposit?: DepositGateway;
  private readonly fiber: FiberRpcClient;
  private readonly services: ServiceSpec[];
  private readonly currency: FiberCurrency;
  private x402Enabled = false;
  private streamingEnabled = false;
  private depositEnabled = false;

  constructor(config: ProviderFacadeConfig) {
    if (!config.services?.length) {
      throw new Error('Provider requires at least one service');
    }

    this.services = config.services;
    this.currency = config.currency || (
      process.env.FIBER_NETWORK === 'mainnet' ? 'Fibb' : 'Fibt'
    );

    this.fiber = new FiberRpcClient({
      rpcUrl: config.fiberRpcUrl || 'http://127.0.0.1:8227',
    });

    this.protocol = new ProtocolHandler({
      fiber: this.fiber,
      services: config.services,
      currency: this.currency,
    });

    this.server = new ProviderServer(config.server);

    // Register AgentPay native routes
    this.server.route('/agentpay/request', async (body) => {
      const msg = JSON.parse(body) as ProtocolMessage<ServiceRequestPayload>;
      if (!msg.protocol || !msg.type) {
        return { status: 400, body: { error: 'Missing protocol or type field' } };
      }
      const response = await this.protocol.handleServiceRequest(msg);
      return { status: 200, body: response };
    });

    this.server.route('/agentpay/execute', async (body) => {
      const msg = JSON.parse(body) as ProtocolMessage<TaskInputPayload>;
      if (!msg.protocol || !msg.type) {
        return { status: 400, body: { error: 'Missing protocol or type field' } };
      }
      const response = await this.protocol.handleTaskInput(msg);
      return { status: 200, body: response };
    });

    // Cleanup timer
    setInterval(() => {
      let cleaned = this.protocol.cleanupExpiredOffers();
      if (this.x402) cleaned += this.x402.cleanup();
      if (cleaned > 0) {
        console.log(`[AgentPay Provider] Cleaned up ${cleaned} expired offers`);
      }
    }, 5 * 60 * 1000);
  }

  /** Register a task handler for a service */
  onTask(serviceName: string, handler: TaskHandler): this {
    this.protocol.registerHandler(serviceName, handler);
    // Share handler with x402 gateway if enabled
    if (this.x402) {
      this.x402.setHandlers(this.protocol.getHandlers());
    }
    return this;
  }

  /**
   * Enable x402 compatibility mode.
   *
   * After calling this, the Provider responds to:
   *   GET /x402/{serviceName}            → 402 + Fiber invoice
   *   GET /x402/{serviceName} + X-Payment → 200 + result
   *   GET /x402/services                 → service discovery
   *
   * Compatible with x402 (Coinbase) and MPP (Stripe+Paradigm) protocols.
   */
  enableX402(): this {
    this.x402 = new X402Gateway({
      fiber: this.fiber,
      currency: this.currency,
      services: this.services,
    });
    this.x402.setHandlers(this.protocol.getHandlers());
    this.x402Enabled = true;

    // Register x402 wildcard route
    this.server.route('/x402/*', async (body, req) => {
      const parsed = JSON.parse(body);
      const path = parsed._path as string || req.url || '';
      const serviceName = path.replace('/x402/', '').split('?')[0];

      // Service discovery endpoint
      if (serviceName === 'services') {
        return {
          status: 200,
          body: {
            protocol: 'x402',
            network: this.currency === 'Fibb' ? 'fiber-mainnet' : 'fiber-testnet',
            services: this.x402!.getServiceList(),
          },
        };
      }

      const queryParams = parsed._query || {};
      const result = await this.x402!.handleRequest(serviceName, req, queryParams);
      return result;
    });

    return this;
  }

  /** Check if x402 mode is enabled */
  isX402Enabled(): boolean {
    return this.x402Enabled;
  }

  /**
   * Enable streaming micropayments.
   *
   * Adds endpoints:
   *   POST /stream/start    — Create streaming session
   *   POST /stream/activate — Activate after payment
   *   POST /stream/tick     — Record consumption
   *   POST /stream/settle   — Finalize (pay actual, refund rest)
   *   POST /stream/cancel   — Abort (full refund)
   *   POST /stream/status   — Query session state
   *
   * This is the "only Fiber can do this" feature.
   */
  enableStreaming(resources: ResourceSpec[]): this {
    this.streaming = new StreamingProvider({
      fiber: this.fiber,
      currency: this.currency,
      resources,
    });
    this.streamingEnabled = true;

    this.server.route('/stream/start', async (body) => {
      const params = JSON.parse(body);
      const result = await this.streaming!.startSession(params);
      return { status: 200, body: result };
    });

    this.server.route('/stream/activate', async (body) => {
      const { session_id } = JSON.parse(body);
      const result = await this.streaming!.activateSession(session_id);
      return { status: 200, body: result };
    });

    this.server.route('/stream/tick', async (body) => {
      const { session_id, units } = JSON.parse(body);
      const result = this.streaming!.tickSession(session_id, units);
      return { status: 200, body: result };
    });

    this.server.route('/stream/settle', async (body) => {
      const { session_id } = JSON.parse(body);
      const result = await this.streaming!.settleSession(session_id);
      return { status: 200, body: result };
    });

    this.server.route('/stream/cancel', async (body) => {
      const { session_id } = JSON.parse(body);
      const result = await this.streaming!.cancelStreamSession(session_id);
      return { status: 200, body: result };
    });

    this.server.route('/stream/status', async (body) => {
      const { session_id } = JSON.parse(body);
      const result = this.streaming!.getSessionStatus(session_id);
      return { status: 200, body: result };
    });

    return this;
  }

  /**
   * Enable deposit-based x402 payments (fee compression).
   *
   * Adds endpoints:
   *   POST /deposit/create   — Create deposit account
   *   POST /deposit/fund     — Add funds to balance
   *   POST /deposit/balance  — Check balance
   *   POST /deposit/withdraw — Withdraw remaining balance
   */
  enableDeposit(): this {
    this.deposit = new DepositGateway();
    this.depositEnabled = true;

    this.server.route('/deposit/create', async (body) => {
      const { agent_id } = JSON.parse(body);
      const account = this.deposit!.getOrCreateAccount(agent_id);
      return { status: 200, body: account };
    });

    this.server.route('/deposit/fund', async (body) => {
      const { agent_id, amount, reference } = JSON.parse(body);
      const account = this.deposit!.deposit(agent_id, amount, reference);
      return { status: 200, body: account };
    });

    this.server.route('/deposit/balance', async (body) => {
      const { agent_id } = JSON.parse(body);
      const balance = this.deposit!.getBalance(agent_id);
      const txs = this.deposit!.getTransactions(agent_id, 10);
      return { status: 200, body: { balance, recent_transactions: txs } };
    });

    this.server.route('/deposit/withdraw', async (body) => {
      const { agent_id, amount } = JSON.parse(body);
      const result = this.deposit!.withdraw(agent_id, amount);
      return { status: 200, body: result };
    });

    return this;
  }

  /** Start listening */
  async listen(port: number, hostname?: string) {
    const svcNames = this.protocol.getServices().map(s => s.name);
    console.log(`[AgentPay Provider] Services: ${svcNames.join(', ')}`);

    const modes = ['AgentPay native'];
    if (this.x402Enabled) modes.push('x402/MPP');
    if (this.streamingEnabled) modes.push('Streaming');
    if (this.depositEnabled) modes.push('Deposit');
    console.log(`[AgentPay Provider] Modes: ${modes.join(' + ')}`);

    if (this.x402Enabled) {
      console.log(`[AgentPay Provider] x402: GET /x402/{service}, GET /x402/services`);
    }
    if (this.streamingEnabled) {
      console.log(`[AgentPay Provider] Stream: /stream/start|tick|settle|cancel|status`);
    }
    if (this.depositEnabled) {
      console.log(`[AgentPay Provider] Deposit: /deposit/create|fund|balance|withdraw`);
    }
    return this.server.listen(port, hostname);
  }

  /** Close */
  close(): void {
    this.server.close();
  }
}

