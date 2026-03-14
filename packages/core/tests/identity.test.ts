/**
 * Tests for Identity module
 */

import { describe, it, expect } from 'vitest';
import { signPayload, verifySignature, agentDisplayName } from '../src/identity.js';

describe('Identity', () => {
  describe('signPayload', () => {
    it('should produce a 64-char hex signature', () => {
      const sig = signPayload('aabbccdd'.repeat(8), '{"test":"data"}');
      expect(sig).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(sig)).toBe(true);
    });

    it('should produce different signatures for different payloads', () => {
      const key = 'aabbccdd'.repeat(8);
      const sig1 = signPayload(key, 'payload1');
      const sig2 = signPayload(key, 'payload2');
      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different keys', () => {
      const sig1 = signPayload('aa'.repeat(32), 'same');
      const sig2 = signPayload('bb'.repeat(32), 'same');
      expect(sig1).not.toBe(sig2);
    });

    it('should be deterministic', () => {
      const key = 'cc'.repeat(32);
      const sig1 = signPayload(key, 'deterministic');
      const sig2 = signPayload(key, 'deterministic');
      expect(sig1).toBe(sig2);
    });
  });

  describe('verifySignature', () => {
    it('should accept valid-length signatures', () => {
      const sig = signPayload('aa'.repeat(32), 'test');
      expect(verifySignature('0x02pubkey', 'test', sig)).toBe(true);
    });

    it('should reject invalid-length signatures', () => {
      expect(verifySignature('0x02pubkey', 'test', 'short')).toBe(false);
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
