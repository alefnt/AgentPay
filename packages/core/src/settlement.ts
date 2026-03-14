/**
 * Settlement Layer — Fiber-first with fallbacks
 *
 * Fiber Network is ALWAYS the primary settlement layer.
 * CKB L1 and Hub are fallbacks for specific scenarios:
 *
 *   - Fiber Network (PRIMARY) — PTLC channels, ~20ms, zero-fee, multi-asset
 *   - Hub (ENTRY-LEVEL) — managed mode, no node needed, API key only
 *   - CKB L1 (FALLBACK) — on-chain cell escrow, when Fiber is unavailable
 *
 * Why Fiber is always primary:
 *   - Only network with multi-asset channels (xUDT stablecoins)
 *   - Only network targeting AI Agent + IoT micropayments
 *   - PTLC > HTLC (better privacy)
 *   - Millisecond settlement, zero fees
 *
 * When to use fallbacks:
 *   - Hub: new users who don't want to run a Fiber node yet
 *   - CKB L1: Fiber node is temporarily down, need on-chain guarantee
 *
 * ```ts
 * const wallet = new AgentWallet({
 *   fiberRpcUrl: 'http://127.0.0.1:8227',  // ← Primary: own Fiber node
 *   // OR
 *   hubUrl: 'https://hub.agentpay.dev',     // ← Fallback: managed mode
 * });
 * ```
 */

import type { Hash256, Script } from './types.js';

// ═══════════════════════════════════════════════════════════
//  Settlement Layer Interface
// ═══════════════════════════════════════════════════════════

/**
 * A Hold Invoice result — settlement-layer agnostic.
 */
export interface HoldInvoiceResult {
  /** Payment hash (HTLC/PTLC identifier) */
  paymentHash: Hash256;
  /** Encoded invoice string (Fiber bolt11-like / CKB tx hash / Hub ref) */
  invoice: string;
  /** Preimage (known only to provider, used to settle) */
  preimage: string;
  /** Settlement layer used */
  layer: SettlementLayerType;
}

export interface SettlementResult {
  /** Whether settlement succeeded */
  success: boolean;
  /** Payment hash */
  paymentHash: Hash256;
  /** Settlement layer used */
  layer: SettlementLayerType;
  /** Transaction ID (chain-specific) */
  txId?: string;
  /** Error message if failed */
  error?: string;
}

export type SettlementLayerType = 'fiber' | 'ckb-l1' | 'hub';

export interface SettlementCapabilities {
  /** This layer supports multi-asset (xUDT) */
  multiAsset: boolean;
  /** This layer supports Hold Invoice (lock → work → settle/refund) */
  holdInvoice: boolean;
  /** Average settlement time in milliseconds */
  avgSettleTimeMs: number;
  /** Whether a pre-funded channel is required */
  requiresChannel: boolean;
  /** Per-transaction cost (in CKB shannons, 0 = free) */
  txCostShannons: string;
}

/**
 * Settlement Layer — the only interface that changes across backends.
 * AgentPay protocol logic stays the same regardless of settlement.
 */
export interface SettlementLayer {
  /** Which layer this is */
  readonly type: SettlementLayerType;

  /** What this layer can do */
  readonly capabilities: SettlementCapabilities;

  /**
   * Check if this layer is available and ready.
   * e.g. Fiber: is there an active channel?
   *      CKB L1: is there CKB balance?
   *      Hub: is the Hub reachable?
   */
  isAvailable(): Promise<boolean>;

  /**
   * Create a Hold Invoice (provider side).
   * Locks funds upon payment — preimage reveals when work is done.
   *
   * @param amount - Amount in smallest unit
   * @param asset - Asset type (CKB, USDI, etc.)
   * @param description - Human-readable description
   * @param expirySeconds - How long before the lock expires
   */
  createHoldInvoice(
    amount: string,
    asset: string,
    description: string,
    expirySeconds?: number,
  ): Promise<HoldInvoiceResult>;

  /**
   * Pay a Hold Invoice (caller side).
   * Locks the caller's funds — released when provider reveals preimage.
   */
  payInvoice(invoice: string): Promise<{ paymentHash: Hash256 }>;

  /**
   * Settle a Hold Invoice by revealing the preimage (provider side).
   * This releases the locked funds to the provider.
   */
  settleInvoice(preimage: string): Promise<SettlementResult>;

  /**
   * Cancel/refund a Hold Invoice (either side, or automatic on timeout).
   */
  cancelInvoice(paymentHash: Hash256): Promise<SettlementResult>;
}

