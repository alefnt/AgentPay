/**
 * Tests for Identity module — secp256k1 ECDSA signatures
 */

import { describe, it, expect } from 'vitest';
import { createECDH } from 'node:crypto';
import { signPayload, verifySignature, agentDisplayName } from '../src/identity.js';

/** Generate a random secp256k1 keypair */
function generateKeypair() {
  const ecdh = createECDH('secp256k1');
  ecdh.generateKeys();
  return {
    privateKey: ecdh.getPrivateKey('hex'),
    publicKey: '0x' + ecdh.getPublicKey('hex', 'compressed'),
  };
}

describe('Identity — secp256k1 ECDSA', () => {
  describe('signPayload + verifySignature round-trip', () => {
    it('should sign and verify a payload successfully', () => {
      const { privateKey, publicKey } = generateKeypair();
      const payload = '{"test":"data","timestamp":1234567890}';

      const sig = signPayload(privateKey, payload);
      expect(typeof sig).toBe('string');
      expect(sig.length).toBeGreaterThan(0);

      const valid = verifySignature(publicKey, payload, sig);
      expect(valid).toBe(true);
    });

    it('should produce different signatures for different payloads', () => {
      const { privateKey } = generateKeypair();
      const sig1 = signPayload(privateKey, 'payload1');
      const sig2 = signPayload(privateKey, 'payload2');
      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different keys', () => {
      const kp1 = generateKeypair();
      const kp2 = generateKeypair();
      const sig1 = signPayload(kp1.privateKey, 'same-payload');
      const sig2 = signPayload(kp2.privateKey, 'same-payload');
      expect(sig1).not.toBe(sig2);
    });

    it('should sign complex protocol messages', () => {
      const { privateKey, publicKey } = generateKeypair();
      const msg = JSON.stringify({
        protocol: 'agentpay/1.0',
        id: 'test-msg-001',
        timestamp: 1710000000,
        type: 'SERVICE_REQUEST',
        payload: { service: 'translate', budget: { max_amount: '1000000000', asset: 'CKB' } },
      });

      const sig = signPayload(privateKey, msg);
      expect(verifySignature(publicKey, msg, sig)).toBe(true);
    });
  });

  describe('verifySignature rejections', () => {
    it('should reject signature from wrong key', () => {
      const kp1 = generateKeypair();
      const kp2 = generateKeypair();
      const sig = signPayload(kp1.privateKey, 'test');

      // Verify with wrong pubkey should fail
      expect(verifySignature(kp2.publicKey, 'test', sig)).toBe(false);
    });

    it('should reject signature on tampered payload', () => {
      const { privateKey, publicKey } = generateKeypair();
      const sig = signPayload(privateKey, 'original-data');

      expect(verifySignature(publicKey, 'tampered-data', sig)).toBe(false);
    });

    it('should reject empty signature', () => {
      const { publicKey } = generateKeypair();
      expect(verifySignature(publicKey, 'test', '')).toBe(false);
    });

    it('should reject garbage signature', () => {
      const { publicKey } = generateKeypair();
      expect(verifySignature(publicKey, 'test', 'deadbeef')).toBe(false);
    });

    it('should reject invalid pubkey gracefully', () => {
      const { privateKey } = generateKeypair();
      const sig = signPayload(privateKey, 'test');
      expect(verifySignature('0xinvalid', 'test', sig)).toBe(false);
    });
  });

  describe('agentDisplayName', () => {
    it('should strip key prefix and shorten', () => {
      const name = agentDisplayName('02abc123def456789');
      expect(name).toBe('Agent-abc123de');
    });

    it('should handle 03 prefix', () => {
      const name = agentDisplayName('03abc123def456789');
      expect(name).toBe('Agent-abc123de');
    });

    it('should handle raw hex (no prefix)', () => {
      const name = agentDisplayName('aabbccddee112233');
      expect(name).toBe('Agent-aabbccdd');
    });
  });
});
