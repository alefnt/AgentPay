/**
 * AgentPay Hub �?Database Layer
 *
 * SQLite storage for:
 * - Agent registrations (API keys, pubkeys, metadata)
 * - Transaction history (payments sent/received)
 * - Rate limiting state
 */

import Database from 'better-sqlite3';
import { randomBytes, createHash } from 'node:crypto';
import type { AssetType } from '@agentpay-dev/core';

// ══════════════════════════════════════════════════════════�?//  Types
// ══════════════════════════════════════════════════════════�?
export interface AgentRecord {
  id: string;
  api_key_hash: string;
  pubkey: string;
  name: string;
  created_at: string;
  balance_ckb: string;
  status: 'active' | 'suspended';
}

export interface TransactionRecord {
  id: string;
  agent_id: string;
  type: 'sent' | 'received';
  amount: string;
  asset: AssetType;
  provider_url: string;
  service: string;
  payment_hash: string;
  status: 'pending' | 'success' | 'failed';
  created_at: string;
  completed_at: string | null;
}

// ══════════════════════════════════════════════════════════�?//  Database
// ══════════════════════════════════════════════════════════�?
export class HubDatabase {
  private db: Database.Database;

  constructor(dbPath: string = './hub.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        api_key_hash TEXT UNIQUE NOT NULL,
        pubkey TEXT DEFAULT '',
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        balance_ckb TEXT NOT NULL DEFAULT '0',
        status TEXT NOT NULL DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('sent', 'received')),
        amount TEXT NOT NULL,
        asset TEXT NOT NULL DEFAULT 'CKB',
        provider_url TEXT NOT NULL DEFAULT '',
        service TEXT NOT NULL DEFAULT '',
        payment_hash TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        FOREIGN KEY (agent_id) REFERENCES agents(id)
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_agent ON transactions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

      CREATE TABLE IF NOT EXISTS rate_limits (
        agent_id TEXT NOT NULL,
        window TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (agent_id, window)
      );
    `);
  }

  // ─── Agent Management ──────────────────────────────────

  /**
   * Register a new Agent and return the API key.
   * The API key is returned only once �?we store only the hash.
   */
  registerAgent(name: string): { agentId: string; apiKey: string } {
    const agentId = `ag_${randomBytes(12).toString('hex')}`;
    const apiKeyRaw = `ap_${randomBytes(24).toString('hex')}`;
    const apiKeyHash = createHash('sha256').update(apiKeyRaw).digest('hex');

    this.db.prepare(`
      INSERT INTO agents (id, api_key_hash, name) VALUES (?, ?, ?)
    `).run(agentId, apiKeyHash, name);

    return { agentId, apiKey: apiKeyRaw };
  }

  /**
   * Look up Agent by API key.
   */
  getAgentByApiKey(apiKey: string): AgentRecord | undefined {
    const hash = createHash('sha256').update(apiKey).digest('hex');
    return this.db.prepare(`
      SELECT * FROM agents WHERE api_key_hash = ? AND status = 'active'
    `).get(hash) as AgentRecord | undefined;
  }

  getAgentById(agentId: string): AgentRecord | undefined {
    return this.db.prepare(`
      SELECT * FROM agents WHERE id = ?
    `).get(agentId) as AgentRecord | undefined;
  }

  updateAgentPubkey(agentId: string, pubkey: string): void {
    this.db.prepare(`UPDATE agents SET pubkey = ? WHERE id = ?`).run(pubkey, agentId);
  }

  // ─── Transactions ──────────────────────────────────────

  createTransaction(tx: Omit<TransactionRecord, 'created_at' | 'completed_at'>): void {
    this.db.prepare(`
      INSERT INTO transactions (id, agent_id, type, amount, asset, provider_url, service, payment_hash, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tx.id, tx.agent_id, tx.type, tx.amount, tx.asset, tx.provider_url, tx.service, tx.payment_hash, tx.status);
  }

  completeTransaction(id: string, status: 'success' | 'failed'): void {
    this.db.prepare(`
      UPDATE transactions SET status = ?, completed_at = datetime('now') WHERE id = ?
    `).run(status, id);
  }

  getTransactions(agentId: string, options?: { limit?: number; offset?: number; status?: string }): {
    transactions: TransactionRecord[];
    total: number;
  } {
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;
    let where = 'WHERE agent_id = ?';
    const params: any[] = [agentId];

    if (options?.status) {
      where += ' AND status = ?';
      params.push(options.status);
    }

    const total = (this.db.prepare(`SELECT COUNT(*) as count FROM transactions ${where}`).get(...params) as any).count;
    const transactions = this.db.prepare(`
      SELECT * FROM transactions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as TransactionRecord[];

    return { transactions, total };
  }

  // ─── Rate Limiting ─────────────────────────────────────

  checkRateLimit(agentId: string, maxPerMinute: number = 60): boolean {
    const window = new Date().toISOString().slice(0, 16); // minute precision

    const row = this.db.prepare(`
      SELECT count FROM rate_limits WHERE agent_id = ? AND window = ?
    `).get(agentId, window) as { count: number } | undefined;

    if (!row) {
      this.db.prepare(`
        INSERT INTO rate_limits (agent_id, window, count) VALUES (?, ?, 1)
      `).run(agentId, window);
      return true;
    }

    if (row.count >= maxPerMinute) {
      return false;
    }

    this.db.prepare(`
      UPDATE rate_limits SET count = count + 1 WHERE agent_id = ? AND window = ?
    `).run(agentId, window);
    return true;
  }

  /**
   * Clean up old rate limit windows (call periodically).
   */
  cleanupRateLimits(): void {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString().slice(0, 16);
    this.db.prepare(`DELETE FROM rate_limits WHERE window < ?`).run(cutoff);
  }

  close(): void {
    this.db.close();
  }
}
