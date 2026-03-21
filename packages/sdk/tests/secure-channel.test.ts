/**
 * Tests for SecureChannel — ZK Preimage Proof + ECDH + Message Signatures
 *
 * End-to-end security layer tests:
 *   1. Message signing and verification (secp256k1 ECDSA)
 *   2. Secure result creation and verification (ZK proof)
 *   3. Preimage recovery via ECDH encrypted channel
 *   4. Attack resistance: tampered messages, wrong keys, replay
 */

import { describe, it, expect } from 'vitest';
import { createECDH, createHash, randomBytes } from 'node:crypto';
import { SecureChannel } from '../src/secure-channel.js';

/** Generate a random secp256k1 keypair */
function generateKeypair() {
  const ecdh = createECDH('secp256k1');
  ecdh.generateKeys();
  return {
    privateKey: ecdh.getPrivateKey('hex'),
    publicKey: '0x' + ecdh.getPublicKey('hex', 'compressed'),
  };
}

/** Create a test protocol message */
function createTestMessage() {
  return {
    protocol: 'agentpay/1.0',
    id: 'test-msg-' + randomBytes(4).toString('hex'),
    timestamp: Math.floor(Date.now() / 1000),
    from: '0x02aabb',
    to: '0x03ccdd',
    signature: '',
    type: 'SERVICE_REQUEST',
    payload: {
      service: 'translate',
      input_preview: { keys: ['text', 'target'] },
      budget: { max_amount: '1000000000', asset: 'CKB' },
    },
  };
}

/** Generate test preimage and payment hash */
function generateTestPayment() {
  const preimage = randomBytes(32).toString('hex');
  const paymentHash = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
  return { preimage: '0x' + preimage, paymentHash: '0x' + paymentHash };
}

