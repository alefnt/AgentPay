/**
 * AgentPay Core — Well-Known Asset Registry
 *
 * Maps human-readable asset names (USDT, USDC, USDI, etc.) to their
 * CKB UDT type scripts. These are needed for Fiber operations:
 * - open_channel(funding_udt_type_script)
 * - new_invoice(udt_type_script)
 * - send_payment(udt_type_script)
 *
 * On CKB, all fungible tokens are UDTs (User Defined Tokens) based
 * on the xUDT standard. Each token has a unique `type_script`.
 */

import type { Script, AssetType } from './types.js';

// ═══════════════════════════════════════════════════════════
//  Asset Definition
// ═══════════════════════════════════════════════════════════

export interface AssetDefinition {
  /** Human-readable asset name */
  name: string;
  /** AssetType enum value */
  type: AssetType;
  /** Symbol for display */
  symbol: string;
  /** Decimal places */
  decimals: number;
  /** CKB UDT type script (null for native CKB and BTC) */
  udt_type_script: Script | null;
  /** Description */
  description: string;
}

// ═══════════════════════════════════════════════════════════
//  Well-Known Assets — Testnet
// ═══════════════════════════════════════════════════════════

/**
 * Well-known Testnet UDT type scripts.
 *
 * NOTE: These type script hashes are for CKB TESTNET (Pudge).
 * Mainnet (Mirana) will have different addresses.
 * These will be updated as official deployments become available.
 */
export const TESTNET_ASSETS: Record<string, AssetDefinition> = {
  CKB: {
    name: 'Nervos CKB',
    type: 'CKB',
    symbol: 'CKB',
    decimals: 8,
    udt_type_script: null,  // Native token, no type script needed
    description: 'Native CKB token (1 CKB = 10^8 shannons)',
  },

  BTC: {
    name: 'Bitcoin',
    type: 'BTC',
    symbol: 'BTC',
    decimals: 8,
    udt_type_script: null,  // Via Cch module, not UDT
    description: 'Bitcoin via Lightning ↔ Fiber (Cch module)',
  },

  USDI: {
    name: 'USDI Stablecoin',
    type: 'USDI',
    symbol: 'USDI',
    decimals: 6,
    udt_type_script: {
      // xUDT standard type script on CKB testnet
      // args will be owner_lock_hash when USDI is issued
      code_hash: '0x50bd8d6680b8b9cf98b73f3c08faf8b2a21914311954118ad6609f6e30a9f431',
      hash_type: 'type',
      args: '0x',
    },
    description: 'CKB-native USD stablecoin (pending deployment)',
  },

  USDT: {
    name: 'Tether USD',
    type: 'USDT',
    symbol: 'USDT',
    decimals: 6,
    udt_type_script: {
      // xUDT standard script — USDT not yet deployed on CKB
      // When deployed via RGB++, args will contain the owner_lock_hash
      code_hash: '0x50bd8d6680b8b9cf98b73f3c08faf8b2a21914311954118ad6609f6e30a9f431',
      hash_type: 'type',
      args: '0x',
    },
    description: 'Tether USD via RGB++ (pending deployment)',
  },

  USDC: {
    name: 'Circle USD',
    type: 'USDC',
    symbol: 'USDC',
    decimals: 6,
    udt_type_script: {
      // xUDT standard script — USDC not yet deployed on CKB
      code_hash: '0x50bd8d6680b8b9cf98b73f3c08faf8b2a21914311954118ad6609f6e30a9f431',
      hash_type: 'type',
      args: '0x',
    },
    description: 'Circle USD on CKB (pending deployment)',
  },

  WBTC: {
    name: 'Wrapped BTC',
    type: 'WBTC',
    symbol: 'WBTC',
    decimals: 8,
    udt_type_script: {
      // xUDT standard script — WBTC via RGB++ isomorphic binding
      code_hash: '0x50bd8d6680b8b9cf98b73f3c08faf8b2a21914311954118ad6609f6e30a9f431',
      hash_type: 'type',
      args: '0x',
    },
    description: 'Wrapped BTC via RGB++ isomorphic binding (pending deployment)',
  },
};

// ═══════════════════════════════════════════════════════════
//  Well-Known Assets — Mainnet
// ═══════════════════════════════════════════════════════════

export const MAINNET_ASSETS: Record<string, AssetDefinition> = {
  // TODO: Populate when deploying to mainnet
  CKB: { ...TESTNET_ASSETS.CKB },
  BTC: { ...TESTNET_ASSETS.BTC },
};

// ═══════════════════════════════════════════════════════════
//  Asset Resolution
// ═══════════════════════════════════════════════════════════

/**
 * Resolve an AssetType to its UDT type script for Fiber operations.
 * Returns null for native assets (CKB, BTC).
 *
 * @example
 * ```ts
 * const script = resolveAssetScript('USDT', 'testnet');
 * // Use in Fiber: open_channel({ funding_udt_type_script: script })
 * ```
 */
export function resolveAssetScript(
  asset: AssetType,
  network: 'testnet' | 'mainnet' = 'testnet',
): Script | null {
  const registry = network === 'mainnet' ? MAINNET_ASSETS : TESTNET_ASSETS;
  const def = registry[asset];
  return def?.udt_type_script ?? null;
}

/**
 * Get the full asset definition for display and formatting.
 */
export function getAssetDefinition(
  asset: AssetType,
  network: 'testnet' | 'mainnet' = 'testnet',
): AssetDefinition | undefined {
  const registry = network === 'mainnet' ? MAINNET_ASSETS : TESTNET_ASSETS;
  return registry[asset];
}

/**
 * Format an amount for display based on asset decimals.
 *
 * @example
 * ```ts
 * formatAmount('100000000', 'CKB');  // "1.00000000 CKB"
 * formatAmount('1000000', 'USDT');   // "1.000000 USDT"
 * ```
 */
export function formatAmount(
  amountRaw: string | bigint,
  asset: AssetType,
  network: 'testnet' | 'mainnet' = 'testnet',
): string {
  const def = getAssetDefinition(asset, network);
  const decimals = def?.decimals ?? 8;
  const symbol = def?.symbol ?? asset;

  const amount = BigInt(amountRaw);
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;

  const fracStr = frac.toString().padStart(decimals, '0');
  return `${whole}.${fracStr} ${symbol}`;
}

/**
 * Create a custom UDT asset definition at runtime.
 *
 * @example
 * ```ts
 * const myToken = createCustomAsset('MyToken', 'MTK', 8, {
 *   code_hash: '0x...',
 *   hash_type: 'type',
 *   args: '0x...',
 * });
 * ```
 */
export function createCustomAsset(
  name: string,
  symbol: string,
  decimals: number,
  typeScript: Script,
): AssetDefinition {
  return {
    name,
    type: 'CUSTOM_UDT',
    symbol,
    decimals,
    udt_type_script: typeScript,
    description: `Custom UDT: ${name}`,
  };
}
