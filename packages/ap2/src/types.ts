/**
 * AP2 Types — Google Agent Payments Protocol W3C Verifiable Credential types
 *
 * Based on: https://github.com/google-agentic-commerce/AP2
 * Spec: W3C Verifiable Credentials Data Model v1.1
 *
 * These types define the Mandate lifecycle:
 *   IntentMandate → PaymentMandate → Receipt
 *
 * AgentPay mapping:
 *   IntentMandate  ≈  Service Request
 *   PaymentMandate ≈  Hold Invoice (lock funds)
 *   Receipt        ≈  Settled Invoice (preimage revealed)
 */

// ═══════════════════════════════════════════════════════════
//  W3C Verifiable Credential Base
// ═══════════════════════════════════════════════════════════

/** W3C VC proof (simplified — Ed25519Signature2020) */
export interface VCProof {
  type: 'Ed25519Signature2020';
  created: string;          // ISO 8601
  verificationMethod: string; // DID + key fragment, e.g. "did:bit:alice.bit#key-1"
  proofPurpose: 'assertionMethod';
  proofValue: string;       // base64url encoded signature
}

/** Base Verifiable Credential structure */
export interface VerifiableCredential<T extends string, S = Record<string, unknown>> {
  '@context': readonly string[];
  id: string;               // unique credential ID (urn:uuid:...)
  type: readonly ['VerifiableCredential', T];
  issuer: string;           // DID of the issuer
  issuanceDate: string;     // ISO 8601
  expirationDate?: string;  // ISO 8601
  credentialSubject: S;
  proof: VCProof;
}

// ═══════════════════════════════════════════════════════════
//  AP2 Mandate Types
// ═══════════════════════════════════════════════════════════

/** Intent Mandate — captures user/agent's intent to pay for a service */
export interface IntentSubject {
  /** What the agent wants (e.g. "translate text to Chinese") */
  intent: string;
  /** Maximum budget in smallest unit (e.g. shannons for CKB, sats for BTC) */
  maxAmount: string;
  /** Currency code */
  currency: 'CKB' | 'BTC' | 'RUSD' | string;
  /** Service provider identifier (optional) */
  provider?: string;
  /** Additional parameters for the service */
  params?: Record<string, unknown>;
}

export type IntentMandate = VerifiableCredential<'IntentMandate', IntentSubject>;

/** Payment Mandate — authorizes a specific payment (maps to Hold Invoice) */
export interface PaymentSubject {
  /** Reference to the intent mandate that triggered this payment */
  intentMandateId: string;
  /** Exact amount to pay (in smallest unit) */
  amount: string;
  /** Currency code */
  currency: 'CKB' | 'BTC' | 'RUSD' | string;
  /** Payment hash (HTLC/PTLC — links to Fiber Hold Invoice) */
  paymentHash: string;
  /** Payee DID */
  payee: string;
  /** Invoice expiry (seconds from issuance) */
  expiryDelta: number;
}

export type PaymentMandate = VerifiableCredential<'PaymentMandate', PaymentSubject>;

/** Receipt — proof that payment was completed (maps to settled invoice) */
export interface ReceiptSubject {
  /** Reference to the payment mandate */
  paymentMandateId: string;
  /** Preimage that proves payment (Hold Invoice settlement proof) */
  preimage: string;
  /** Amount paid */
  amount: string;
  /** Currency */
  currency: string;
  /** Service result summary (optional) */
  resultSummary?: string;
}

export type Receipt = VerifiableCredential<'Receipt', ReceiptSubject>;

// ═══════════════════════════════════════════════════════════
//  AP2 Adapter Config
// ═══════════════════════════════════════════════════════════

export interface AP2AdapterConfig {
  /** Agent's DID (e.g. "did:bit:alice.bit") */
  agentDid: string;
  /** Ed25519 signing key (hex) for VC proof */
  signingKeyHex: string;
  /** Fiber RPC URL */
  fiberRpcUrl?: string;
}

// ═══════════════════════════════════════════════════════════
//  AP2 Error
// ═══════════════════════════════════════════════════════════

export class AP2Error extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_MANDATE' | 'EXPIRED' | 'SIGNATURE_INVALID' | 'PAYMENT_FAILED',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AP2Error';
  }
}
