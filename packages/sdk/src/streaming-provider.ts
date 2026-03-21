/**
 * AgentPay SDK — Streaming Micropayment Provider
 *
 * Integrates DePIN streaming sessions into the Provider HTTP layer.
 * Enables per-second / per-unit billing — the "only Fiber can do this" feature.
 *
 * Endpoints:
 *   POST /stream/start   — Create streaming session (locks budget via Hold Invoice)
 *   POST /stream/tick    — Report resource consumption (per unit)
 *   POST /stream/settle  — Finalize session (pay actual, refund remainder)
 *   POST /stream/cancel  — Abort session (full refund)
 *   GET  /stream/status  — Query session status
 *
 * Also exposed via x402:
 *   GET /x402/stream/{service} → 402 with streaming Hold Invoice
 *
 * Usage:
 * ```ts
 * provider.enableStreaming({
 *   resources: [{
 *     type: 'gpu', name: 'A100', unit: 'tokens',
 *     price_per_unit: '1000000', asset: 'CKB',
 *   }],
 * });
 * ```
 */

import type { FiberRpcClient, FiberCurrency, Hash256 } from '@agentpay-dev/core';
import {
  createSession,
  activateSession,
  tick,
  settleStreamingSession as settleSession,
  markSettled,
  cancelSession,
  getSessionCost,
  getSessionBudgetRemaining,
  isSessionExpired,
} from '@agentpay-dev/core';
import type { ResourceSpec, StreamingSession, DepinSettlementResult as SettlementResult } from '@agentpay-dev/core';

// ╔════════════════════════════════════════════════════════════════╗
//  Config
// ╚════════════════════════════════════════════════════════════════╝

export interface StreamingConfig {
  /** Fiber RPC client (shared) */
  fiber: FiberRpcClient;
  /** Currency for invoices */
  currency: FiberCurrency;
  /** Available streaming resources */
  resources: ResourceSpec[];
}

// ╔════════════════════════════════════════════════════════════════╗
//  StreamingProvider Class
// ╚════════════════════════════════════════════════════════════════╝

export class StreamingProvider {
  private readonly fiber: FiberRpcClient;
  private readonly currency: FiberCurrency;
  private readonly resources: Map<string, ResourceSpec>;

  /** Active sessions indexed by session_id */
  private readonly sessions: Map<string, StreamingSession> = new Map();

  constructor(config: StreamingConfig) {
    this.fiber = config.fiber;
    this.currency = config.currency;
    this.resources = new Map();
    for (const r of config.resources) {
      this.resources.set(r.name, r);
    }

    // Expire sessions every minute
    const timer = setInterval(() => this.expireSessions(), 60_000);
    if (timer.unref) timer.unref();
  }

  /** Get available resources for discovery */
  getResources(): ResourceSpec[] {
    return [...this.resources.values()];
  }

  // ─────────────────────────────────────────────────────────
  //  Start Session
  // ─────────────────────────────────────────────────────────

  /**
   * Create and fund a streaming session.
   * Returns session info + Fiber Hold Invoice for the consumer to pay.
   */
  async startSession(params: {
    consumer_id: string;
    resource_name: string;
    budget: string;
    timeout_seconds?: number;
  }): Promise<{
    session_id: string;
    invoice: string;
    payment_hash: string;
    resource: ResourceSpec;
    budget: string;
    expires_at: number;
  }> {
    const resource = this.resources.get(params.resource_name);
    if (!resource) {
      const available = [...this.resources.keys()].join(', ');
      throw new Error(`Resource '${params.resource_name}' not found. Available: ${available}`);
    }

    if (BigInt(params.budget) <= 0n) {
      throw new Error('Budget must be > 0');
    }

    // Create session (generates preimage + hash)
    const session = createSession(params.consumer_id, resource, {
      device_id: 'provider',
      resource_name: params.resource_name,
      budget: params.budget,
      timeout_seconds: params.timeout_seconds || 3600,
    });

    // Create Hold Invoice on Fiber for the full budget
    const { invoice_address } = await this.fiber.newInvoice({
      amount: params.budget,
      currency: this.currency,
      payment_hash: session.payment_hash as Hash256,
      description: `Stream: ${resource.name} (${resource.type})`,
      expiry: (params.timeout_seconds || 3600) + 300, // session timeout + 5min buffer
    });

    session.invoice_address = invoice_address;
    this.sessions.set(session.session_id, session);

    return {
      session_id: session.session_id,
      invoice: invoice_address,
      payment_hash: session.payment_hash,
      resource,
      budget: params.budget,
      expires_at: session.expires_at,
    };
  }

