/**
 * AgentPay DePIN — Type Definitions
 *
 * Core types for Decentralized Physical Infrastructure payments.
 * Enables device-to-device streaming micropayments via Fiber Network.
 */

// ═══════════════════════════════════════════════════════════
//  Device Types
// ═══════════════════════════════════════════════════════════

/** Physical infrastructure resource categories */
export type DeviceType =
  | 'compute'    // CPU/GPU compute
  | 'gpu'        // GPU-specific (AI inference, rendering)
  | 'storage'    // Disk/SSD storage
  | 'bandwidth'  // Network bandwidth
  | 'sensor'     // IoT sensor data
  | 'energy'     // Energy grid
  | 'wireless'   // WiFi/5G coverage
  | 'custom';    // User-defined

/** Metering unit for resource consumption */
export type ResourceUnit =
  | 'flops'      // Floating point operations
  | 'tokens'     // AI tokens (inference)
  | 'bytes'      // Storage bytes
  | 'mbps'       // Bandwidth megabits/sec
  | 'records'    // Data records (sensor)
  | 'seconds'    // Compute seconds
  | 'kwh'        // Energy kilowatt-hours
  | 'requests'   // API requests
  | 'custom';    // User-defined

/** Session lifecycle states */
export type SessionStatus =
  | 'pending'    // Created, not yet funded
  | 'active'     // Funded and consuming
  | 'settled'    // Completed and paid
  | 'cancelled'  // Cancelled, funds refunded
  | 'expired';   // Timed out, auto-refunded

// ═══════════════════════════════════════════════════════════
//  Resource Specification
// ═══════════════════════════════════════════════════════════

/** How a device prices its resource */
export interface ResourceSpec {
  /** Resource category */
  type: DeviceType;
  /** Human-readable name (e.g. "A100 GPU Inference") */
  name: string;
  /** Metering unit */
  unit: ResourceUnit;
  /** Price per unit in shannons (smallest denomination) */
  price_per_unit: string;
  /** Payment asset (CKB, RUSD, etc.) */
  asset: string;
  /** Minimum purchase quantity */
  min_purchase?: string;
  /** Maximum available supply (optional capacity limit) */
  max_supply?: string;
  /** Human-readable description */
  description?: string;
}

// ═══════════════════════════════════════════════════════════
//  Device Identity
// ═══════════════════════════════════════════════════════════

/** A physical device registered on the AgentPay network */
export interface DeviceIdentity {
  /** Unique device ID (typically Fiber node_id) */
  device_id: string;
  /** Device type category */
  device_type: DeviceType;
  /** Owner's public key or .bit name */
  owner: string;
  /** Resources this device offers */
  capabilities: ResourceSpec[];
  /** Optional geographic location */
  location?: DeviceLocation;
  /** Device metadata (firmware, model, etc.) */
  metadata?: Record<string, string>;
  /** Registration timestamp (ms) */
  registered_at: number;
  /** Last heartbeat timestamp (ms) */
  last_seen: number;
  /** Online status */
  online: boolean;
}

/** Geographic location for proximity-based discovery */
export interface DeviceLocation {
  lat: number;
  lon: number;
  region?: string;   // e.g. "us-east-1", "eu-west"
  country?: string;  // ISO 3166-1 alpha-2
}

// ═══════════════════════════════════════════════════════════
//  Resource Usage & Metering
// ═══════════════════════════════════════════════════════════

/** A single metering record (one "tick" of consumption) */
export interface ResourceUsage {
  /** Session this usage belongs to */
  session_id: string;
  /** Provider device ID */
  device_id: string;
  /** Resource type consumed */
  resource_type: DeviceType;
  /** Units consumed in this tick */
  units: string;
  /** Cumulative units consumed so far */
  cumulative_units: string;
  /** Cost of this tick (shannons) */
  cost: string;
  /** Cumulative cost so far (shannons) */
  cumulative_cost: string;
  /** Timestamp of this measurement */
  timestamp: number;
  /** SHA-256 hash proof of this usage record */
  proof?: string;
}

// ═══════════════════════════════════════════════════════════
//  Streaming Payment Session
// ═══════════════════════════════════════════════════════════

/**
 * A streaming micropayment session between consumer and device.
 *
 * Flow:
 *   1. Consumer locks budget via Hold Invoice
 *   2. Device provides resource, calling tick() for each unit
 *   3. On completion: settle actual cost, refund remainder
 *   4. On failure/timeout: cancel and refund all
 */
export interface StreamingSession {
  /** Unique session ID */
  session_id: string;
  /** Consumer's Fiber node_id */
  consumer_id: string;
  /** Provider device's ID */
  provider_device_id: string;
  /** Resource being consumed */
  resource: ResourceSpec;
  /** Fiber Hold Invoice payment_hash */
  payment_hash: string;
  /** Hold Invoice preimage (provider-side only) */
  preimage?: string;
  /** Fiber invoice address */
  invoice_address?: string;
  /** Session state */
  status: SessionStatus;
  /** Locked budget (max the consumer will pay) */
  budget: string;
  /** Total units consumed so far */
  total_units: string;
  /** Total cost accumulated so far */
  total_cost: string;
  /** Usage log */
  usage_log: ResourceUsage[];
  /** Session creation time (ms) */
  created_at: number;
  /** Session expiry time (ms) — auto-cancel after this */
  expires_at: number;
  /** Settlement time (ms) — when settled/cancelled */
  settled_at?: number;
}

// ═══════════════════════════════════════════════════════════
//  Session Creation Options
// ═══════════════════════════════════════════════════════════

/** Options for creating a new streaming session */
export interface CreateSessionOptions {
  /** Provider device ID */
  device_id: string;
  /** Resource to consume (by name) */
  resource_name: string;
  /** Maximum budget in shannons */
  budget: string;
  /** Payment asset */
  asset?: string;
  /** Session timeout in seconds (default: 3600) */
  timeout_seconds?: number;
}

/** Result of settling a session */
export interface SettlementResult {
  session_id: string;
  /** Actual amount paid to provider */
  paid: string;
  /** Amount refunded to consumer */
  refunded: string;
  /** Total units consumed */
  units_consumed: string;
  /** Fiber payment_hash */
  payment_hash: string;
}
