/**
 * AP2 Adapter — Maps Google AP2 Mandates ↔ Fiber Hold Invoices
 *
 * This is the core bridge between the Google Agent ecosystem (AP2/A2A)
 * and AgentPay's Fiber Network payment channels.
 *
 * Lifecycle mapping:
 *   AP2 IntentMandate  →  AgentPay Service Request
 *   AP2 PaymentMandate →  Fiber Hold Invoice (HTLC lock)
 *   AP2 Receipt        ←  Fiber Invoice Settlement (preimage)
 *
 * Design principle: THIN COMPATIBILITY LAYER
 * We only translate formats. All payment logic stays in Fiber.
 */

import { randomUUID } from 'node:crypto';
import type {
  IntentMandate,
  IntentSubject,
  PaymentMandate,
  PaymentSubject,
  Receipt,
  ReceiptSubject,
  AP2AdapterConfig,
} from './types.js';
import { AP2Error } from './types.js';
import { signVC } from './verify.js';

export class AP2Adapter {
  private readonly did: string;
  private readonly signingKeyHex: string;

  constructor(config: AP2AdapterConfig) {
    this.did = config.agentDid;
    this.signingKeyHex = config.signingKeyHex;
  }

  // ─── Create Mandates (Agent as buyer) ─────────────────

  /**
   * Create an Intent Mandate for a service request.
   * This is the first step in the AP2 payment flow.
   *
   * @example
   * ```ts
   * const mandate = await adapter.createIntentMandate({
   *   intent: 'translate text to Chinese',
   *   maxAmount: '1000000000', // 10 CKB
   *   currency: 'CKB',
   *   params: { text: 'Hello World', target: 'zh' },
   * });
   * ```
   */
  async createIntentMandate(subject: IntentSubject): Promise<IntentMandate> {
    const unsignedVC = {
      '@context': ['https://www.w3.org/2018/credentials/v1'] as [string],
      id: `urn:uuid:${randomUUID()}`,
      type: ['VerifiableCredential', 'IntentMandate'] as ['VerifiableCredential', 'IntentMandate'],
      issuer: this.did,
      issuanceDate: new Date().toISOString(),
      expirationDate: new Date(Date.now() + 3600_000).toISOString(), // 1 hour
      credentialSubject: subject,
    };

    const proof = await signVC(unsignedVC as any, this.signingKeyHex, `${this.did}#key-1`);
    return { ...unsignedVC, proof } as IntentMandate;
  }

  // ─── Process Mandates (Agent as seller) ───────────────

  /**
   * Process an incoming Intent Mandate from a Google AP2 agent.
   * Returns the extracted service request parameters.
   *
   * Validates: format, expiry, required fields.
   * Does NOT verify signature (call verifyVCSignature separately for that).
   */
  processIntentMandate(mandate: IntentMandate): {
    intent: string;
    maxAmount: string;
    currency: string;
    params: Record<string, unknown>;
    buyerDid: string;
    mandateId: string;
  } {
    // Validate type
    if (!mandate.type?.includes('IntentMandate')) {
      throw new AP2Error('Not an IntentMandate', 'INVALID_MANDATE');
    }

    // Validate expiry
    if (mandate.expirationDate && new Date(mandate.expirationDate) < new Date()) {
      throw new AP2Error('Mandate has expired', 'EXPIRED');
    }

    // Validate required fields
    const { intent, maxAmount, currency, params } = mandate.credentialSubject;
    if (!intent || !maxAmount || !currency) {
      throw new AP2Error('Missing required fields: intent, maxAmount, currency', 'INVALID_MANDATE');
    }

    return {
      intent,
      maxAmount,
      currency,
      params: params ?? {},
      buyerDid: mandate.issuer,
      mandateId: mandate.id,
    };
  }

  // ─── Payment Mandate (Hold Invoice wrapper) ───────────

  /**
   * Create a Payment Mandate that wraps a Fiber Hold Invoice.
   * Called after creating the Hold Invoice, before sending to buyer.
   *
   * @param intentMandateId - ID of the original Intent Mandate
   * @param paymentHash - Fiber Hold Invoice payment hash (HTLC)
   * @param amount - Exact amount (smallest unit)
   * @param currency - Currency code
   * @param payeeDid - Seller's DID
   * @param expiryDelta - Invoice expiry in seconds
   */
  async createPaymentMandate(
    intentMandateId: string,
    paymentHash: string,
    amount: string,
    currency: string,
    payeeDid: string,
    expiryDelta: number = 3600,
  ): Promise<PaymentMandate> {
    const subject: PaymentSubject = {
      intentMandateId,
      amount,
      currency,
      paymentHash,
      payee: payeeDid,
      expiryDelta,
    };

    const unsignedVC = {
      '@context': ['https://www.w3.org/2018/credentials/v1'] as [string],
      id: `urn:uuid:${randomUUID()}`,
      type: ['VerifiableCredential', 'PaymentMandate'] as ['VerifiableCredential', 'PaymentMandate'],
      issuer: this.did,
      issuanceDate: new Date().toISOString(),
      expirationDate: new Date(Date.now() + expiryDelta * 1000).toISOString(),
      credentialSubject: subject,
    };

    const proof = await signVC(unsignedVC as any, this.signingKeyHex, `${this.did}#key-1`);
    return { ...unsignedVC, proof } as PaymentMandate;
  }

  // ─── Receipt (Settlement proof) ───────────────────────

  /**
   * Create a Receipt after a Hold Invoice is settled.
   * The preimage proves payment was completed.
   */
  async createReceipt(
    paymentMandateId: string,
    preimage: string,
    amount: string,
    currency: string,
    resultSummary?: string,
  ): Promise<Receipt> {
    const subject: ReceiptSubject = {
      paymentMandateId,
      preimage,
      amount,
      currency,
      resultSummary,
    };

    const unsignedVC = {
      '@context': ['https://www.w3.org/2018/credentials/v1'] as [string],
      id: `urn:uuid:${randomUUID()}`,
      type: ['VerifiableCredential', 'Receipt'] as ['VerifiableCredential', 'Receipt'],
      issuer: this.did,
      issuanceDate: new Date().toISOString(),
      credentialSubject: subject,
    };

    const proof = await signVC(unsignedVC as any, this.signingKeyHex, `${this.did}#key-1`);
    return { ...unsignedVC, proof } as Receipt;
  }
}
