/**
 * Tests for Rate Limiter
 */

import { describe, it, expect, afterEach } from 'vitest';
import { RateLimiter, createRateLimiter } from '../src/rate-limiter.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Create a mock IncomingMessage */
function mockReq(ip: string = '127.0.0.1', apiKey?: string): IncomingMessage {
  const headers: Record<string, string> = {};
  if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;
  return {
    headers,
    socket: { remoteAddress: ip },
  } as unknown as IncomingMessage;
}

/** Create a mock ServerResponse that captures writes */
function mockRes(): ServerResponse & { _status?: number; _headers: Record<string, string>; _body?: string } {
  const res = {
    _headers: {} as Record<string, string>,
    writeHead(status: number, headers?: Record<string, string>) {
      res._status = status;
      if (headers) Object.assign(res._headers, headers);
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value;
    },
    end(body?: string) {
      res._body = body;
    },
  } as any;
  return res;
}

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.destroy();
  });

  it('should allow requests under the limit', () => {
    limiter = new RateLimiter({ ipLimit: 5, windowMs: 60_000 });
    const req = mockReq('10.0.0.1');

    for (let i = 0; i < 5; i++) {
      const res = mockRes();
      expect(limiter.check(req, res)).toBe(true);
    }
  });

  it('should block requests over the IP limit', () => {
    limiter = new RateLimiter({ ipLimit: 3, windowMs: 60_000 });
    const req = mockReq('10.0.0.2');

    // First 3 should pass
    for (let i = 0; i < 3; i++) {
      expect(limiter.check(req, mockRes())).toBe(true);
    }
    // 4th should be blocked
    const res = mockRes();
    expect(limiter.check(req, res)).toBe(false);
    expect(res._status).toBe(429);
    expect(res._headers['Retry-After']).toBeDefined();
  });

  it('should track different IPs independently', () => {
    limiter = new RateLimiter({ ipLimit: 2, windowMs: 60_000 });

    const req1 = mockReq('10.0.0.1');
    const req2 = mockReq('10.0.0.2');

    // IP1: 2 requests
    expect(limiter.check(req1, mockRes())).toBe(true);
    expect(limiter.check(req1, mockRes())).toBe(true);
    expect(limiter.check(req1, mockRes())).toBe(false);

    // IP2 should still be allowed
    expect(limiter.check(req2, mockRes())).toBe(true);
    expect(limiter.check(req2, mockRes())).toBe(true);
    expect(limiter.check(req2, mockRes())).toBe(false);
  });

  it('should enforce API key limit', () => {
    limiter = new RateLimiter({ ipLimit: 100, apiKeyLimit: 2, windowMs: 60_000 });
    const req = mockReq('10.0.0.1', 'my-api-key');

    expect(limiter.check(req, mockRes())).toBe(true);
    expect(limiter.check(req, mockRes())).toBe(true);
    expect(limiter.check(req, mockRes())).toBe(false);
  });

  it('should set rate limit headers on allowed requests', () => {
    limiter = new RateLimiter({ ipLimit: 10, windowMs: 60_000 });
    const req = mockReq('10.0.0.3');
    const res = mockRes();

    limiter.check(req, res);

    expect(res._headers['X-RateLimit-Limit']).toBe('10');
    expect(res._headers['X-RateLimit-Remaining']).toBe('9');
  });

  it('should return 429 with JSON error body', () => {
    limiter = new RateLimiter({ ipLimit: 1, windowMs: 60_000 });
    const req = mockReq('10.0.0.4');

    limiter.check(req, mockRes()); // First OK
    const res = mockRes();
    limiter.check(req, res); // Second blocked

    expect(res._status).toBe(429);
    expect(res._body).toBeDefined();
    const body = JSON.parse(res._body!);
    expect(body.error).toBe('Too many requests');
    expect(body.retry_after_seconds).toBeGreaterThan(0);
  });

  it('should handle x-forwarded-for header', () => {
    limiter = new RateLimiter({ ipLimit: 1, windowMs: 60_000 });

    const req = {
      headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18' },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as IncomingMessage;

    expect(limiter.check(req, mockRes())).toBe(true);
    expect(limiter.check(req, mockRes())).toBe(false);

    // Different forwarded IP should be allowed
    const req2 = {
      headers: { 'x-forwarded-for': '203.0.113.51' },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as IncomingMessage;
    expect(limiter.check(req2, mockRes())).toBe(true);
  });

  it('should report stats', () => {
    limiter = new RateLimiter({ ipLimit: 10, windowMs: 60_000 });
    limiter.check(mockReq('10.0.0.1'), mockRes());
    limiter.check(mockReq('10.0.0.2'), mockRes());
    limiter.check(mockReq('10.0.0.1', 'key1'), mockRes());

    const stats = limiter.getStats();
    expect(stats.trackedIps).toBe(2);
    expect(stats.trackedKeys).toBe(1);
  });

  it('createRateLimiter should return a function', () => {
    const check = createRateLimiter({ ipLimit: 5, windowMs: 60_000 });
    expect(typeof check).toBe('function');
    expect(check(mockReq('10.0.0.1'), mockRes())).toBe(true);
  });
});
