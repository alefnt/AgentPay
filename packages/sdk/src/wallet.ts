/**
 * AgentPay SDK — AgentWallet
 *
 * The main class for Agent developers.
 * Uses Fiber Network Hold Invoice for trustless service payments.
 *
 * ```ts
 * import { AgentWallet } from '@agentpay/sdk';
 *
 * const wallet = new AgentWallet({
 *   fiberRpcUrl: 'http://127.0.0.1:8227',
 * });
 *
 * // Pay another Agent and call their service
 * const result = await wallet.payAndCall(
 *   'http://provider-agent:3000',
 *   'translate',
 *   { text: 'Hello World', target: 'zh' },
 *   { maxBudget: '1000000000' }  // 10 CKB in shannons
 * );
 * ```
 */

import { randomUUID } from 'node:crypto';
import {
  FiberRpcClient,
  getAgentIdFromNode,
  signPayload,
  createLogger,
  type Pubkey,
  type Hash256,
  type AssetType,
  type FiberCurrency,
  type Script,
  type ProtocolMessage,
  type ServiceRequestPayload,
  type ServiceOfferPayload,
  type TaskInputPayload,
  type TaskResultPayload,
  type ServiceSpec,
  type PaymentResult,
} from '@agentpay/core';

const log = createLogger({ name: 'wallet', version: '0.1.0' });

// ═══════════════════════════════════════════════════════════
//  Config
// ═══════════════════════════════════════════════════════════

export interface WalletConfig {
  /** Fiber node RPC URL (default: http://127.0.0.1:8227) */
  fiberRpcUrl?: string;
  /** Currency for invoices */
  currency?: FiberCurrency;
  /** Default payment asset (default: 'USDI' — stablecoin first) */
  defaultAsset?: AssetType;
  /** Agent's .bit account for DID identity (e.g. "my-agent.bit") */
  bitAccount?: string;
  /** Private key hex for message signing (optional, for protocol auth) */
  signingKey?: string;
  /** RGB++ Bridge config (optional, enables BTC↔CKB asset bridging) */
  rgbpp?: import('@agentpay/core').RgbppBridgeConfig;
}

// ═══════════════════════════════════════════════════════════
//  Result Types
// ═══════════════════════════════════════════════════════════

export interface PayAndCallResult<T = unknown> {
  output: T;
  payment_hash: Hash256;
  amount: string;
  asset: AssetType;
  fee: string;
  provider: Pubkey;
  execution_time_ms: number;
}

// ═══════════════════════════════════════════════════════════
//  AgentWallet
// ═══════════════════════════════════════════════════════════

export class AgentWallet {
  private fiber: FiberRpcClient;
  private currency: FiberCurrency;
  private signingKey: string;
  private _pubkey?: Pubkey;
  private _rgbppConfig?: import('@agentpay/core').RgbppBridgeConfig;
  private _rgbppBridge?: import('@agentpay/core').RgbppBridge;

  constructor(config?: WalletConfig) {
    this.fiber = new FiberRpcClient({
      rpcUrl: config?.fiberRpcUrl || 'http://127.0.0.1:8227',
    });
    this.currency = config?.currency || 'Fibt';  // testnet default
    this.signingKey = config?.signingKey || '';
    this._rgbppConfig = config?.rgbpp;
  }

  /**
   * Get this Agent's pubkey (= identity) from the connected Fiber node.
   */
  async getPubkey(): Promise<Pubkey> {
    if (!this._pubkey) {
      const info = await this.fiber.nodeInfo();
      this._pubkey = info.node_id || info.public_key || '';
    }
    return this._pubkey;
  }

  /**
   * Get the Fiber RPC client for direct access.
   */
  get rpc(): FiberRpcClient {
    return this.fiber;
  }

  /**
   * Get the RGB++ Bridge for BTC↔CKB asset bridging.
   *
   * Lazy-initialized on first access.
   *
   * ```ts
   * const bridge = wallet.rgbppBridge();
   * const assets = await bridge.getAssets('tb1q...');
   * await bridge.leapToCkb({ ... }); // BTC → CKB
   * ```
   */
  rgbppBridge(): import('@agentpay/core').RgbppBridge {
    if (!this._rgbppBridge) {
      const { RgbppBridge } = require('@agentpay/core');
      this._rgbppBridge = new RgbppBridge(this._rgbppConfig);
    }
    return this._rgbppBridge!;
  }

  // ─────────────────────────────────────────────────────────
  //  Core: Pay and Call
  // ─────────────────────────────────────────────────────────

