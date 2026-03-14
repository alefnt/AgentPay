/**
 * AgentPay Core — Fiber Network RPC Client
 *
 * Production-ready JSON-RPC client for all 6 Fiber Network modules.
 * Based on: https://github.com/nervosnetwork/fiber/blob/develop/crates/fiber-lib/src/rpc/README.md
 *
 * Features:
 * - Request timeout (default 30s)
 * - Atomic request IDs (no collision)
 * - Retry with exponential backoff (configurable)
 * - Structured error types
 */

import type {
  Script,
  Hash256,
  Pubkey,
  FiberCurrency,
  FiberChannel,
  CkbInvoice,
  CkbInvoiceStatus,
  PaymentStatus,
  PaymentResult,
  CchOrder,
  SessionRoute,
} from './types.js';

// ═══════════════════════════════════════════════════════════
//  Config
// ═══════════════════════════════════════════════════════════

export interface FiberConfig {
  /** Fiber node RPC endpoint (default: http://127.0.0.1:8227) */
  rpcUrl: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Max retries for transient failures (default: 2) */
  maxRetries?: number;
  /** Retry base delay in ms (default: 500) */
  retryBaseDelayMs?: number;
}

const DEFAULT_CONFIG: FiberConfig = {
  rpcUrl: process.env.FIBER_RPC_URL || 'http://127.0.0.1:8227',
  timeoutMs: 30_000,
  maxRetries: 2,
  retryBaseDelayMs: 500,
};

// ═══════════════════════════════════════════════════════════
//  Fiber RPC Client
// ═══════════════════════════════════════════════════════════

export class FiberRpcClient {
  private config: Required<FiberConfig>;
  private requestId = 0;

  constructor(config?: Partial<FiberConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<FiberConfig>;
  }

  // ─────────────────────────────────────────────────────────
  //  Module: Channel
  // ─────────────────────────────────────────────────────────

  async openChannel(params: {
    pubkey: Pubkey;
    funding_amount: string;
    funding_udt_type_script?: Script;
    public?: boolean;
    one_way?: boolean;
    commitment_delay_epoch?: string;
    commitment_fee_rate?: string;
    funding_fee_rate?: string;
    tlc_expiry_delta?: string;
    tlc_min_value?: string;
    tlc_fee_proportional_millionths?: string;
    max_tlc_value_in_flight?: string;
    max_tlc_number_in_flight?: string;
  }): Promise<{ temporary_channel_id: Hash256 }> {
    this.validateRequired(params, ['pubkey', 'funding_amount'], 'openChannel');
    return this.call('open_channel', params);
  }

  async acceptChannel(params: {
    temporary_channel_id: Hash256;
    funding_amount: string;
    shutdown_script?: Script;
    max_tlc_value_in_flight?: string;
    max_tlc_number_in_flight?: string;
    tlc_min_value?: string;
    tlc_fee_proportional_millionths?: string;
    tlc_expiry_delta?: string;
  }): Promise<{ channel_id: Hash256 }> {
    this.validateRequired(params, ['temporary_channel_id', 'funding_amount'], 'acceptChannel');
    return this.call('accept_channel', params);
  }

  async listChannels(params?: {
    pubkey?: Pubkey;
    include_closed?: boolean;
    only_pending?: boolean;
  }): Promise<{ channels: FiberChannel[] }> {
    return this.call('list_channels', params ?? {});
  }

  async shutdownChannel(params: {
    channel_id: Hash256;
    close_script?: Script;
    fee_rate?: string;
    force?: boolean;
  }): Promise<void> {
    this.validateRequired(params, ['channel_id'], 'shutdownChannel');
    return this.call('shutdown_channel', params);
  }

  async updateChannel(params: {
    channel_id: Hash256;
    enabled?: boolean;
    tlc_expiry_delta?: string;
    tlc_minimum_value?: string;
    tlc_fee_proportional_millionths?: string;
  }): Promise<void> {
    this.validateRequired(params, ['channel_id'], 'updateChannel');
    return this.call('update_channel', params);
  }

  async abandonChannel(params: {
    channel_id: Hash256;
  }): Promise<void> {
    this.validateRequired(params, ['channel_id'], 'abandonChannel');
    return this.call('abandon_channel', params);
  }

