/**
 * AgentPay Hub Client
 *
 * For Agents that DON'T want to run their own Fiber node.
 *
 * Instead of running `fnn`, you connect to an AgentPay Hub
 * which manages Fiber channels on your behalf.
 *
 * Trade-off: Slightly less trustless (you trust the Hub for routing)
 *            but MUCH easier to get started.
 *
 * ```ts
 * import { AgentWallet } from '@agentpay-dev/sdk';
 *
 * // Option A: Self-hosted Fiber (full trustless)
 * const wallet = new AgentWallet({ fiberRpcUrl: 'http://localhost:8227' });
 *
 * // Option B: Hub mode (easy setup, 3 lines)
 * const wallet = AgentWallet.fromHub({
 *   hubUrl: 'https://hub.agentpay.dev',
 *   apiKey: 'ap_test_...',
 * });
 * ```
 *
 * The Hub provides:
 * - Managed Fiber node (no need to run fnn)
 * - Automatic channel management
 * - Multi-hop routing to any Provider
 * - Transaction history API
 */

import {
  FiberRpcClient,
  type Pubkey,
  type Hash256,
  type AssetType,
  type FiberCurrency,
} from '@agentpay-dev/core';
import { AgentWallet, type WalletConfig, type PayAndCallResult } from './wallet.js';

// ══════════════════════════════════════════════════════════�?//  Hub Config
// ══════════════════════════════════════════════════════════�?
export interface HubConfig {
  /** AgentPay Hub URL (e.g. https://hub.agentpay.dev) */
  hubUrl: string;
  /** API key from Hub dashboard */
  apiKey: string;
  /** Currency (default: Fibt for testnet) */
  currency?: FiberCurrency;
}

// ══════════════════════════════════════════════════════════�?//  Hub Client
// ══════════════════════════════════════════════════════════�?
/**
 * AgentPay Hub Client �?managed Fiber node access.
 *
 * The Hub runs Fiber nodes and exposes a simplified API.
 * Agents authenticate with an API key and the Hub handles
 * channel management, routing, and settlement.
 */
export class HubClient {
  private hubUrl: string;
  private apiKey: string;
  private currency: FiberCurrency;
  private _agentId?: string;

  constructor(config: HubConfig) {
    this.hubUrl = config.hubUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.currency = config.currency || 'Fibt';
  }

  /**
   * Get the Agent's identity (assigned by Hub).
   */
  async getAgentId(): Promise<string> {
    if (!this._agentId) {
      const res = await this.hubRequest<{ agent_id: string }>('/api/agent/info');
      this._agentId = res.agent_id;
    }
    return this._agentId;
  }

  /**
   * Get current balance across all Hub-managed channels.
   */
  async getBalance(): Promise<{
    available: string;
    locked: string;
    asset: AssetType;
  }> {
    return this.hubRequest('/api/agent/balance');
  }

  /**
   * Pay and call a Provider Agent through the Hub.
   * The Hub handles routing, channel management, and payment.
   */
  async payAndCall<T = unknown>(
    providerUrl: string,
    service: string,
    input: Record<string, unknown>,
    options?: {
      maxBudget?: string;
      asset?: AssetType;
    },
  ): Promise<PayAndCallResult<T>> {
    return this.hubRequest<PayAndCallResult<T>>('/api/pay-and-call', {
      provider_url: providerUrl,
      service,
      input,
      max_budget: options?.maxBudget || '100000000',
      asset: options?.asset || 'CKB',
    });
  }

  /**
   * Get transaction history.
   */
  async getTransactions(options?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<{
    transactions: Array<{
      id: string;
      type: 'sent' | 'received';
      amount: string;
      asset: AssetType;
      provider: string;
      service: string;
      status: string;
      created_at: string;
    }>;
    total: number;
  }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.status) params.set('status', options.status);
    return this.hubRequest(`/api/transactions?${params}`);
  }

  // ─── Internal ──────────────────────────────────────────

  private async hubRequest<T>(path: string, body?: unknown): Promise<T> {
    const url = `${this.hubUrl}${path}`;
    const options: RequestInit = {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-AgentPay-Version': '1.0',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Hub error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }
}

// ══════════════════════════════════════════════════════════�?//  Factory: Add Hub mode to AgentWallet
// ══════════════════════════════════════════════════════════�?
/**
 * Create an AgentWallet that uses the Hub for Fiber access.
 *
 * This is the easiest way to get started �?no Fiber node needed.
 *
 * @example
 * ```ts
 * const wallet = createHubWallet({
 *   hubUrl: 'https://hub.agentpay.dev',
 *   apiKey: 'ap_test_abc123',
 * });
 *
 * const result = await wallet.payAndCall(
 *   'http://translator:3001',
 *   'translate',
 *   { text: 'Hello', target: 'zh' },
 * );
 * ```
 */
export function createHubWallet(config: HubConfig): HubClient {
  return new HubClient(config);
}