  // ─────────────────────────────────────────────────────────
  //  Activate (after payment received)
  // ─────────────────────────────────────────────────────────

  /**
   * Activate a session after verifying payment is locked on Fiber.
   */
  async activateSession(sessionId: string): Promise<{ status: string }> {
    const session = this.getSession(sessionId);

    // Verify payment on Fiber
    const invoiceStatus = await this.fiber.getInvoice({
      payment_hash: session.payment_hash as Hash256,
    });

    if (invoiceStatus.status !== 'Received') {
      throw new Error(`Payment not received. Status: ${invoiceStatus.status}`);
    }

    const activated = activateSession(session);
    this.sessions.set(sessionId, activated);
    return { status: 'active' };
  }

  // ─────────────────────────────────────────────────────────
  //  Tick (record consumption)
  // ─────────────────────────────────────────────────────────

  /**
   * Record resource consumption.
   * Returns updated session state with cost breakdown.
   */
  tickSession(sessionId: string, units: string): {
    total_units: string;
    total_cost: string;
    budget_remaining: string;
    ticks: number;
  } {
    const session = this.getSession(sessionId);
    const updated = tick(session, units);
    this.sessions.set(sessionId, updated);

    return {
      total_units: updated.total_units,
      total_cost: updated.total_cost,
      budget_remaining: getSessionBudgetRemaining(updated),
      ticks: updated.usage_log.length,
    };
  }

  // ─────────────────────────────────────────────────────────
  //  Settle (pay actual, refund remainder)
  // ─────────────────────────────────────────────────────────

  /**
   * Settle a session: pay actual consumed cost, refund the rest.
   */
  async settleSession(sessionId: string): Promise<SettlementResult> {
    const session = this.getSession(sessionId);
    const result = settleSession(session);

    // Settle on Fiber — reveal preimage
    await this.fiber.settleInvoice({
      payment_hash: session.payment_hash as Hash256,
      payment_preimage: session.preimage!,
    });

    const settled = markSettled(session);
    this.sessions.set(sessionId, settled);

    return result;
  }

  // ─────────────────────────────────────────────────────────
  //  Cancel (full refund)
  // ─────────────────────────────────────────────────────────

  /**
   * Cancel a session: refund full budget to consumer.
   */
  async cancelStreamSession(sessionId: string): Promise<{ refunded: string }> {
    const session = this.getSession(sessionId);

    // Cancel invoice on Fiber
    await this.fiber.cancelInvoice({
      payment_hash: session.payment_hash as Hash256,
    });

    const cancelled = cancelSession(session);
    this.sessions.set(sessionId, cancelled);

    return { refunded: session.budget };
  }

  // ─────────────────────────────────────────────────────────
  //  Query
  // ─────────────────────────────────────────────────────────

  /**
   * Get session status.
   */
  getSessionStatus(sessionId: string): {
    session_id: string;
    status: string;
    total_units: string;
    total_cost: string;
    budget_remaining: string;
    ticks: number;
    expired: boolean;
  } {
    const session = this.getSession(sessionId);
    return {
      session_id: session.session_id,
      status: session.status,
      total_units: session.total_units,
      total_cost: session.total_cost,
      budget_remaining: getSessionBudgetRemaining(session),
      ticks: session.usage_log.length,
      expired: isSessionExpired(session),
    };
  }

  // ─────────────────────────────────────────────────────────
  //  Internals
  // ─────────────────────────────────────────────────────────

  private getSession(sessionId: string): StreamingSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  private expireSessions(): void {
    for (const [id, session] of this.sessions) {
      if (session.status === 'active' && isSessionExpired(session)) {
        // Auto-cancel expired sessions
        this.sessions.set(id, cancelSession(session));
        // Best-effort cancel invoice
        this.fiber.cancelInvoice({
          payment_hash: session.payment_hash as Hash256,
        }).catch(() => {});
      }
      // Remove long-dead sessions (settled/cancelled > 1h ago)
      if (
        (session.status === 'settled' || session.status === 'cancelled') &&
        session.settled_at && Date.now() - session.settled_at > 3600_000
      ) {
        this.sessions.delete(id);
      }
    }
  }
}
