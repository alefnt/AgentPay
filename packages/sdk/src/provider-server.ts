/**
 * AgentPay SDK — Provider HTTP Server Layer
 *
 * Handles HTTP concerns: routing, CORS, body parsing, rate limiting.
 * Delegates protocol logic to ProtocolHandler.
 *
 * This is the outermost layer of the refactored ServiceProvider.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';

// ── Inline RateLimiter (self-contained to avoid core dist dependency) ──

interface RateLimitConfig {
  ipLimit?: number;
  apiKeyLimit?: number;
  windowMs?: number;
}

interface WindowEntry { count: number; resetAt: number; }

class RateLimiter {
  private ipLimit: number;
  private apiKeyLimit: number;
  private windowMs: number;
  private ipW: Map<string, WindowEntry> = new Map();
  private keyW: Map<string, WindowEntry> = new Map();
  private timer: ReturnType<typeof setInterval>;

  constructor(c: RateLimitConfig = {}) {
    this.ipLimit = c.ipLimit ?? 100;
    this.apiKeyLimit = c.apiKeyLimit ?? 1000;
    this.windowMs = c.windowMs ?? 60_000;
    this.timer = setInterval(() => this.cleanup(), 5 * 60_000);
    if (this.timer.unref) this.timer.unref();
  }

  check(req: IncomingMessage, res: ServerResponse): boolean {
    const now = Date.now();
    const ip = (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]!.trim()
      : req.socket?.remoteAddress) || 'unknown';

    const ipE = this.getOrCreate(this.ipW, `ip:${ip}`, now);
    if (ipE.count >= this.ipLimit) {
      this.send429(res, ipE.resetAt - now);
      return false;
    }
    ipE.count++;

    const auth = req.headers['authorization'];
    const apiKey = (auth && typeof auth === 'string' && auth.startsWith('Bearer '))
      ? auth.slice(7) : (typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : undefined);
    if (apiKey) {
      const keyE = this.getOrCreate(this.keyW, `key:${apiKey}`, now);
      if (keyE.count >= this.apiKeyLimit) { this.send429(res, keyE.resetAt - now); return false; }
      keyE.count++;
    }

    res.setHeader('X-RateLimit-Limit', String(this.ipLimit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, this.ipLimit - ipE.count)));
    return true;
  }

  destroy() { clearInterval(this.timer); this.ipW.clear(); this.keyW.clear(); }

  private getOrCreate(m: Map<string, WindowEntry>, k: string, now: number) {
    let e = m.get(k);
    if (!e || now >= e.resetAt) { e = { count: 0, resetAt: now + this.windowMs }; m.set(k, e); }
    return e;
  }

  private send429(res: ServerResponse, retryMs: number) {
    const sec = Math.ceil(retryMs / 1000);
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(sec) });
    res.end(JSON.stringify({ error: 'Too many requests', retry_after_seconds: sec }));
  }

  private cleanup() {
    const now = Date.now();
    for (const [k, e] of this.ipW) if (now >= e.resetAt) this.ipW.delete(k);
    for (const [k, e] of this.keyW) if (now >= e.resetAt) this.keyW.delete(k);
  }
}

// ╔════════════════════════════════════════════════════════════════╗
//  Types
// ╚════════════════════════════════════════════════════════════════╝

export interface ServerConfig {
  /** Max request body size in bytes (default: 1MB) */
  maxBodySize?: number;
  /** Enable CORS headers (default: true) */
  cors?: boolean;
  /** Rate limit config (default: 100 req/min per IP) */
  rateLimit?: RateLimitConfig | false;
}

export type RouteHandler = (body: string, req: IncomingMessage) => Promise<{ status: number; headers?: Record<string, string>; body: unknown }>;

// ╔════════════════════════════════════════════════════════════════╗
//  ProviderServer Class
// ╚════════════════════════════════════════════════════════════════╝

export class ProviderServer {
  private readonly maxBodySize: number;
  private readonly corsEnabled: boolean;
  private readonly rateLimiter: RateLimiter | null;
  private readonly routes: Map<string, RouteHandler> = new Map();
  private server: Server | null = null;

  constructor(config: ServerConfig = {}) {
    this.maxBodySize = config.maxBodySize ?? 1_048_576; // 1MB
    this.corsEnabled = config.cors !== false;

    if (config.rateLimit !== false) {
      this.rateLimiter = new RateLimiter(config.rateLimit ?? {
        ipLimit: 100,
        apiKeyLimit: 1000,
        windowMs: 60_000,
      });
    } else {
      this.rateLimiter = null;
    }
  }

  /**
   * Register a route handler.
   * @param path - URL path (e.g., '/agentpay/request')
   * @param handler - Async handler returning { status, body }
   */
  route(path: string, handler: RouteHandler): this {
    this.routes.set(path, handler);
    return this;
  }

  /**
   * Start listening on the given port.
   */
  listen(port: number, hostname: string = '0.0.0.0'): Promise<Server> {
    return new Promise((resolve) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(port, hostname, () => {
        console.log(`[AgentPay Server] Listening on ${hostname}:${port}`);
        resolve(this.server!);
      });
    });
  }

  /** Get the underlying HTTP server (for testing) */
  getServer(): Server | null {
    return this.server;
  }

  /** Close the server */
  close(): void {
    this.server?.close();
    this.rateLimiter?.destroy();
  }

  // ── Internal ──

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS
    if (this.corsEnabled) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    // Rate limiting
    if (this.rateLimiter && !this.rateLimiter.check(req, res)) {
      return; // 429 already sent
    }

    // Health check
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/health' && req.method === 'GET') {
      this.sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
      return;
    }

    // Route matching
    const handler = this.routes.get(url.pathname);
    if (!handler) {
      // Check for wildcard x402 prefix routes
      const x402Handler = this.routes.get('/x402/*');
      if (x402Handler && url.pathname.startsWith('/x402/')) {
        // x402 allows GET (with or without X-Payment) and POST
        if (req.method !== 'GET' && req.method !== 'POST') {
          this.sendJson(res, 405, { error: 'Method not allowed. Use GET or POST.' });
          return;
        }
        try {
          // Pass the full URL and query params as body context
          const bodyStr = req.method === 'POST' ? await this.readBody(req) : JSON.stringify({
            _path: url.pathname,
            _query: Object.fromEntries(url.searchParams),
          });
          const result = await x402Handler(bodyStr, req);
          // Apply custom headers if present
          if (result.headers) {
            for (const [k, v] of Object.entries(result.headers)) {
              res.setHeader(k, v);
            }
          }
          this.sendJson(res, result.status, result.body);
        } catch (err: any) {
          console.error('[AgentPay Server] x402 error:', err.message);
          this.sendJson(res, 500, { error: err.message || 'Internal server error' });
        }
        return;
      }
      this.sendJson(res, 404, { error: `Route not found: ${url.pathname}` });
      return;
    }

    if (req.method !== 'POST') {
      this.sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
      return;
    }

    // Body parsing
    try {
      const body = await this.readBody(req);
      const result = await handler(body, req);
      this.sendJson(res, result.status, result.body);
    } catch (err: any) {
      if (err.message?.includes('exceeds max size')) {
        this.sendJson(res, 413, { error: err.message });
      } else {
        console.error('[AgentPay Server] Error:', err.message);
        this.sendJson(res, 500, { error: err.message || 'Internal server error' });
      }
    }
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > this.maxBodySize) {
          req.destroy();
          reject(new Error(`Request body exceeds max size (${this.maxBodySize} bytes)`));
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });
  }

  private sendJson(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }
}