// ═══════════════════════════════════════════════════════════
//  Fiber Settlement (PTLC channels — fastest)
// ═══════════════════════════════════════════════════════════

export class FiberSettlement implements SettlementLayer {
  readonly type = 'fiber' as const;
  readonly capabilities: SettlementCapabilities = {
    multiAsset: true,
    holdInvoice: true,
    avgSettleTimeMs: 20,
    requiresChannel: true,
    txCostShannons: '0',
  };

  constructor(private readonly rpcUrl: string) {}

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'node_info', params: [] }),
      });
      return resp.ok;
    } catch { return false; }
  }

  async createHoldInvoice(amount: string, asset: string, description: string, expirySeconds = 3600): Promise<HoldInvoiceResult> {
    // Delegate to Fiber RPC
    const preimage = randomHex(32);
    const hash = await sha256(preimage);
    const resp = await this.rpc('new_invoice', {
      amount, description,
      payment_preimage: preimage,
      expiry: `0x${expirySeconds.toString(16)}`,
      currency: 'Fibt',
    });
    return {
      paymentHash: hash,
      invoice: String(resp.invoice_address ?? ''),
      preimage,
      layer: 'fiber' as const,
    };
  }

  async payInvoice(invoice: string): Promise<{ paymentHash: Hash256 }> {
    const resp = await this.rpc('send_payment', { invoice });
    return { paymentHash: String(resp.payment_hash ?? ('0x' + '0'.repeat(64))) as Hash256 };
  }

  async settleInvoice(preimage: string) {
    const hash = await sha256(preimage);
    await this.rpc('settle_invoice', { payment_preimage: preimage });
    return { success: true, paymentHash: hash, layer: 'fiber' as const };
  }

  async cancelInvoice(paymentHash: Hash256) {
    await this.rpc('cancel_invoice', { payment_hash: paymentHash });
    return { success: true, paymentHash, layer: 'fiber' as const };
  }

  private async rpc(method: string, params: Record<string, unknown>) {
    const resp = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params: [params] }),
    });
    const data = await resp.json() as { result?: Record<string, unknown> };
    return data.result ?? {};
  }
}

// ═══════════════════════════════════════════════════════════
//  CKB L1 Settlement (on-chain cell escrow — simple)
// ═══════════════════════════════════════════════════════════

export class CkbL1Settlement implements SettlementLayer {
  readonly type = 'ckb-l1' as const;
  readonly capabilities: SettlementCapabilities = {
    multiAsset: true,
    holdInvoice: true,
    avgSettleTimeMs: 12_000,   // ~12s block time
    requiresChannel: false,    // ← no channel needed!
    txCostShannons: '100000',  // ~0.001 CKB per tx
  };

  constructor(private readonly ckbRpcUrl: string) {}

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(this.ckbRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'get_tip_block_number', params: [] }),
      });
      return resp.ok;
    } catch { return false; }
  }

  async createHoldInvoice(amount: string, asset: string, description: string, expirySeconds = 3600) {
    // CKB L1: create a cell with HTLC lock script
    // The cell holds funds that can be claimed with preimage or refunded after timeout
    const preimage = randomHex(32);
    const hash = await sha256(preimage);
    // In production: construct CKB transaction with HTLC lock cell
    return {
      paymentHash: hash,
      invoice: `ckb-l1:${hash}:${amount}:${asset}`,
      preimage,
      layer: 'ckb-l1' as const,
    };
  }

  async payInvoice(invoice: string) {
    // Parse CKB L1 invoice and send on-chain transaction
    const [, paymentHash] = invoice.split(':');
    return { paymentHash: (paymentHash ?? '0x') as Hash256 };
  }

  async settleInvoice(preimage: string) {
    const hash = await sha256(preimage);
    // In production: submit CKB transaction revealing preimage to claim cell
    return { success: true, paymentHash: hash, layer: 'ckb-l1' as const };
  }

  async cancelInvoice(paymentHash: Hash256) {
    // In production: wait for timeout, then reclaim cell
    return { success: true, paymentHash, layer: 'ckb-l1' as const };
  }
}

// ═══════════════════════════════════════════════════════════
//  Hub Settlement (managed/custodial — simplest)
// ═══════════════════════════════════════════════════════════

