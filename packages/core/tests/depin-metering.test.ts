/**
 * DePIN Metering Tests
 *
 * Tests for resource cost calculation, usage proofs, and formatting.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCost,
  exceedsBudget,
  remainingBudget,
  maxAffordableUnits,
  createUsageProof,
  verifyUsageProof,
  formatResourceAmount,
  formatCost,
} from '../src/depin-metering.js';
import type { ResourceSpec, ResourceUsage } from '../src/depin-types.js';

const GPU_SPEC: ResourceSpec = {
  type: 'gpu',
  name: 'A100 GPU',
  unit: 'seconds',
  price_per_unit: '1000000',   // 0.01 CKB per second
  asset: 'CKB',
};

const STORAGE_SPEC: ResourceSpec = {
  type: 'storage',
  name: 'SSD Storage',
  unit: 'bytes',
  price_per_unit: '1',          // 1 shannon per byte
  asset: 'RUSD',
};

describe('DePIN Metering: calculateCost', () => {
  it('should calculate GPU cost correctly', () => {
    // 100 seconds × 1M shannons = 100M shannons = 1 CKB
    expect(calculateCost('100', GPU_SPEC)).toBe('100000000');
  });

  it('should calculate storage cost correctly', () => {
    // 1GB (1e9 bytes) × 1 shannon = 1e9 shannons = 10 CKB
    expect(calculateCost('1000000000', STORAGE_SPEC)).toBe('1000000000');
  });

  it('should handle zero units', () => {
    expect(calculateCost('0', GPU_SPEC)).toBe('0');
  });

  it('should handle large numbers', () => {
    // 1M seconds × 1M shannons = 1T shannons
    expect(calculateCost('1000000', GPU_SPEC)).toBe('1000000000000');
  });
});

describe('DePIN Metering: budget checks', () => {
  it('should detect budget exceeded', () => {
    expect(exceedsBudget('200000000', '100000000')).toBe(true);
    expect(exceedsBudget('100000000', '200000000')).toBe(false);
    expect(exceedsBudget('100000000', '100000000')).toBe(false);
  });

  it('should calculate remaining budget', () => {
    expect(remainingBudget('1000000000', '300000000')).toBe('700000000');
    expect(remainingBudget('100', '100')).toBe('0');
    expect(remainingBudget('50', '100')).toBe('0'); // clamped to 0
  });

  it('should calculate max affordable units', () => {
    // Budget 1 CKB (100M), price 1M per unit = 100 units max
    expect(maxAffordableUnits('100000000', GPU_SPEC)).toBe('100');
  });
});

describe('DePIN Metering: usage proofs', () => {
  it('should create and verify proof', () => {
    const usage: ResourceUsage = {
      session_id: 'session_1',
      device_id: 'device_1',
      resource_type: 'gpu',
      units: '10',
      cumulative_units: '10',
      cost: '10000000',
      cumulative_cost: '10000000',
      timestamp: 1700000000000,
    };

    const proof = createUsageProof(usage);
    expect(proof).toMatch(/^0x[0-9a-f]{64}$/);

    usage.proof = proof;
    expect(verifyUsageProof(usage)).toBe(true);
  });

  it('should reject tampered proof', () => {
    const usage: ResourceUsage = {
      session_id: 'session_1',
      device_id: 'device_1',
      resource_type: 'gpu',
      units: '10',
      cumulative_units: '10',
      cost: '10000000',
      cumulative_cost: '10000000',
      timestamp: 1700000000000,
      proof: '0x0000000000000000000000000000000000000000000000000000000000000000',
    };

    expect(verifyUsageProof(usage)).toBe(false);
  });

  it('should reject missing proof', () => {
    const usage: ResourceUsage = {
      session_id: 'session_1',
      device_id: 'device_1',
      resource_type: 'gpu',
      units: '10',
      cumulative_units: '10',
      cost: '10000000',
      cumulative_cost: '10000000',
      timestamp: 1700000000000,
    };

    expect(verifyUsageProof(usage)).toBe(false);
  });
});

describe('DePIN Metering: formatting', () => {
  it('should format resource amounts with scale', () => {
    expect(formatResourceAmount('1500000000', 'bytes')).toBe('1.50 GB');
    expect(formatResourceAmount('42', 'records')).toBe('42 records');
    expect(formatResourceAmount('2500000', 'flops')).toBe('2.50 MFLOPS');
  });

  it('should format CKB costs', () => {
    expect(formatCost('100000000', 'CKB')).toBe('1.0000 CKB');
    expect(formatCost('50000000', 'CKB')).toBe('0.5000 CKB');
  });

  it('should format RUSD costs', () => {
    expect(formatCost('1000000', 'RUSD')).toBe('1.00 RUSD');
    expect(formatCost('500000', 'RUSD')).toBe('0.50 RUSD');
  });
});