  // ─────────────────────────────────────────────────────────
  //  Module: Invoice
  // ─────────────────────────────────────────────────────────

  async newInvoice(params: {
    amount: string;
    currency: FiberCurrency;
    description?: string;
    payment_preimage?: Hash256;
    payment_hash?: Hash256;
    expiry?: number;
    fallback_address?: string;
    final_expiry_delta?: string;
    udt_type_script?: Script;
    hash_algorithm?: 'sha256' | 'ckb_hash';
    allow_mpp?: boolean;
  }): Promise<{
    invoice_address: string;
    invoice: CkbInvoice;
  }> {
    this.validateRequired(params, ['amount', 'currency'], 'newInvoice');
    if (BigInt(params.amount) <= 0n) {
      throw new FiberValidationError('newInvoice', 'amount must be > 0');
    }
    return this.call('new_invoice', params);
  }

  async parseInvoice(params: { invoice: string }): Promise<{ invoice: CkbInvoice }> {
    this.validateRequired(params, ['invoice'], 'parseInvoice');
    return this.call('parse_invoice', params);
  }

  async getInvoice(params: {
    payment_hash: Hash256;
  }): Promise<{
    invoice_address: string;
    invoice: CkbInvoice;
    status: CkbInvoiceStatus;
  }> {
    this.validateRequired(params, ['payment_hash'], 'getInvoice');
    return this.call('get_invoice', params);
  }

  async cancelInvoice(params: {
    payment_hash: Hash256;
  }): Promise<{
    invoice_address: string;
    invoice: CkbInvoice;
    status: CkbInvoiceStatus;
  }> {
    this.validateRequired(params, ['payment_hash'], 'cancelInvoice');
    return this.call('cancel_invoice', params);
  }

  async settleInvoice(params: {
    payment_hash: Hash256;
    payment_preimage: Hash256;
  }): Promise<void> {
    this.validateRequired(params, ['payment_hash', 'payment_preimage'], 'settleInvoice');
    return this.call('settle_invoice', params);
  }

  // ─────────────────────────────────────────────────────────
  //  Module: Payment
  // ─────────────────────────────────────────────────────────

  async sendPayment(params: {
    target_pubkey?: Pubkey;
    amount?: string;
    payment_hash?: Hash256;
    final_tlc_expiry_delta?: string;
    tlc_expiry_limit?: string;
    invoice?: string;
    timeout?: number;
    max_fee_amount?: string;
    max_fee_rate?: string;
    max_parts?: string;
    keysend?: boolean;
    udt_type_script?: Script;
    allow_self_payment?: boolean;
    custom_records?: Record<string, string>;
    hop_hints?: Array<{
      pubkey: Pubkey;
      channel_outpoint: string;
      fee_rate: string;
      tlc_expiry_delta: string;
    }>;
    dry_run?: boolean;
  }): Promise<PaymentResult> {
    if (!params.invoice && !params.target_pubkey) {
      throw new FiberValidationError('sendPayment', 'either invoice or target_pubkey is required');
    }
    return this.call('send_payment', params);
  }

  async getPayment(params: {
    payment_hash: Hash256;
  }): Promise<PaymentResult> {
    this.validateRequired(params, ['payment_hash'], 'getPayment');
    return this.call('get_payment', params);
  }

  async buildRouter(params: {
    amount?: string;
    udt_type_script?: Script;
    hops_info: Array<{
      pubkey: Pubkey;
      channel_outpoint?: string;
    }>;
    final_tlc_expiry_delta?: string;
  }): Promise<{
    router_hops: Array<{
      pubkey: Pubkey;
      amount: string;
      fee: string;
      channel_outpoint: string;
      tlc_expiry_delta: string;
    }>;
  }> {
    return this.call('build_router', params);
  }

  // ─────────────────────────────────────────────────────────
  //  Module: Cch (Cross-Chain Hub — BTC Lightning)
  // ─────────────────────────────────────────────────────────

  async sendBtc(params: {
    btc_pay_req: string;
    currency: FiberCurrency;
  }): Promise<CchOrder> {
    this.validateRequired(params, ['btc_pay_req', 'currency'], 'sendBtc');
    return this.call('send_btc', params);
  }

