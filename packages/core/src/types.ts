/**
 * AgentPay Core — Protocol Types
 *
 * All types grounded in official Fiber Network RPC documentation:
 * https://github.com/nervosnetwork/fiber/blob/develop/crates/fiber-lib/src/rpc/README.md
 */

// ═══════════════════════════════════════════════════════════
//  CKB / Fiber Native Types
// ═══════════════════════════════════════════════════════════

/** CKB Script (lock or type) */
export interface Script {
  code_hash: string;
  hash_type: 'type' | 'data' | 'data1' | 'data2';
  args: string;
}

/** CKB OutPoint */
export interface OutPoint {
  tx_hash: string;
  index: string;
}

/** Hex-encoded 256-bit hash */
export type Hash256 = string;

/** Hex-encoded secp256k1 compressed public key (33 bytes) */
export type Pubkey = string;

/** Fiber currency identifiers */
export type FiberCurrency = 'Fibb' | 'Fibt' | 'Fibd';

// ═══════════════════════════════════════════════════════════
//  Fiber Channel Types (from RPC docs)
// ═══════════════════════════════════════════════════════════

export type ChannelState =
  | { NegotiatingFunding: string[] }
  | { CollaboratingFundingTx: string[] }
  | { SigningCommitment: string[] }
  | { AwaitingTxSignatures: string[] }
  | { AwaitingChannelReady: string[] }
  | { ChannelReady: null }
  | { ShuttingDown: string[] }
  | { ClosingPending: string[] }
  | { Closed: string[] };

export interface FiberChannel {
  channel_id: Hash256;
  is_public: boolean;
  is_acceptor: boolean;
  is_one_way: boolean;
  channel_outpoint?: OutPoint;
  pubkey: Pubkey;
  funding_udt_type_script?: Script;
  state: ChannelState;
  local_balance: string;    // u128 hex
  offered_tlc_balance: string;
  remote_balance: string;
  received_tlc_balance: string;
  pending_tlcs: FiberHtlc[];
  latest_commitment_transaction_hash?: string;
  created_at: string;       // u64 ms epoch
  enabled: boolean;
  tlc_expiry_delta: string;
  tlc_fee_proportional_millionths: string;
  shutdown_transaction_hash?: string;
  failure_detail?: string;
}

export interface FiberHtlc {
  id: string;
  amount: string;
  payment_hash: Hash256;
  status: string;
}

// ═══════════════════════════════════════════════════════════
//  Fiber Invoice Types
// ═══════════════════════════════════════════════════════════

export interface CkbInvoice {
  currency: FiberCurrency;
  amount: string;
  signature?: string;
  data: InvoiceData;
}

export interface InvoiceData {
  timestamp: string;
  payment_hash: Hash256;
  attrs: InvoiceAttribute[];
}

export type InvoiceAttribute =
  | { ExpiryTime: { secs: number; nanos: number } }
  | { Description: string }
  | { FinalHtlcTimeout: string }
  | { FallbackAddr: string }
  | { UdtScript: Script }
  | { PayeePublicKey: Pubkey }
  | { HashAlgorithm: 'sha256' | 'ckb_hash' };

export type CkbInvoiceStatus = 'Open' | 'Cancelled' | 'Received' | 'Paid' | 'Expired';

// ═══════════════════════════════════════════════════════════
//  Fiber Payment Types
// ═══════════════════════════════════════════════════════════

export type PaymentStatus = 'Created' | 'Sending' | 'Success' | 'Failed';

export interface PaymentResult {
  payment_hash: Hash256;
  status: PaymentStatus;
  created_at: string;
  last_updated_at: string;
  failed_error?: string;
  fee: string;
  custom_records?: Record<string, string>;
  routers: SessionRoute[];
}

export interface SessionRoute {
  nodes: SessionRouteNode[];
}

export interface SessionRouteNode {
  pubkey: Pubkey;
  amount: string;
  channel_outpoint?: OutPoint;
}

// ═══════════════════════════════════════════════════════════
//  Fiber Cch (Cross-Chain Hub) Types
// ═══════════════════════════════════════════════════════════

export type CchOrderStatus =
  | 'Pending'
  | 'InFlight'
  | 'Succeeded'
  | 'Failed';

