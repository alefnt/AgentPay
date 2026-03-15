/**
 * AgentPay DePIN — Resource Metering Engine
 *
 * Calculates costs, generates usage proofs, and formats resource amounts.
 * This module is pure computation (no I/O) for easy testing.
 */

import { createHash } from 'node:crypto';
import type { ResourceSpec, ResourceUsage, ResourceUnit } from './depin-types.js';

// ═══════════════════════════════════════════════════════════
//  Cost Calculation
// ═══════════════════════════════════════════════════════════

/**
 * Calculate the cost for a given amount of resource usage.
 *
 * @param units - Number of units consumed (decimal string)
 * @param spec - Resource specification with price_per_unit
 * @returns Cost in shannons (string)
 *
 * @example
 * calculateCost('100', { price_per_unit: '1000000', ... })
 * // → '100000000' (100 units × 1M shannons)
 */
export function calculateCost(units: string, spec: ResourceSpec): string {
  const unitsBI = BigInt(units);
  const priceBI = BigInt(spec.price_per_unit);
  return (unitsBI * priceBI).toString();
}

/**
 * Check whether a cost exceeds the session budget.
 */
export function exceedsBudget(cost: string, budget: string): boolean {
  return BigInt(cost) > BigInt(budget);
}

/**
 * Calculate remaining budget after consumption.
 */
export function remainingBudget(budget: string, spent: string): string {
  const rem = BigInt(budget) - BigInt(spent);
  return rem < 0n ? '0' : rem.toString();
}

/**
 * Calculate maximum units affordable within a budget.
 */
export function maxAffordableUnits(budget: string, spec: ResourceSpec): string {
  const budgetBI = BigInt(budget);
  const priceBI = BigInt(spec.price_per_unit);
  if (priceBI === 0n) return '0';
  return (budgetBI / priceBI).toString();
}

// ═══════════════════════════════════════════════════════════
//  Usage Proof Generation
// ═══════════════════════════════════════════════════════════

/**
 * Create a SHA-256 proof of a usage record.
 * This can be verified by both parties to prevent disputes.
 *
 * Proof = SHA256(session_id + device_id + units + cumulative_units + timestamp)
 */
export function createUsageProof(usage: Omit<ResourceUsage, 'proof' | 'cost' | 'cumulative_cost'>): string {
  const data = [
    usage.session_id,
    usage.device_id,
    usage.units,
    usage.cumulative_units,
    usage.timestamp.toString(),
  ].join('|');
  return '0x' + createHash('sha256').update(data).digest('hex');
}

/**
 * Verify a usage proof against a usage record.
 */
export function verifyUsageProof(usage: ResourceUsage): boolean {
  if (!usage.proof) return false;
  const expected = createUsageProof(usage);
  return expected === usage.proof;
}

// ═══════════════════════════════════════════════════════════
//  Formatting
// ═══════════════════════════════════════════════════════════

/** Unit labels for human display */
const UNIT_LABELS: Record<ResourceUnit, string> = {
  flops: 'FLOPS',
  tokens: 'tokens',
  bytes: 'B',
  mbps: 'Mbps',
  records: 'records',
  seconds: 's',
  kwh: 'kWh',
  requests: 'req',
  custom: 'units',
};

/** Scale thresholds for auto-formatting */
const SCALES: Array<[number, string]> = [
  [1e18, 'E'],
  [1e15, 'P'],
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/**
 * Format a resource amount for human display.
 *
 * @example
 * formatResourceAmount('1500000000', 'bytes')  → '1.50 GB'
 * formatResourceAmount('3600', 'seconds')       → '3.60 Ks'
 * formatResourceAmount('42', 'records')         → '42 records'
 */
export function formatResourceAmount(amount: string, unit: ResourceUnit): string {
  const num = Number(amount);
  const label = UNIT_LABELS[unit] || unit;

  for (const [threshold, prefix] of SCALES) {
    if (num >= threshold) {
      return `${(num / threshold).toFixed(2)} ${prefix}${label}`;
    }
  }
  return `${amount} ${label}`;
}

/**
 * Format a cost in shannons to a human-readable CKB/RUSD amount.
 *
 * @example
 * formatCost('100000000', 'CKB')     → '1.00 CKB'
 * formatCost('1000000', 'RUSD')      → '0.01 RUSD'
 */
export function formatCost(shannons: string, asset: string): string {
  const decimals = asset === 'CKB' ? 8 : 6;  // CKB = 10^8, stablecoins = 10^6
  const divisor = 10 ** decimals;
  const amount = Number(shannons) / divisor;
  return `${amount.toFixed(decimals > 6 ? 4 : 2)} ${asset}`;
}
