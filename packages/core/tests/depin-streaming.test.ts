/**
 * DePIN Streaming Tests
 *
 * Tests for streaming payment session lifecycle:
 * create → activate → tick → settle/cancel.
 */

import { describe, it, expect } from 'vitest';
import {
  createSession,
  activateSession,
  tick,
  settleSession,
  markSettled,
  cancelSession,
  getSessionCost,
  getSessionBudgetRemaining,
  getSessionDuration,
} from '../src/depin-streaming.js';
import type { ResourceSpec, CreateSessionOptions } from '../src/depin-types.js';

const GPU_SPEC: ResourceSpec = {
  type: 'gpu',
  name: 'A100 GPU Inference',
  unit: 'tokens',
  price_per_unit: '100000',  // 0.001 CKB per token
  asset: 'CKB',
};

const SESSION_OPTS: CreateSessionOptions = {
  device_id: 'device_gpu_001',
  resource_name: 'A100 GPU Inference',
  budget: '100000000',   // 1 CKB budget
  timeout_seconds: 3600,
};

describe('DePIN Streaming: createSession', () => {
  it('should create a pending session with preimage', () => {
    const session = createSession('consumer_001', GPU_SPEC, SESSION_OPTS);

    expect(session.session_id).toMatch(/^depin_[0-9a-f]{16}$/);
    expect(session.status).toBe('pending');
    expect(session.consumer_id).toBe('consumer_001');
    expect(session.provider_device_id).toBe('device_gpu_001');
    expect(session.payment_hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(session.preimage).toMatch(/^0x[0-9a-f]{64}$/);
    expect(session.budget).toBe('100000000');
    expect(session.total_units).toBe('0');
    expect(session.total_cost).toBe('0');
    expect(session.usage_log).toHaveLength(0);
  });

  it('should set correct expiry', () => {
    const session = createSession('consumer_001', GPU_SPEC, {
      ...SESSION_OPTS,
      timeout_seconds: 60,
    });
    const expectedExpiry = session.created_at + 60000;
    expect(session.expires_at).toBe(expectedExpiry);
  });
});

describe('DePIN Streaming: activateSession', () => {
  it('should activate a pending session', () => {
    const session = createSession('consumer_001', GPU_SPEC, SESSION_OPTS);
    const active = activateSession(session);
    expect(active.status).toBe('active');
  });

  it('should reject activation of non-pending session', () => {
    const session = createSession('consumer_001', GPU_SPEC, SESSION_OPTS);
    const active = activateSession(session);
    expect(() => activateSession(active)).toThrow("Cannot activate session in 'active' state");
  });
});

describe('DePIN Streaming: tick', () => {
  it('should record usage and accumulate cost', () => {
    let session = createSession('consumer_001', GPU_SPEC, SESSION_OPTS);
    session = activateSession(session);

    // Tick 1: 100 tokens × 100K shannons = 10M shannons
    session = tick(session, '100');
    expect(session.total_units).toBe('100');
    expect(session.total_cost).toBe('10000000');
    expect(session.usage_log).toHaveLength(1);
    expect(session.usage_log[0].proof).toBeDefined();

    // Tick 2: 200 more tokens
    session = tick(session, '200');
    expect(session.total_units).toBe('300');
    expect(session.total_cost).toBe('30000000');
    expect(session.usage_log).toHaveLength(2);
  });

  it('should throw when budget exceeded', () => {
    let session = createSession('consumer_001', GPU_SPEC, {
      ...SESSION_OPTS,
      budget: '10000000',  // only 0.1 CKB
    });
    session = activateSession(session);

    // 100 tokens = 10M shannons — exactly at budget
    session = tick(session, '100');

    // 1 more token would exceed budget
    expect(() => tick(session, '1')).toThrow('Budget exceeded');
  });

  it('should reject tick on non-active session', () => {
    const session = createSession('consumer_001', GPU_SPEC, SESSION_OPTS);
    expect(() => tick(session, '10')).toThrow("Cannot tick session in 'pending' state");
  });
});

describe('DePIN Streaming: settle', () => {
  it('should settle and calculate refund', () => {
    let session = createSession('consumer_001', GPU_SPEC, SESSION_OPTS);
    session = activateSession(session);
    session = tick(session, '100');  // 10M cost
    session = tick(session, '200');  // 30M cumulative

    const result = settleSession(session);
    expect(result.paid).toBe('30000000');
    expect(result.refunded).toBe('70000000');  // 100M - 30M
    expect(result.units_consumed).toBe('300');
    expect(result.payment_hash).toBe(session.payment_hash);
  });

  it('should mark session as settled', () => {
    let session = createSession('consumer_001', GPU_SPEC, SESSION_OPTS);
    session = activateSession(session);
    session = tick(session, '50');
    session = markSettled(session);
    expect(session.status).toBe('settled');
    expect(session.settled_at).toBeDefined();
  });
});

describe('DePIN Streaming: cancel', () => {
  it('should cancel an active session', () => {
    let session = createSession('consumer_001', GPU_SPEC, SESSION_OPTS);
    session = activateSession(session);
    session = cancelSession(session);
    expect(session.status).toBe('cancelled');
  });

  it('should cancel a pending session', () => {
    const session = createSession('consumer_001', GPU_SPEC, SESSION_OPTS);
    const cancelled = cancelSession(session);
    expect(cancelled.status).toBe('cancelled');
  });

  it('should reject cancel on settled session', () => {
    let session = createSession('consumer_001', GPU_SPEC, SESSION_OPTS);
    session = activateSession(session);
    session = markSettled(session);
    expect(() => cancelSession(session)).toThrow('Cannot cancel a settled session');
  });
});

describe('DePIN Streaming: queries', () => {
  it('should return session cost and remaining budget', () => {
    let session = createSession('consumer_001', GPU_SPEC, SESSION_OPTS);
    session = activateSession(session);
    session = tick(session, '100');  // 10M

    expect(getSessionCost(session)).toBe('10000000');
    expect(getSessionBudgetRemaining(session)).toBe('90000000');
  });

  it('should calculate session duration', () => {
    let session = createSession('consumer_001', GPU_SPEC, SESSION_OPTS);
    // Manually set created_at 5 seconds ago
    session.created_at = Date.now() - 5000;
    const duration = getSessionDuration(session);
    expect(duration).toBeGreaterThanOrEqual(4);
    expect(duration).toBeLessThanOrEqual(6);
  });
});
