/**
 * AP2 Package — Google Agent Payments Protocol compatibility for AgentPay
 *
 * Maps AP2 Mandates (W3C Verifiable Credentials) to Fiber Hold Invoices.
 * Uses .bit DID for Agent identity.
 *
 * @example
 * ```ts
 * import { AP2Adapter, verifyVCSignature } from '@agentpay/ap2';
 *
 * const adapter = new AP2Adapter({
 *   agentDid: 'did:bit:my-agent.bit',
 *   signingKeyHex: '...',
 * });
 *
 * // Create mandate (as buyer)
 * const mandate = await adapter.createIntentMandate({
 *   intent: 'translate text',
 *   maxAmount: '1000000000',
 *   currency: 'CKB',
 * });
 *
 * // Process mandate (as seller)
 * const request = adapter.processIntentMandate(incomingMandate);
 * ```
 */

export { AP2Adapter } from './adapter.js';
export { verifyVCSignature, signVC } from './verify.js';
export type {
  IntentMandate,
  IntentSubject,
  PaymentMandate,
  PaymentSubject,
  Receipt,
  ReceiptSubject,
  VerifiableCredential,
  VCProof,
  AP2AdapterConfig,
} from './types.js';
export { AP2Error } from './types.js';