describe('SecureChannel', () => {
  // ──────────────────────────────────────────────────
  //  Message Signing
  // ──────────────────────────────────────────────────
  describe('Message Signing & Verification', () => {
    it('should sign and verify a message successfully', () => {
      const kp = generateKeypair();
      const channel = new SecureChannel(kp.privateKey);
      const msg = createTestMessage();

      channel.signMessage(msg);
      expect(msg.signature).not.toBe('');
      expect(msg.signature.length).toBeGreaterThan(0);

      const valid = channel.verifyMessage(msg, kp.publicKey);
      expect(valid).toBe(true);
    });

    it('should reject message signed with wrong key', () => {
      const kpProvider = generateKeypair();
      const kpAttacker = generateKeypair();
      const channel = new SecureChannel(kpProvider.privateKey);
      const msg = createTestMessage();

      channel.signMessage(msg);

      const attackerChannel = new SecureChannel(kpAttacker.privateKey);
      expect(attackerChannel.verifyMessage(msg, kpAttacker.publicKey)).toBe(false);
    });

    it('should reject tampered message', () => {
      const kp = generateKeypair();
      const channel = new SecureChannel(kp.privateKey);
      const msg = createTestMessage();

      channel.signMessage(msg);
      msg.payload.service = 'HACKED';
      expect(channel.verifyMessage(msg, kp.publicKey)).toBe(false);
    });

    it('should reject unsigned messages', () => {
      const kp = generateKeypair();
      const channel = new SecureChannel(kp.privateKey);
      const msg = createTestMessage();
      expect(channel.verifyMessage(msg, kp.publicKey)).toBe(false);
    });

    it('should return correct public key', () => {
      const kp = generateKeypair();
      const channel = new SecureChannel(kp.privateKey);
      expect(channel.getPublicKey()).toBe(kp.publicKey);
    });
  });

  // ──────────────────────────────────────────────────
  //  Secure Result (ZK Proof + ECDH)
  // ──────────────────────────────────────────────────
  describe('Secure Result — ZK Proof + ECDH Encryption', () => {
    it('should create a secure result that passes ZK verification', () => {
      const providerKp = generateKeypair();
      const callerKp = generateKeypair();
      const providerChannel = new SecureChannel(providerKp.privateKey);
      const { preimage, paymentHash } = generateTestPayment();

      const result = providerChannel.createSecureResult(
        preimage, paymentHash,
        { translated: 'Hello' },
        callerKp.publicKey,
        42,
      );

      expect(providerChannel.verifySecureResult(result, paymentHash)).toBe(true);
      expect(result.settled).toBe(true);
      expect(result.execution_time_ms).toBe(42);
    });

    it('should NOT contain cleartext preimage in result', () => {
      const providerKp = generateKeypair();
      const callerKp = generateKeypair();
      const providerChannel = new SecureChannel(providerKp.privateKey);
      const { preimage, paymentHash } = generateTestPayment();

      const result = providerChannel.createSecureResult(
        preimage, paymentHash, { data: 'test' },
        callerKp.publicKey, 10,
      );

      const resultJson = JSON.stringify(result);
      const cleanPreimage = preimage.replace(/^0x/, '');
      expect(resultJson).not.toContain(cleanPreimage);
    });

    it('should allow caller to recover preimage via ECDH', () => {
      const providerKp = generateKeypair();
      const callerKp = generateKeypair();
      const providerChannel = new SecureChannel(providerKp.privateKey);
      const callerChannel = new SecureChannel(callerKp.privateKey);
      const { preimage, paymentHash } = generateTestPayment();

      const result = providerChannel.createSecureResult(
        preimage, paymentHash, { data: 'test' },
        callerKp.publicKey, 10,
      );

      const recovered = callerChannel.recoverPreimageFromResult(result, providerKp.publicKey);
      expect(recovered).toBe(preimage);
    });

    it('should prevent third party from recovering preimage', () => {
      const providerKp = generateKeypair();
      const callerKp = generateKeypair();
      const attackerKp = generateKeypair();
      const providerChannel = new SecureChannel(providerKp.privateKey);
      const attackerChannel = new SecureChannel(attackerKp.privateKey);
      const { preimage, paymentHash } = generateTestPayment();

      const result = providerChannel.createSecureResult(
        preimage, paymentHash, { data: 'secret' },
        callerKp.publicKey, 10,
      );

      expect(() =>
        attackerChannel.recoverPreimageFromResult(result, providerKp.publicKey)
      ).toThrow();
    });

    it('should reject ZK proof with wrong payment hash', () => {
      const providerKp = generateKeypair();
      const callerKp = generateKeypair();
      const providerChannel = new SecureChannel(providerKp.privateKey);
      const { preimage, paymentHash } = generateTestPayment();

      const result = providerChannel.createSecureResult(
        preimage, paymentHash, { data: 'test' },
        callerKp.publicKey, 10,
      );

      const wrongHash = '0x' + 'ff'.repeat(32);
      expect(providerChannel.verifySecureResult(result, wrongHash)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────
  //  Full Protocol Flow
  // ──────────────────────────────────────────────────
  describe('Full Secure Protocol Flow', () => {
    it('should complete full sign → verify → ZK prove → recover pipeline', () => {
      const callerKp = generateKeypair();
      const providerKp = generateKeypair();
      const callerChannel = new SecureChannel(callerKp.privateKey);
      const providerChannel = new SecureChannel(providerKp.privateKey);
      const { preimage, paymentHash } = generateTestPayment();

      // 1. Caller signs SERVICE_REQUEST
      const request = createTestMessage();
      callerChannel.signMessage(request);
      expect(request.signature).not.toBe('');

      // 2. Provider verifies caller's signature
      expect(providerChannel.verifyMessage(request, callerKp.publicKey)).toBe(true);

      // 3. Provider creates and signs SERVICE_OFFER
      const offer = createTestMessage();
      offer.type = 'SERVICE_OFFER';
      providerChannel.signMessage(offer);

      // 4. Caller verifies provider's signature
      expect(callerChannel.verifyMessage(offer, providerKp.publicKey)).toBe(true);

      // 5. Provider creates secure result (ZK proof + encrypted preimage)
      const secureResult = providerChannel.createSecureResult(
        preimage, paymentHash,
        { translated: '你好世界' },
        callerKp.publicKey, 150,
      );

      // 6. Caller verifies ZK proof
      expect(callerChannel.verifySecureResult(secureResult, paymentHash)).toBe(true);

      // 7. Caller recovers preimage via ECDH
      const recovered = callerChannel.recoverPreimageFromResult(secureResult, providerKp.publicKey);
      expect(recovered).toBe(preimage);

      // 8. Verify recovered preimage matches payment hash
      const clean = recovered.replace(/^0x/, '');
      const verified = createHash('sha256').update(Buffer.from(clean, 'hex')).digest('hex');
      expect('0x' + verified).toBe(paymentHash);
    });
  });
});
