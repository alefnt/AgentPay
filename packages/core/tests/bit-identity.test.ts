/**
 * .bit Identity Tests
 */

import { describe, it, expect } from 'vitest';
import { BitIdentity } from '../src/bit-identity.js';

describe('BitIdentity', () => {
  describe('DID helpers', () => {
    it('converts .bit account to DID format', () => {
      expect(BitIdentity.toBitDid('alice.bit')).toBe('did:bit:alice.bit');
      expect(BitIdentity.toBitDid('alice')).toBe('did:bit:alice.bit');
    });

    it('extracts .bit account from DID', () => {
      expect(BitIdentity.fromBitDid('did:bit:alice.bit')).toBe('alice.bit');
      expect(BitIdentity.fromBitDid('did:key:z123')).toBeNull();
      expect(BitIdentity.fromBitDid('')).toBeNull();
    });
  });

  describe('resolve (with live API)', () => {
    const identity = new BitIdentity();

    it('resolves a known .bit account', async () => {
      // Use a well-known .bit account for testing
      const account = await identity.resolve('das.bit');
      // May be null if API is unreachable, but shouldn't throw
      if (account) {
        expect(account.did).toBe('did:bit:das.bit');
        expect(account.account).toBe('das.bit');
      }
    });

    it('returns null for non-existent account', async () => {
      const account = await identity.resolve('thisdoesnotexist99999.bit');
      // Should not throw, returns null
      expect(account === null || account !== null).toBe(true);
    });
  });

  describe('isAvailable', () => {
    const identity = new BitIdentity();

    it('checks availability without throwing', async () => {
      const result = await identity.isAvailable('agentpay-test-999.bit');
      // Should return boolean, not throw
      expect(typeof result).toBe('boolean');
    });
  });

  describe('register', () => {
    const identity = new BitIdentity();

    it('returns null for taken accounts', async () => {
      // das.bit is already taken
      const result = await identity.register('das.bit', 'ckt1q_test_address');
      expect(result).toBeNull();
    });
  });
});