export class HubSettlement implements SettlementLayer {
  readonly type = 'hub' as const;
  readonly capabilities: SettlementCapabilities = {
    multiAsset: true,
    holdInvoice: true,        // Hub implements hold invoice internally
    avgSettleTimeMs: 50,       // Fast (just API call)
    requiresChannel: false,    // No channel needed
    txCostShannons: '0',       // Free (Hub absorbs costs)
  };

  constructor(
    private readonly hubUrl: string,
    private readonly apiKey: string,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.hubUrl}/health`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return resp.ok;
    } catch { return false; }
  }

  async createHoldInvoice(amount: string, asset: string, description: string, expirySeconds = 3600) {
    const resp = await fetch(`${this.hubUrl}/api/v1/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ amount, asset, description, expiry: expirySeconds }),
    });
    const data = await resp.json() as {
      payment_hash?: string; invoice?: string; preimage?: string;
    };
    return {
      paymentHash: (data.payment_hash ?? '') as Hash256,
      invoice: data.invoice ?? '',
      preimage: data.preimage ?? '',
      layer: 'hub' as const,
    };
  }

  async payInvoice(invoice: string) {
    const resp = await fetch(`${this.hubUrl}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ invoice }),
    });
    const data = await resp.json() as { payment_hash?: string };
    return { paymentHash: (data.payment_hash ?? '') as Hash256 };
  }

  async settleInvoice(preimage: string) {
    const hash = await sha256(preimage);
    await fetch(`${this.hubUrl}/api/v1/invoices/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ preimage }),
    });
    return { success: true, paymentHash: hash, layer: 'hub' as const };
  }

  async cancelInvoice(paymentHash: Hash256) {
    await fetch(`${this.hubUrl}/api/v1/invoices/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ payment_hash: paymentHash }),
    });
    return { success: true, paymentHash, layer: 'hub' as const };
  }
}

// ═══════════════════════════════════════════════════════════
//  Auto-Selector — picks best available settlement layer
// ═══════════════════════════════════════════════════════════

export interface AutoSettlementConfig {
  /** Fiber RPC URL (optional) */
  fiberRpcUrl?: string;
  /** CKB RPC URL (optional) */
  ckbRpcUrl?: string;
  /** Hub URL + API Key (optional) */
  hub?: { url: string; apiKey: string };
  /** Preferred layer (override auto-selection) */
  prefer?: SettlementLayerType;
}

/**
 * Auto-select the best available settlement layer.
 *
 * Priority (unless overridden):
 *   1. Fiber (fastest, zero-fee — if channel available)
 *   2. CKB L1 (no channel needed — if CKB node available)
 *   3. Hub (simplest — always available if configured)
 *
 * @example
 * ```ts
 * const settlement = await autoSelectSettlement({
 *   fiberRpcUrl: 'http://127.0.0.1:8227',
 *   hub: { url: 'https://hub.agentpay.dev', apiKey: 'ak_...' },
 * });
 * console.log(settlement.type); // 'fiber' or 'hub'
 * ```
 */
export async function autoSelectSettlement(
  config: AutoSettlementConfig,
): Promise<SettlementLayer> {
  const layers: SettlementLayer[] = [];

  // Build available layers
  if (config.fiberRpcUrl) {
    layers.push(new FiberSettlement(config.fiberRpcUrl));
  }
  if (config.ckbRpcUrl) {
    layers.push(new CkbL1Settlement(config.ckbRpcUrl));
  }
  if (config.hub) {
    layers.push(new HubSettlement(config.hub.url, config.hub.apiKey));
  }

  // If user prefers a specific layer, try that first
  if (config.prefer) {
    const preferred = layers.find(l => l.type === config.prefer);
    if (preferred && await preferred.isAvailable()) {
      return preferred;
    }
  }

  // Auto-select: try in priority order (Fiber > CKB L1 > Hub)
  for (const layer of layers) {
    if (await layer.isAvailable()) {
      return layer;
    }
  }

  // Nothing available — return Hub as default (will fail on actual calls)
  if (config.hub) {
    return new HubSettlement(config.hub.url, config.hub.apiKey);
  }

  throw new Error(
    'No settlement layer available. Configure at least one of: fiberRpcUrl, ckbRpcUrl, or hub.',
  );
}

// ─── Helpers ─────────────────────────────────────────────

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return '0x' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(hexInput: string): Promise<Hash256> {
  const input = hexInput.startsWith('0x') ? hexInput.slice(2) : hexInput;
  const bytes = new Uint8Array(input.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(input.substring(i * 2, i * 2 + 2), 16);
  }
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hash));
  return ('0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('')) as Hash256;
}
