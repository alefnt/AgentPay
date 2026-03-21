/**
 * Tests for ZK Preimage Proof (Sigma Protocol)
 */

import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { createPreimageProof, verifyPreimageProof, recoverPreimage } from '../src/zk-preimage.js';

/** Helper: create a valid (preimage, paymentHash) pair */
function generateTestPair() {
  const preimage = randomBytes(32).toString('hex');
  const paymentHash = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
  return { preimage: '0x' + preimage, paymentHash: '0x' + paymentHash };
}

describe('ZK Preimage Proof', () => {
  describe('createPreimageProof', () => {
    it('should create a valid proof that passes verification', () => {
      const { preimage, paymentHash } = generateTestPair();
      const proof = createPreimageProof(preimage, paymentHash);

      expect(proof.commitment).toMatch(/^0x[0-9a-f]{64}$/);
      expect(proof.challenge).toMatch(/^0x[0-9a-f]{64}$/);
      expect(proof.response).toMatch(/^0x[0-9a-f]{64}$/);
      expect(proof.nonce_hash).toMatch(/^0x[0-9a-f]{64}$/);

      expect(verifyPreimageProof(proof, paymentHash)).toBe(true);
    });

    it('should produce different proofs for same preimage (randomised nonce)', () => {
      const { preimage, paymentHash } = generateTestPair();
      const proof1 = createPreimageProof(preimage, paymentHash);
      const proof2 = createPreimageProof(preimage, paymentHash);

      // Nonces are random, so commitments should differ
      expect(proof1.commitment).not.toBe(proof2.commitment);
      expect(proof1.response).not.toBe(proof2.response);
    });

    it('should reject mismatched preimage and paymentHash', () => {
      const { preimage } = generateTestPair();
      const wrongHash = '0x' + createHash('sha256').update('wrong').digest('hex');

      expect(() => createPreimageProof(preimage, wrongHash)).toThrow('does not match');
    });

    it('should reject non-32-byte preimage', () => {
      expect(() => createPreimageProof('0xaabb', '0x' + 'cc'.repeat(32))).toThrow('32 bytes');
    });

    it('should reject non-32-byte paymentHash', () => {
      expect(() => createPreimageProof('0x' + 'aa'.repeat(32), '0xaabb')).toThrow('32 bytes');
    });
  });

  describe('verifyPreimageProof', () => {
    it('should accept valid proof', () => {
      const { preimage, paymentHash } = generateTestPair();
      const proof = createPreimageProof(preimage, paymentHash);
      expect(verifyPreimageProof(proof, paymentHash)).toBe(true);
    });

    it('should reject proof with wrong paymentHash', () => {
      const { preimage, paymentHash } = generateTestPair();
      const proof = createPreimageProof(preimage, paymentHash);
      const wrongHash = '0x' + 'ff'.repeat(32);
      expect(verifyPreimageProof(proof, wrongHash)).toBe(false);
    });

    it('should reject proof with tampered commitment', () => {
      const { preimage, paymentHash } = generateTestPair();
      const proof = createPreimageProof(preimage, paymentHash);

      const tampered = { ...proof, commitment: '0x' + 'aa'.repeat(32) };
      expect(verifyPreimageProof(tampered, paymentHash)).toBe(false);
    });

    it('should reject proof with tampered challenge', () => {
      const { preimage, paymentHash } = generateTestPair();
      const proof = createPreimageProof(preimage, paymentHash);

      const tampered = { ...proof, challenge: '0x' + 'bb'.repeat(32) };
      expect(verifyPreimageProof(tampered, paymentHash)).toBe(false);
    });

    it('should reject proof with wrong-length fields', () => {
      const { paymentHash } = generateTestPair();
      const bad = {
        commitment: '0xshort',
        challenge: '0x' + 'aa'.repeat(32),
        response: '0x' + 'bb'.repeat(32),
        nonce_hash: '0x' + 'cc'.repeat(32),
      };
      expect(verifyPreimageProof(bad, paymentHash)).toBe(false);
    });
  });

  describe('recoverPreimage', () => {
    it('should recover the correct preimage when given the nonce', () => {
      // We need internal access to the nonce. Create proof and simulate nonce knowledge.
      // Since createPreimageProof uses internal randomBytes, we'll test via a round-trip.
      const preimageRaw = randomBytes(32);
      const preimage = preimageRaw.toString('hex');
      const paymentHash = createHash('sha256').update(preimageRaw).digest('hex');

      // Create proof — we need the nonce to test recoverPreimage
      // Since nonce is internal, we'll reconstruct by brute-checking
      // Actually, we can test the API by verifying that createPreimageProof + nonce = recoverable.
      // Let's test the math directly by importing internals or by patching randomBytes.

      // Alternative: manually create a proof to test recovery
      const nonce = randomBytes(32).toString('hex');
      const commitment = createHash('sha256')
        .update(Buffer.from(preimage, 'hex'))
        .update(Buffer.from(nonce, 'hex'))
        .digest('hex');
      const challenge = createHash('sha256')
        .update(Buffer.from(commitment, 'hex'))
        .update(Buffer.from(paymentHash, 'hex'))
        .digest('hex');
      const mask = createHash('sha256')
        .update(Buffer.from(nonce, 'hex'))
        .update(Buffer.from(challenge, 'hex'))
        .digest('hex');

      // XOR preimage with mask
      const preBuf = Buffer.from(preimage, 'hex');
      const maskBuf = Buffer.from(mask, 'hex');
      const response = Buffer.alloc(32);
      for (let i = 0; i < 32; i++) {
        response[i] = preBuf[i]! ^ maskBuf[i]!;
      }

      const nonceHash = createHash('sha256').update(Buffer.from(nonce, 'hex')).digest('hex');

      const proof = {
        commitment: '0x' + commitment,
        challenge: '0x' + challenge,
        response: '0x' + response.toString('hex'),
        nonce_hash: '0x' + nonceHash,
      };

      // Verify and recover
      expect(verifyPreimageProof(proof, '0x' + paymentHash)).toBe(true);

      const recovered = recoverPreimage(proof, '0x' + nonce, '0x' + paymentHash);
      expect(recovered).toBe('0x' + preimage);
    });

    it('should reject recovery with wrong nonce', () => {
      const preimageRaw = randomBytes(32);
      const preimage = preimageRaw.toString('hex');
      const paymentHash = createHash('sha256').update(preimageRaw).digest('hex');

      const nonce = randomBytes(32).toString('hex');
      const commitment = createHash('sha256')
        .update(Buffer.from(preimage, 'hex'))
        .update(Buffer.from(nonce, 'hex'))
        .digest('hex');
      const challenge = createHash('sha256')
        .update(Buffer.from(commitment, 'hex'))
        .update(Buffer.from(paymentHash, 'hex'))
        .digest('hex');
      const mask = createHash('sha256')
        .update(Buffer.from(nonce, 'hex'))
        .update(Buffer.from(challenge, 'hex'))
        .digest('hex');
      const preBuf = Buffer.from(preimage, 'hex');
      const maskBuf = Buffer.from(mask, 'hex');
      const responseBuf = Buffer.alloc(32);
      for (let i = 0; i < 32; i++) responseBuf[i] = preBuf[i]! ^ maskBuf[i]!;
      const nonceHash = createHash('sha256').update(Buffer.from(nonce, 'hex')).digest('hex');

      const proof = {
        commitment: '0x' + commitment,
        challenge: '0x' + challenge,
        response: '0x' + responseBuf.toString('hex'),
        nonce_hash: '0x' + nonceHash,
      };

      const wrongNonce = '0x' + randomBytes(32).toString('hex');
      expect(() => recoverPreimage(proof, wrongNonce, '0x' + paymentHash)).toThrow('Nonce does not match');
    });
  });
});
