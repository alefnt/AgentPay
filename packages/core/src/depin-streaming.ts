/**
 * AgentPay DePIN — Streaming Micropayment Manager
 *
 * Manages streaming payment sessions between consumers and devices.
 * Uses Fiber Hold Invoices for atomic budget locking + per-unit metering.
 *
 * Flow:
 *   1. createSession() — lock budget via Hold Invoice
 *   2. tick()          — record each unit consumed
 *   3. settle()        — finalize: pay actual, refund remainder
 *   4. cancel()        — abort: refund entire budget
 */

import { randomBytes, createHash } from 'node:crypto';
import type {
  StreamingSession,
  ResourceSpec,
  ResourceUsage,
  CreateSessionOptions,
  SettlementResult,
  SessionStatus,
} from './depin-types.js';
import { calculateCost, exceedsBudget, createUsageProof } from './depin-metering.js';

// ═══════════════════════════════════════════════════════════
//  Session Factory
// ═══════════════════════════════════════════════════════════

/**
 * Create a new streaming payment session.
 *
 * This generates a preimage+hash pair for the Hold Invoice.
 * The consumer locks `budget` via the invoice; the provider can only
 * settle for the actual consumed amount.
 */
export function createSession(
  consumerId: string,
  resource: ResourceSpec,
  options: CreateSessionOptions,
): StreamingSession {
  const preimage = randomBytes(32);
  const hash = createHash('sha256').update(preimage).digest('hex');
  const timeoutMs = (options.timeout_seconds || 3600) * 1000;
  const now = Date.now();

  return {
    session_id: `depin_${randomBytes(8).toString('hex')}`,
    consumer_id: consumerId,
    provider_device_id: options.device_id,
    resource,
    payment_hash: `0x${hash}`,
    preimage: `0x${preimage.toString('hex')}`,
    status: 'pending',
    budget: options.budget,
    total_units: '0',
    total_cost: '0',
    usage_log: [],
    created_at: now,
    expires_at: now + timeoutMs,
  };
}

// ═══════════════════════════════════════════════════════════
//  Session Lifecycle
// ═══════════════════════════════════════════════════════════

/**
 * Activate a session after the Hold Invoice has been paid.
 */
export function activateSession(session: StreamingSession): StreamingSession {
  if (session.status !== 'pending') {
    throw new Error(`Cannot activate session in '${session.status}' state`);
  }
  return { ...session, status: 'active' };
}

/**
 * Record a unit of resource consumption ("tick").
 *
 * @param session - Current session state
 * @param units - Units consumed in this tick
 * @returns Updated session with usage record appended
 * @throws If cost exceeds budget
 */
export function tick(session: StreamingSession, units: string): StreamingSession {
  if (session.status !== 'active') {
    throw new Error(`Cannot tick session in '${session.status}' state`);
  }

  // Check expiry
  if (Date.now() > session.expires_at) {
    return { ...session, status: 'expired' };
  }

  const tickCost = calculateCost(units, session.resource);
  const newCumulativeUnits = (BigInt(session.total_units) + BigInt(units)).toString();
  const newCumulativeCost = (BigInt(session.total_cost) + BigInt(tickCost)).toString();

  // Budget protection
  if (exceedsBudget(newCumulativeCost, session.budget)) {
    throw new Error(
      `Budget exceeded: ${newCumulativeCost} > ${session.budget}. ` +
      `Session ${session.session_id} cannot consume more.`,
    );
  }

  const usage: ResourceUsage = {
    session_id: session.session_id,
    device_id: session.provider_device_id,
    resource_type: session.resource.type,
    units,
    cumulative_units: newCumulativeUnits,
    cost: tickCost,
    cumulative_cost: newCumulativeCost,
    timestamp: Date.now(),
  };

  // Generate proof
  usage.proof = createUsageProof(usage);

  return {
    ...session,
    total_units: newCumulativeUnits,
    total_cost: newCumulativeCost,
    usage_log: [...session.usage_log, usage],
  };
}

/**
 * Settle a session: pay actual cost, calculate refund.
 *
 * In practice, the provider calls `settleInvoice(hash, preimage)`
 * on Fiber, which releases `total_cost` to the provider.
 * The remainder (`budget - total_cost`) is refunded to consumer.
 */
export function settleSession(session: StreamingSession): SettlementResult {
  if (session.status !== 'active') {
    throw new Error(`Cannot settle session in '${session.status}' state`);
  }

  const paid = session.total_cost;
  const refunded = (BigInt(session.budget) - BigInt(paid)).toString();

  return {
    session_id: session.session_id,
    paid,
    refunded,
    units_consumed: session.total_units,
    payment_hash: session.payment_hash,
  };
}

/**
 * Mark a session as settled (immutable state transition).
 */
export function markSettled(session: StreamingSession): StreamingSession {
  return { ...session, status: 'settled', settled_at: Date.now() };
}

/**
 * Cancel a session: full refund to consumer.
 */
export function cancelSession(session: StreamingSession): StreamingSession {
  if (session.status === 'settled') {
    throw new Error('Cannot cancel a settled session');
  }
  return { ...session, status: 'cancelled', settled_at: Date.now() };
}

// ═══════════════════════════════════════════════════════════
//  Session Queries
// ═══════════════════════════════════════════════════════════

/** Get the current cost of a session */
export function getSessionCost(session: StreamingSession): string {
  return session.total_cost;
}

/** Get remaining budget */
export function getSessionBudgetRemaining(session: StreamingSession): string {
  const rem = BigInt(session.budget) - BigInt(session.total_cost);
  return rem < 0n ? '0' : rem.toString();
}

/** Check if session has expired */
export function isSessionExpired(session: StreamingSession): boolean {
  return Date.now() > session.expires_at;
}

/** Get session duration in seconds */
export function getSessionDuration(session: StreamingSession): number {
  const endTime = session.settled_at || Date.now();
  return Math.floor((endTime - session.created_at) / 1000);
}
