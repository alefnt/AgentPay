/**
 * AP2 Adapter Tests
 *
 * Tests the AP2 Mandate ↔ Fiber Hold Invoice mapping.
 */

import { describe, it, expect } from 'vitest';
import { AP2Adapter, AP2Error } from '../src/index.js';
import type { IntentMandate } from '../src/index.js';

// Test signing key (Ed25519, 64 bytes hex = 128 chars)
const TEST_KEY_HEX = '0'.repeat(128);
const TEST_DID = 'did:bit:test-agent.bit';

describe('AP2Adapter', () => {
  const adapter = new AP2Adapter({
    agentDid: TEST_DID,
    signingKeyHex: TEST_KEY_HEX,
  });

  describe('createIntentMandate', () => {
    it('creates valid Intent Mandate with W3C VC structure', async () => {
      const mandate = await adapter.createIntentMandate({
        intent: 'translate text to Chinese',
        maxAmount: '1000000000',
        currency: 'CKB',
        params: { text: 'Hello', target: 'zh' },
      });

      // W3C VC structure
      expect(mandate['@context']).toContain('https://www.w3.org/2018/credentials/v1');
      expect(mandate.type).toContain('VerifiableCredential');
      expect(mandate.type).toContain('IntentMandate');
      expect(mandate.issuer).toBe(TEST_DID);
      expect(mandate.id).toMatch(/^urn:uuid:/);
      expect(mandate.issuanceDate).toBeTruthy();
      expect(mandate.expirationDate).toBeTruthy();

      // Subject
      expect(mandate.credentialSubject.intent).toBe('translate text to Chinese');
      expect(mandate.credentialSubject.maxAmount).toBe('1000000000');
      expect(mandate.credentialSubject.currency).toBe('CKB');
      expect(mandate.credentialSubject.params).toEqual({ text: 'Hello', target: 'zh' });

      // Proof
      expect(mandate.proof.type).toBe('Ed25519Signature2020');
      expect(mandate.proof.proofPurpose).toBe('assertionMethod');
      expect(mandate.proof.verificationMethod).toBe(`${TEST_DID}#key-1`);
      expect(mandate.proof.proofValue).toBeTruthy();
    });
  });

  describe('processIntentMandate', () => {
    it('extracts service request from valid mandate', async () => {
      const mandate = await adapter.createIntentMandate({
        intent: 'summarize article',
        maxAmount: '500000000',
        currency: 'RUSD',
      });

      const request = adapter.processIntentMandate(mandate);

      expect(request.intent).toBe('summarize article');
      expect(request.maxAmount).toBe('500000000');
      expect(request.currency).toBe('RUSD');
      expect(request.buyerDid).toBe(TEST_DID);
      expect(request.mandateId).toMatch(/^urn:uuid:/);
    });

    it('rejects mandate without IntentMandate type', () => {
      const badMandate = {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        id: 'urn:uuid:test',
        type: ['VerifiableCredential', 'OtherType'],
        issuer: TEST_DID,
        issuanceDate: new Date().toISOString(),
        credentialSubject: { intent: 'test', maxAmount: '100', currency: 'CKB' },
        proof: { type: 'Ed25519Signature2020', created: '', verificationMethod: '', proofPurpose: 'assertionMethod' as const, proofValue: '' },
      };

      expect(() => adapter.processIntentMandate(badMandate as unknown as IntentMandate)).toThrow(AP2Error);
    });

    it('rejects expired mandate', async () => {
      const mandate = await adapter.createIntentMandate({
        intent: 'test',
        maxAmount: '100',
        currency: 'CKB',
      });

      // Manually expire it
      (mandate as any).expirationDate = new Date(Date.now() - 1000).toISOString();

      expect(() => adapter.processIntentMandate(mandate)).toThrow('expired');
    });
  });

  describe('createPaymentMandate', () => {
    it('creates Payment Mandate wrapping a Hold Invoice', async () => {
      const paymentHash = '0x' + 'ab'.repeat(32);
      const mandate = await adapter.createPaymentMandate(
        'urn:uuid:intent-123',
        paymentHash,
        '500000000',
        'CKB',
        'did:bit:provider.bit',
        3600,
      );

      expect(mandate.type).toContain('PaymentMandate');
      expect(mandate.credentialSubject.intentMandateId).toBe('urn:uuid:intent-123');
      expect(mandate.credentialSubject.paymentHash).toBe(paymentHash);
      expect(mandate.credentialSubject.amount).toBe('500000000');
      expect(mandate.credentialSubject.payee).toBe('did:bit:provider.bit');
    });
  });

  describe('createReceipt', () => {
    it('creates Receipt with preimage proof', async () => {
      const preimage = '0x' + 'cd'.repeat(32);
      const receipt = await adapter.createReceipt(
        'urn:uuid:payment-456',
        preimage,
        '500000000',
        'CKB',
        'Translation completed successfully',
      );

      expect(receipt.type).toContain('Receipt');
      expect(receipt.credentialSubject.paymentMandateId).toBe('urn:uuid:payment-456');
      expect(receipt.credentialSubject.preimage).toBe(preimage);
      expect(receipt.credentialSubject.resultSummary).toBe('Translation completed successfully');
    });
  });
});
