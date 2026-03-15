/**
 * AgentPay Registry — Database Layer
 *
 * Extracted from server.ts for testability.
 * SQLite storage for Agent service discovery.
 */

import Database from 'better-sqlite3';
import type { ServiceSpec } from '@agentpay/core';

// ═══════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════

export interface AgentRow {
  pubkey: string;
  name: string;
  description: string;
  endpoint: string;
  version: string;
  bit_name: string;
  registered_at: string;
  last_heartbeat: string;
  status: string;
}

export interface ServiceRow {
  id: number;
  agent_pubkey: string;
  name: string;
  description: string;
  pricing_model: string;
  pricing_amount: string;
  pricing_asset: string;
  input_schema: string;
  output_schema: string;
  max_latency_ms: number;
}

// ═══════════════════════════════════════════════════════════
//  Database
// ═══════════════════════════════════════════════════════════

export class RegistryDatabase {
  private db: Database.Database;

  constructor(dbPath: string = './registry.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        pubkey TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        endpoint TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '0.1.0',
        bit_name TEXT DEFAULT '',
        registered_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_heartbeat TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_pubkey TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        pricing_model TEXT NOT NULL DEFAULT 'per-call',
        pricing_amount TEXT NOT NULL DEFAULT '0',
        pricing_asset TEXT NOT NULL DEFAULT 'CKB',
        input_schema TEXT NOT NULL DEFAULT '{}',
        output_schema TEXT NOT NULL DEFAULT '{}',
        max_latency_ms INTEGER DEFAULT 5000,
        FOREIGN KEY (agent_pubkey) REFERENCES agents(pubkey) ON DELETE CASCADE,
        UNIQUE(agent_pubkey, name)
      );

      CREATE INDEX IF NOT EXISTS idx_services_name ON services(name);
      CREATE INDEX IF NOT EXISTS idx_services_asset ON services(pricing_asset);
    `);
  }

  upsertAgent(agent: {
    pubkey: string;
    name: string;
    description?: string;
    endpoint: string;
    version?: string;
    bit_name?: string;
    services: ServiceSpec[];
  }): void {
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO agents (pubkey, name, description, endpoint, version, bit_name)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(pubkey) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          endpoint = excluded.endpoint,
          version = excluded.version,
          bit_name = excluded.bit_name,
          last_heartbeat = datetime('now'),
          status = 'active'
      `).run(
        agent.pubkey, agent.name, agent.description || '',
        agent.endpoint, agent.version || '0.1.0', agent.bit_name || '',
      );

      this.db.prepare(`DELETE FROM services WHERE agent_pubkey = ?`).run(agent.pubkey);
      const insertService = this.db.prepare(`
        INSERT INTO services (agent_pubkey, name, description, pricing_model, pricing_amount, pricing_asset, input_schema, output_schema, max_latency_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const svc of agent.services) {
        insertService.run(
          agent.pubkey, svc.name, svc.description,
          svc.pricing.model, svc.pricing.amount, svc.pricing.asset,
          JSON.stringify(svc.input_schema), JSON.stringify(svc.output_schema),
          svc.sla?.max_latency_ms || 5000,
        );
      }
    });
    tx();
  }

  getAgent(pubkey: string): (AgentRow & { services: ServiceRow[] }) | null {
    const agent = this.db.prepare(`SELECT * FROM agents WHERE pubkey = ? AND status = 'active'`).get(pubkey) as AgentRow | undefined;
    if (!agent) return null;
    const services = this.db.prepare(`SELECT * FROM services WHERE agent_pubkey = ?`).all(pubkey) as ServiceRow[];
    return { ...agent, services };
  }

  listAgents(filters?: { service?: string; asset?: string; limit?: number }): Array<AgentRow & { services: ServiceRow[] }> {
    const limit = filters?.limit || 50;
    let query = `SELECT DISTINCT a.* FROM agents a`;
    const params: any[] = [];

    if (filters?.service || filters?.asset) {
      query += ` JOIN services s ON s.agent_pubkey = a.pubkey`;
      const conditions: string[] = [`a.status = 'active'`];
      if (filters.service) { conditions.push(`s.name LIKE ?`); params.push(`%${filters.service}%`); }
      if (filters.asset) { conditions.push(`s.pricing_asset = ?`); params.push(filters.asset); }
      query += ` WHERE ${conditions.join(' AND ')}`;
    } else {
      query += ` WHERE a.status = 'active'`;
    }

    query += ` ORDER BY a.last_heartbeat DESC LIMIT ?`;
    params.push(limit);

    const agents = this.db.prepare(query).all(...params) as AgentRow[];
    return agents.map((agent) => {
      const services = this.db.prepare(`SELECT * FROM services WHERE agent_pubkey = ?`).all(agent.pubkey) as ServiceRow[];
      return { ...agent, services };
    });
  }

  searchServices(filters?: { name?: string; asset?: string; max_price?: string }): Array<ServiceRow & { agent_endpoint: string; agent_name: string }> {
    let query = `
      SELECT s.*, a.endpoint as agent_endpoint, a.name as agent_name
      FROM services s JOIN agents a ON s.agent_pubkey = a.pubkey
      WHERE a.status = 'active'
    `;
    const params: any[] = [];

    if (filters?.name) { query += ` AND s.name LIKE ?`; params.push(`%${filters.name}%`); }
    if (filters?.asset) { query += ` AND s.pricing_asset = ?`; params.push(filters.asset); }
    if (filters?.max_price) { query += ` AND CAST(s.pricing_amount AS INTEGER) <= ?`; params.push(parseInt(filters.max_price)); }

    query += ` ORDER BY CAST(s.pricing_amount AS INTEGER) ASC LIMIT 50`;
    return this.db.prepare(query).all(...params) as any[];
  }

  updateHeartbeat(pubkey: string): boolean {
    const result = this.db.prepare(
      `UPDATE agents SET last_heartbeat = datetime('now') WHERE pubkey = ? AND status = 'active'`,
    ).run(pubkey);
    return result.changes > 0;
  }

  deleteAgent(pubkey: string): boolean {
    const result = this.db.prepare(`UPDATE agents SET status = 'inactive' WHERE pubkey = ?`).run(pubkey);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
