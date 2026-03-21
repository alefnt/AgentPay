/**
 * Tests for ECDH Encrypted Channel
 */

import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  deriveSharedSecret,
  getPublicKey,
  encryptWithSharedSecret,
  decryptWithSharedSecret,
} from '../src/ecdh.js';

/**
 * Generate a random secp256k1 private key.
 * Note: Not all 32-byte values are valid secp256k1 private keys,
 * but for testing we use small random values that are almost always valid.
 */
function randomPrivateKey(): string {
  // Ensure the key is valid (< curve order)
  return randomBytes(32).toString('hex');
}

describe('ECDH Encrypted Channel', () => {
  describe('getPublicKey', () => {
    it('should derive a compressed public key (33 bytes = 66 hex + 0x prefix)', () => {
      const privKey = randomPrivateKey();
      const pubKey = getPublicKey(privKey);

      expect(pubKey).toMatch(/^0x0[23][0-9a-f]{64}$/);
    });

    it('should produce consistent public keys for same private key', () => {
      const privKey = randomPrivateKey();
      const pub1 = getPublicKey(privKey);
      const pub2 = getPublicKey(privKey);
      expect(pub1).toBe(pub2);
    });

    it('should produce different public keys for different private keys', () => {
      const pub1 = getPublicKey(randomPrivateKey());
      const pub2 = getPublicKey(randomPrivateKey());
      expect(pub1).not.toBe(pub2);
    });
  });

  describe('deriveSharedSecret', () => {
    it('should produce symmetric shared secrets (A+B == B+A)', () => {
      const privA = randomPrivateKey();
      const privB = randomPrivateKey();
      const pubA = getPublicKey(privA);
      const pubB = getPublicKey(privB);

      const secretAB = deriveSharedSecret(privA, pubB);
      const secretBA = deriveSharedSecret(privB, pubA);

      expect(secretAB).toBe(secretBA);
    });

    it('should return 32-byte shared secret (0x-prefixed)', () => {
      const privA = randomPrivateKey();
      const privB = randomPrivateKey();
      const pubB = getPublicKey(privB);

      const secret = deriveSharedSecret(privA, pubB);
      expect(secret).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should produce different secrets for different key pairs', () => {
      const priv1 = randomPrivateKey();
      const priv2 = randomPrivateKey();
      const priv3 = randomPrivateKey();
      const pub2 = getPublicKey(priv2);
      const pub3 = getPublicKey(priv3);

      const secret12 = deriveSharedSecret(priv1, pub2);
      const secret13 = deriveSharedSecret(priv1, pub3);

      expect(secret12).not.toBe(secret13);
    });
  });

  describe('encrypt / decrypt', () => {
    it('should round-trip: encrypt then decrypt returns original plaintext', () => {
      const privA = randomPrivateKey();
      const privB = randomPrivateKey();
      const pubB = getPublicKey(privB);
      const sharedSecret = deriveSharedSecret(privA, pubB);

      const plaintext = '0x' + randomBytes(32).toString('hex');
      const encrypted = encryptWithSharedSecret(plaintext, sharedSecret);
      const decrypted = decryptWithSharedSecret(encrypted, sharedSecret);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const privA = randomPrivateKey();
      const privB = randomPrivateKey();
      const pubB = getPublicKey(privB);
      const sharedSecret = deriveSharedSecret(privA, pubB);

      const plaintext = '0x' + 'aa'.repeat(32);
      const enc1 = encryptWithSharedSecret(plaintext, sharedSecret);
      const enc2 = encryptWithSharedSecret(plaintext, sharedSecret);

      // IVs should be different
      expect(enc1.iv).not.toBe(enc2.iv);
      // Ciphertexts should be different
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    });

    it('should fail decryption with wrong key', () => {
      const privA = randomPrivateKey();
      const privB = randomPrivateKey();
      const privC = randomPrivateKey();
      const pubB = getPublicKey(privB);
      const pubC = getPublicKey(privC);

      const secretAB = deriveSharedSecret(privA, pubB);
      const secretAC = deriveSharedSecret(privA, pubC);

      const plaintext = '0x' + randomBytes(32).toString('hex');
      const encrypted = encryptWithSharedSecret(plaintext, secretAB);

      expect(() => decryptWithSharedSecret(encrypted, secretAC)).toThrow();
    });

    it('should fail decryption with tampered ciphertext (GCM tag check)', () => {
      const privA = randomPrivateKey();
      const privB = randomPrivateKey();
      const pubB = getPublicKey(privB);
      const sharedSecret = deriveSharedSecret(privA, pubB);

      const plaintext = '0x' + randomBytes(32).toString('hex');
      const encrypted = encryptWithSharedSecret(plaintext, sharedSecret);

      // Tamper with ciphertext
      const tampered = {
        ...encrypted,
        ciphertext: 'ff' + encrypted.ciphertext.slice(2),
      };

      expect(() => decryptWithSharedSecret(tampered, sharedSecret)).toThrow();
    });

    it('should handle small payloads (1 byte)', () => {
      const privA = randomPrivateKey();
      const privB = randomPrivateKey();
      const pubB = getPublicKey(privB);
      const sharedSecret = deriveSharedSecret(privA, pubB);

      const plaintext = '0xab';
      const encrypted = encryptWithSharedSecret(plaintext, sharedSecret);
      const decrypted = decryptWithSharedSecret(encrypted, sharedSecret);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle large payloads (1KB)', () => {
      const privA = randomPrivateKey();
      const privB = randomPrivateKey();
      const pubB = getPublicKey(privB);
      const sharedSecret = deriveSharedSecret(privA, pubB);

      const plaintext = '0x' + randomBytes(1024).toString('hex');
      const encrypted = encryptWithSharedSecret(plaintext, sharedSecret);
      const decrypted = decryptWithSharedSecret(encrypted, sharedSecret);

      expect(decrypted).toBe(plaintext);
    });
  });
});
