/**
 * Tests for Asset Registry
 */

import { describe, it, expect } from 'vitest';
import {
  TESTNET_ASSETS,
  resolveAssetScript,
  getAssetDefinition,
  formatAmount,
  createCustomAsset,
} from '../src/assets.js';

describe('Asset Registry', () => {
  describe('TESTNET_ASSETS', () => {
    it('should have CKB defined with no type script', () => {
      expect(TESTNET_ASSETS.CKB).toBeDefined();
      expect(TESTNET_ASSETS.CKB.udt_type_script).toBeNull();
      expect(TESTNET_ASSETS.CKB.decimals).toBe(8);
      expect(TESTNET_ASSETS.CKB.symbol).toBe('CKB');
    });

    it('should have BTC defined with no type script', () => {
      expect(TESTNET_ASSETS.BTC).toBeDefined();
      expect(TESTNET_ASSETS.BTC.udt_type_script).toBeNull();
    });

    it('should have USDT defined with a UDT type script', () => {
      expect(TESTNET_ASSETS.USDT).toBeDefined();
      expect(TESTNET_ASSETS.USDT.udt_type_script).not.toBeNull();
      expect(TESTNET_ASSETS.USDT.decimals).toBe(6);
    });

    it('should have USDC defined', () => {
      expect(TESTNET_ASSETS.USDC).toBeDefined();
      expect(TESTNET_ASSETS.USDC.decimals).toBe(6);
    });

    it('should have USDI defined', () => {
      expect(TESTNET_ASSETS.USDI).toBeDefined();
      expect(TESTNET_ASSETS.USDI.decimals).toBe(6);
    });

    it('should have WBTC defined', () => {
      expect(TESTNET_ASSETS.WBTC).toBeDefined();
      expect(TESTNET_ASSETS.WBTC.decimals).toBe(8);
    });
  });

  describe('resolveAssetScript', () => {
    it('should return null for CKB', () => {
      expect(resolveAssetScript('CKB')).toBeNull();
    });

    it('should return null for BTC', () => {
      expect(resolveAssetScript('BTC')).toBeNull();
    });

    it('should return a Script for USDT', () => {
      const script = resolveAssetScript('USDT');
      expect(script).not.toBeNull();
      expect(script!.code_hash).toBeDefined();
      expect(script!.hash_type).toBe('type');
    });

    it('should return null for unknown asset on mainnet', () => {
      expect(resolveAssetScript('USDT', 'mainnet')).toBeNull();
    });
  });

  describe('formatAmount', () => {
    it('should format CKB amounts (8 decimals)', () => {
      expect(formatAmount('100000000', 'CKB')).toBe('1.00000000 CKB');
      expect(formatAmount('50000000', 'CKB')).toBe('0.50000000 CKB');
      expect(formatAmount('1', 'CKB')).toBe('0.00000001 CKB');
    });

    it('should format USDT amounts (6 decimals)', () => {
      expect(formatAmount('1000000', 'USDT')).toBe('1.000000 USDT');
      expect(formatAmount('500000', 'USDT')).toBe('0.500000 USDT');
      expect(formatAmount('100000000', 'USDT')).toBe('100.000000 USDT');
    });

    it('should format BTC amounts (8 decimals)', () => {
      expect(formatAmount('100000000', 'BTC')).toBe('1.00000000 BTC');
    });

    it('should handle bigint input', () => {
      expect(formatAmount(BigInt('100000000'), 'CKB')).toBe('1.00000000 CKB');
    });

    it('should handle zero', () => {
      expect(formatAmount('0', 'CKB')).toBe('0.00000000 CKB');
    });
  });

  describe('createCustomAsset', () => {
    it('should create a custom UDT', () => {
      const asset = createCustomAsset('MyToken', 'MTK', 18, {
        code_hash: '0xaabbccdd',
        hash_type: 'type',
        args: '0x1234',
      });
      expect(asset.type).toBe('CUSTOM_UDT');
      expect(asset.symbol).toBe('MTK');
      expect(asset.decimals).toBe(18);
      expect(asset.udt_type_script!.code_hash).toBe('0xaabbccdd');
    });
  });
});