  /**
   * Pay and call a Provider Agent's service using Hold Invoice pattern.
   *
   * Flow:
   * 1. Send SERVICE_REQUEST to Provider (HTTP)
   * 2. Receive SERVICE_OFFER with Hold Invoice
   * 3. Pay the Hold Invoice via Fiber (funds locked)
   * 4. Send TASK_INPUT with payment proof (HTTP)
   * 5. Receive TASK_RESULT with preimage
   * 6. Provider settles invoice with preimage (funds released)
   *
   * @param providerUrl - Provider Agent's HTTP endpoint
   * @param service - Service name to call
   * @param input - Input data for the service
   * @param options - Payment options
   */
  async payAndCall<T = unknown>(
    providerUrl: string,
    service: string,
    input: Record<string, unknown>,
    options?: {
      maxBudget?: string;
      asset?: AssetType;
      timeoutSeconds?: number;
      udtTypeScript?: Script;
    },
  ): Promise<PayAndCallResult<T>> {
    // Input validation
    if (!providerUrl || typeof providerUrl !== 'string') {
      throw new Error('providerUrl is required and must be a string');
    }
    if (!service || typeof service !== 'string') {
      throw new Error('service is required and must be a string');
    }
    if (!input || typeof input !== 'object') {
      throw new Error('input is required and must be an object');
    }

    const startTime = Date.now();
    const myPubkey = await this.getPubkey();
    const asset = options?.asset || 'CKB';
    const timeout = options?.timeoutSeconds || 30;

    // Step 1: SERVICE_REQUEST
    const request = this.createMessage<ServiceRequestPayload>(
      '' as Pubkey,  // will be filled by Provider
      'SERVICE_REQUEST',
      {
        service,
        input_preview: { keys: Object.keys(input) },
        budget: {
          max_amount: options?.maxBudget || '10000000000',  // 100 CKB default
          asset,
        },
      },
    );

    const offerMsg = await this.httpPost<ProtocolMessage<ServiceOfferPayload>>(
      `${providerUrl}/agentpay/request`,
      request,
    );
    const offer = offerMsg.payload;

    // Validate budget
    if (BigInt(offer.price) > BigInt(options?.maxBudget || '10000000000')) {
      throw new Error(`Price ${offer.price} exceeds max budget`);
    }

    // Step 2: Pay Hold Invoice via Fiber
    const paymentResult = await this.fiber.sendPayment({
      invoice: offer.hold_invoice,
      timeout,
      udt_type_script: options?.udtTypeScript,
      max_fee_amount: '100000000',  // max 1 CKB fee
    });

    if (paymentResult.status === 'Failed') {
      throw new Error(`Payment failed: ${paymentResult.failed_error}`);
    }

    // Step 3: Send TASK_INPUT
    const taskInput = this.createMessage<TaskInputPayload>(
      offerMsg.from,
      'TASK_INPUT',
      {
        offer_id: offerMsg.id,
        payment_hash: paymentResult.payment_hash,
        input,
      },
    );

    const resultMsg = await this.httpPost<ProtocolMessage<TaskResultPayload>>(
      `${providerUrl}/agentpay/execute`,
      taskInput,
    );

    // Step 4: Verify result
    // The Provider has already called settle_invoice with the preimage
    // on their side, so funds are released. We just verify we got output.
    const executionTimeMs = Date.now() - startTime;

    return {
      output: resultMsg.payload.output as T,
      payment_hash: paymentResult.payment_hash,
      amount: offer.price,
      asset,
      fee: paymentResult.fee,
      provider: offerMsg.from,
      execution_time_ms: executionTimeMs,
    };
  }

  // ─────────────────────────────────────────────────────────
  //  Channel Management (convenience wrappers)
  // ─────────────────────────────────────────────────────────

  /**
   * Open a payment channel with another Agent.
   */
  async openChannel(
    peerPubkey: Pubkey,
    fundingAmount: string,
    udtTypeScript?: Script,
  ) {
    // Must connect to peer first
    // Peer address should be known from registry or config
    return this.fiber.openChannel({
      pubkey: peerPubkey,
      funding_amount: fundingAmount,
      funding_udt_type_script: udtTypeScript,
    });
  }

  /**
   * List all open channels.
   */
  async listChannels() {
    return this.fiber.listChannels();
  }

  /**
   * Get node info (pubkey, channels, peers).
   */
  async nodeInfo() {
    return this.fiber.nodeInfo();
  }

  // ─────────────────────────────────────────────────────────
  //  BTC Lightning (via Cch module)
  // ─────────────────────────────────────────────────────────

  /**
   * Pay a BTC Lightning invoice through Fiber → Cch → Lightning.
   */
  async payBtcLightning(btcInvoice: string) {
    return this.fiber.sendBtc({
      btc_pay_req: btcInvoice,
      currency: this.currency,
    });
  }

  /**
   * Receive BTC from Lightning Network into Fiber.
   */
  async receiveBtcLightning(fiberInvoice: string) {
    return this.fiber.receiveBtc({
      fiber_pay_req: fiberInvoice,
    });
  }

  // ─────────────────────────────────────────────────────────
  //  Internal Helpers
  // ─────────────────────────────────────────────────────────

  private createMessage<T>(
    to: Pubkey,
    type: ProtocolMessage['type'],
    payload: T,
  ): ProtocolMessage<T> {
    const msg: ProtocolMessage<T> = {
      protocol: 'agentpay/1.0',
      id: randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
      from: this._pubkey || '' as Pubkey,
      to,
      signature: '',
      type,
      payload,
    };

    if (this.signingKey) {
      msg.signature = signPayload(
        this.signingKey,
        JSON.stringify({ type: msg.type, payload: msg.payload, timestamp: msg.timestamp }),
      );
    }

    return msg;
  }

  private async httpPost<T>(url: string, body: unknown, timeoutMs: number = 30_000): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '(no body)');
        throw new Error(`AgentPay HTTP error ${res.status}: ${text}`);
      }

      return res.json() as Promise<T>;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