  async receiveBtc(params: {
    fiber_pay_req: string;
  }): Promise<CchOrder> {
    this.validateRequired(params, ['fiber_pay_req'], 'receiveBtc');
    return this.call('receive_btc', params);
  }

  async getCchOrder(params: {
    payment_hash: Hash256;
  }): Promise<CchOrder> {
    this.validateRequired(params, ['payment_hash'], 'getCchOrder');
    return this.call('get_cch_order', params);
  }

  // ─────────────────────────────────────────────────────────
  //  Module: Peer
  // ─────────────────────────────────────────────────────────

  async connectPeer(params: { address: string }): Promise<void> {
    this.validateRequired(params, ['address'], 'connectPeer');
    return this.call('connect_peer', params);
  }

  async disconnectPeer(params: { pubkey: Pubkey }): Promise<void> {
    this.validateRequired(params, ['pubkey'], 'disconnectPeer');
    return this.call('disconnect_peer', params);
  }

  // ─────────────────────────────────────────────────────────
  //  Module: Info
  // ─────────────────────────────────────────────────────────

  async nodeInfo(): Promise<{
    node_name: string;
    public_key: Pubkey;
    addresses: string[];
    chain_hash: Hash256;
    open_channel_count: number;
    pending_channel_count: number;
    peers_count: number;
    network_sync_status: string;
    udt_cfg_infos: Record<string, unknown>;
  }> {
    return this.call('node_info', {});
  }

  // ─────────────────────────────────────────────────────────
  //  Module: Graph (Network Topology)
  // ─────────────────────────────────────────────────────────

  async graphNodes(params?: {
    limit?: number;
    after?: string;
  }): Promise<{
    nodes: Array<{
      node_id: Pubkey;
      timestamp: string;
      node_name?: string;
      addresses: string[];
    }>;
    last_cursor: string;
  }> {
    return this.call('graph_nodes', params ?? {});
  }

  async graphChannels(params?: {
    limit?: number;
    after?: string;
  }): Promise<{
    channels: Array<{
      channel_outpoint: string;
      node1: Pubkey;
      node2: Pubkey;
      capacity: string;
      udt_type_script?: Script;
    }>;
    last_cursor: string;
  }> {
    return this.call('graph_channels', params ?? {});
  }

  // ─────────────────────────────────────────────────────────
  //  Internal: Validation
  // ─────────────────────────────────────────────────────────

  private validateRequired(params: Record<string, unknown>, fields: string[], method: string): void {
    for (const field of fields) {
      if (params[field] === undefined || params[field] === null || params[field] === '') {
        throw new FiberValidationError(method, `${field} is required`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  //  Internal: JSON-RPC 2.0 Call with timeout + retry
  // ─────────────────────────────────────────────────────────

  private async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.callOnce<T>(method, params);
      } catch (err: any) {
        lastError = err;

        // Don't retry on validation or RPC logic errors
        if (err instanceof FiberValidationError) throw err;
        if (err instanceof FiberRpcError) throw err;

        // Retry on network errors
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryBaseDelayMs * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError!;
  }

  private async callOnce<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = ++this.requestId;

    const body = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: [params],
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(this.config.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Fiber RPC HTTP error: ${response.status} ${response.statusText}`);
      }

      const json = await response.json() as { result?: T; error?: { code: number; message: string } };

      if (json.error) {
        throw new FiberRpcError(method, json.error.code, json.error.message);
      }

      return json.result as T;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new FiberTimeoutError(method, this.config.timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  Error Types
// ═══════════════════════════════════════════════════════════

export class FiberRpcError extends Error {
  constructor(
    public readonly method: string,
    public readonly code: number,
    message: string,
  ) {
    super(`Fiber RPC [${method}] error ${code}: ${message}`);
    this.name = 'FiberRpcError';
  }
}

export class FiberTimeoutError extends Error {
  constructor(
    public readonly method: string,
    public readonly timeoutMs: number,
  ) {
    super(`Fiber RPC [${method}] timed out after ${timeoutMs}ms`);
    this.name = 'FiberTimeoutError';
  }
}

export class FiberValidationError extends Error {
  constructor(
    public readonly method: string,
    message: string,
  ) {
    super(`Fiber RPC [${method}] validation error: ${message}`);
    this.name = 'FiberValidationError';
  }
}
