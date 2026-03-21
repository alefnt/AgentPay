/**
 * AgentPay — Rate Limiter
 *
 * IP + API Key level rate limiting for HTTP servers.
 * Uses a sliding-window counter backed by an in-memory Map.
 *
 * Features:
 *   - Per-IP rate limiting (default: 100 req/min)
 *   - Per-API-Key rate limiting (default: 1000 req/min)
 *   - Configurable windows and limits
 *   - Automatic cleanup of expired entries
 *   - HTTP 429 response with Retry-After header
 *
 * Zero external dependencies.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

// ╔════════════════════════════════════════════════════════════════╗
//  Types
// ╚════════════════════════════════════════════════════════════════╝

export interface RateLimitConfig {
  /** Max requests per window per IP (default: 100) */
  ipLimit?: number;
  /** Max requests per window per API key (default: 1000) */
  apiKeyLimit?: number;
  /** Window duration in milliseconds (default: 60_000 = 1 minute) */
  windowMs?: number;
  /** How to extract API key from request (default: Authorization header) */
  keyExtractor?: (req: IncomingMessage) => string | undefined;
  /** Custom response when rate limited (default: JSON 429) */
  onRateLimited?: (req: IncomingMessage, res: ServerResponse, retryAfterMs: number) => void;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

// ╔════════════════════════════════════════════════════════════════╗
//  Rate Limiter Class
// ╚════════════════════════════════════════════════════════════════╝

export class RateLimiter {
  private readonly ipLimit: number;
  private readonly apiKeyLimit: number;
  private readonly windowMs: number;
  private readonly keyExtractor: (req: IncomingMessage) => string | undefined;
  private readonly onRateLimited: (req: IncomingMessage, res: ServerResponse, retryAfterMs: number) => void;

  private readonly ipWindows: Map<string, WindowEntry> = new Map();
  private readonly keyWindows: Map<string, WindowEntry> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(config: RateLimitConfig = {}) {
    this.ipLimit = config.ipLimit ?? 100;
    this.apiKeyLimit = config.apiKeyLimit ?? 1000;
    this.windowMs = config.windowMs ?? 60_000;
    this.keyExtractor = config.keyExtractor ?? defaultKeyExtractor;
    this.onRateLimited = config.onRateLimited ?? defaultOnRateLimited;

    // Cleanup expired entries every 5 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * Check if a request should be rate limited.
   * Returns true if the request is ALLOWED, false if rate limited.
   *
   * When rate limited, automatically sends HTTP 429 response.
   */
  check(req: IncomingMessage, res: ServerResponse): boolean {
    const now = Date.now();
    const ip = getClientIp(req);

    // Check IP limit
    if (ip) {
      const ipEntry = this.getOrCreate(this.ipWindows, `ip:${ip}`, now);
      if (ipEntry.count >= this.ipLimit) {
        const retryAfter = ipEntry.resetAt - now;
        this.onRateLimited(req, res, retryAfter);
        return false;
      }
      ipEntry.count++;
    }

    // Check API key limit
    const apiKey = this.keyExtractor(req);
    if (apiKey) {
      const keyEntry = this.getOrCreate(this.keyWindows, `key:${apiKey}`, now);
      if (keyEntry.count >= this.apiKeyLimit) {
        const retryAfter = keyEntry.resetAt - now;
        this.onRateLimited(req, res, retryAfter);
        return false;
      }
      keyEntry.count++;
    }

    // Set rate limit headers
    const remaining = ip
      ? Math.max(0, this.ipLimit - (this.ipWindows.get(`ip:${ip}`)?.count ?? 0))
      : this.ipLimit;
    res.setHeader('X-RateLimit-Limit', String(this.ipLimit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    return true;
  }

  /** Get current stats (for monitoring) */
  getStats(): { trackedIps: number; trackedKeys: number } {
    return {
      trackedIps: this.ipWindows.size,
      trackedKeys: this.keyWindows.size,
    };
  }

  /** Cleanup and release resources */
  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.ipWindows.clear();
    this.keyWindows.clear();
  }

  // ── Internal ──

  private getOrCreate(map: Map<string, WindowEntry>, key: string, now: number): WindowEntry {
    let entry = map.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs };
      map.set(key, entry);
    }
    return entry;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.ipWindows) {
      if (now >= entry.resetAt) this.ipWindows.delete(key);
    }
    for (const [key, entry] of this.keyWindows) {
      if (now >= entry.resetAt) this.keyWindows.delete(key);
    }
  }
}

// ╔════════════════════════════════════════════════════════════════╗
//  Helpers
// ╚════════════════════════════════════════════════════════════════╝

function getClientIp(req: IncomingMessage): string {
  // Check forwarded headers (reverse proxy)
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]!.trim();
  }
  // Fall back to socket address
  return req.socket?.remoteAddress || 'unknown';
}

function defaultKeyExtractor(req: IncomingMessage): string | undefined {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7); // Strip "Bearer "
  }
  // Also check x-api-key header
  const apiKey = req.headers['x-api-key'];
  return typeof apiKey === 'string' ? apiKey : undefined;
}

function defaultOnRateLimited(
  _req: IncomingMessage,
  res: ServerResponse,
  retryAfterMs: number,
): void {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  res.writeHead(429, {
    'Content-Type': 'application/json',
    'Retry-After': String(retryAfterSec),
    'X-RateLimit-Remaining': '0',
  });
  res.end(JSON.stringify({
    error: 'Too many requests',
    retry_after_seconds: retryAfterSec,
  }));
}

/**
 * Create a rate limiter middleware function.
 * Convenience wrapper for use with Node.js HTTP servers.
 *
 * @example
 * ```ts
 * const limiter = createRateLimiter({ ipLimit: 50, windowMs: 60_000 });
 *
 * const server = createServer((req, res) => {
 *   if (!limiter(req, res)) return; // Rate limited — response already sent
 *   // Handle request...
 * });
 * ```
 */
export function createRateLimiter(config: RateLimitConfig = {}): (req: IncomingMessage, res: ServerResponse) => boolean {
  const rl = new RateLimiter(config);
  return (req, res) => rl.check(req, res);
}