export interface CchOrder {
  timestamp: string;
  expiry_delta_seconds: string;
  wrapped_btc_type_script: Script;
  incoming_invoice: CchInvoice;
  outgoing_pay_req: string;
  payment_hash: Hash256;
  amount_sats: string;
  fee_sats: string;
  status: CchOrderStatus;
}

export interface CchInvoice {
  invoice: string;         // encoded invoice string
  final_tlc_expiry_delta: string;
}

// ═══════════════════════════════════════════════════════════
//  AgentPay Protocol Types
// ═══════════════════════════════════════════════════════════

/** Agent ID = node pubkey identifier */
export type AgentId = Pubkey;

/**
 * Supported asset types.
 *
 * On CKB/Fiber, all tokens except native CKB are UDTs,
 * differentiated by their `udt_type_script`.
 * We define well-known names for common assets.
 */
export type AssetType =
  | 'CKB'          // Native CKB (1 CKB = 10^8 shannons)
  | 'BTC'          // Bitcoin (via Cch/Lightning, 1 BTC = 10^8 sats)
  | 'USDT'         // Tether USD (UDT on CKB via RGB++)
  | 'USDC'         // Circle USD (UDT on CKB, future)
  | 'USDI'         // USDI stablecoin (UDT on CKB, native)
  | 'WBTC'         // Wrapped BTC (UDT on CKB via RGB++)
  | 'CUSTOM_UDT';  // Any other user-defined UDT (requires type script)

/** AgentPay protocol message types */
export type MessageType =
  | 'SERVICE_REQUEST'
  | 'SERVICE_OFFER'
  | 'TASK_INPUT'
  | 'TASK_RESULT'
  | 'ERROR';

/** Protocol message envelope */
export interface ProtocolMessage<T = unknown> {
  protocol: 'agentpay/1.0';
  id: string;
  timestamp: number;
  from: AgentId;
  to: AgentId;
  signature: string;
  type: MessageType;
  payload: T;
}

/** Service request from Caller to Provider */
export interface ServiceRequestPayload {
  service: string;
  input_preview?: Record<string, unknown>;
  budget: {
    max_amount: string;   // shannons or sats
    asset: AssetType;
  };
  requirements?: {
    max_latency_ms?: number;
    min_reputation?: number;
  };
}

/** Service offer from Provider to Caller */
export interface ServiceOfferPayload {
  request_id: string;
  price: string;          // shannons or sats
  asset: AssetType;
  hold_invoice: string;   // Fiber invoice address (hold invoice)
  estimated_time_ms: number;
  offer_ttl_seconds: number;
}

/** Task input from Caller to Provider (after payment lock) */
export interface TaskInputPayload {
  offer_id: string;
  payment_hash: Hash256;  // payment hash sent via send_payment
  input: unknown;
}

/** Task result from Provider to Caller */
export interface TaskResultPayload {
  output: unknown;
  settled: boolean;       // true = provider already settled on Fiber (preimage never exposed)
  payment_hash: Hash256;  // caller can verify settlement via fiber.getPayment()
  execution_time_ms: number;
  proof_hash: string;     // sha256(output) — proves output integrity
}

/** Error payload */
export interface ErrorPayload {
  code: number;
  message: string;
  details?: unknown;
}

// ═══════════════════════════════════════════════════════════
//  Service Specification
// ═══════════════════════════════════════════════════════════

export interface ServiceSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  pricing: ServicePricing;
  sla?: ServiceSLA;
}

export interface ServicePricing {
  model: 'per-call' | 'per-token' | 'per-second';
  amount: string;         // shannons
  asset: AssetType;
}

export interface ServiceSLA {
  max_latency_ms: number;
  uptime?: number;
  max_retries?: number;
}

// ═══════════════════════════════════════════════════════════
//  Agent Registration
// ═══════════════════════════════════════════════════════════

export interface AgentRegistration {
  pubkey: Pubkey;
  name: string;
  version: string;
  description?: string;
  services: ServiceSpec[];
  endpoints: string[];    // HTTP endpoints
  fiber_peer_id?: string; // Fiber P2P address
  registered_at: number;
}
