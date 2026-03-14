/**
 * .bit Identity — CKB Decentralized Identity for AI Agents
 *
 * Uses .bit (d.id) protocol on CKB for Agent identity management.
 * - Resolve: .bit name → CKB address (via public indexer API)
 * - Register: Auto-register .bit sub-accounts for Agents
 * - DID: Convert .bit to W3C DID format (did:bit:name.bit)
 *
 * .bit is CKB's native DID protocol:
 * - Cross-chain: works on CKB, ETH, BSC, etc.
 * - Cheap: ~$5/year on mainnet, free on testnet
 * - Human-readable: "alice.bit" instead of long addresses
 *
 * @see https://d.id
 * @see https://github.com/dotbitHQ
 */

// ═══════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════

export interface BitAccount {
  /** Full .bit account name (e.g. "translator-agent.bit") */
  account: string;
  /** W3C DID format (e.g. "did:bit:translator-agent.bit") */
  did: string;
  /** Owner CKB address */
  ownerAddress?: string;
  /** Manager CKB address (can update records) */
  managerAddress?: string;
}

export interface BitRecord {
  key: string;         // e.g. "address.ckb", "profile.description"
  value: string;
  label: string;
  ttl: string;
}

export interface BitIdentityConfig {
  /** .bit indexer API URL (default: https://indexer-v1.d.id) */
  indexerUrl?: string;
  /** .bit registrar API URL (default: https://register-api.d.id) */
  registrarUrl?: string;
}

// ═══════════════════════════════════════════════════════════
//  .bit Identity Resolver & Registrar
// ═══════════════════════════════════════════════════════════

const DEFAULT_INDEXER = 'https://indexer-v1.d.id';
const DEFAULT_REGISTRAR = 'https://register-api.d.id';

export class BitIdentity {
  private readonly indexerUrl: string;
  private readonly registrarUrl: string;

  constructor(config?: BitIdentityConfig) {
    this.indexerUrl = config?.indexerUrl ?? DEFAULT_INDEXER;
    this.registrarUrl = config?.registrarUrl ?? DEFAULT_REGISTRAR;
  }

  // ─── Resolve ──────────────────────────────────────────

  /**
   * Resolve a .bit account to its CKB address and records.
   *
   * @example
   * ```ts
   * const identity = new BitIdentity();
   * const account = await identity.resolve('satoshi.bit');
   * console.log(account.ownerAddress); // "ckb1q..."
   * ```
   */
  async resolve(bitAccount: string): Promise<BitAccount | null> {
    const normalized = bitAccount.endsWith('.bit') ? bitAccount : `${bitAccount}.bit`;

    try {
      const resp = await fetch(`${this.indexerUrl}/v1/account/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: normalized }),
      });

      if (!resp.ok) return null;
      const data = await resp.json() as { data?: { account_info?: { owner_key?: string; manager_key?: string } } };

      const info = data?.data?.account_info;
      if (!info) return null;

      return {
        account: normalized,
        did: `did:bit:${normalized}`,
        ownerAddress: info.owner_key,
        managerAddress: info.manager_key,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get all records for a .bit account (addresses, profile, custom).
   */
  async getRecords(bitAccount: string): Promise<BitRecord[]> {
    const normalized = bitAccount.endsWith('.bit') ? bitAccount : `${bitAccount}.bit`;

    try {
      const resp = await fetch(`${this.indexerUrl}/v1/account/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: normalized }),
      });

      if (!resp.ok) return [];
      const data = await resp.json() as { data?: { records?: BitRecord[] } };
      return data?.data?.records ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Resolve a .bit name to a specific address type.
   *
   * @param bitAccount - e.g. "alice.bit"
   * @param chain - e.g. "ckb", "eth", "btc"
   * @returns The address string, or null
   */
  async resolveAddress(bitAccount: string, chain: string = 'ckb'): Promise<string | null> {
    const records = await this.getRecords(bitAccount);
    const key = `address.${chain}`;
    const record = records.find((r) => r.key === key);
    return record?.value ?? null;
  }

  // ─── Register ─────────────────────────────────────────

  /**
   * Check if a .bit account is available for registration.
   */
  async isAvailable(bitAccount: string): Promise<boolean> {
    const normalized = bitAccount.endsWith('.bit') ? bitAccount : `${bitAccount}.bit`;

    try {
      const resp = await fetch(`${this.registrarUrl}/v1/account/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: normalized, account_char_str: [] }),
      });

      if (!resp.ok) return false;
      const data = await resp.json() as { data?: { status?: number } };
      // status 0 = available
      return data?.data?.status === 0;
    } catch {
      return false;
    }
  }

  /**
   * Register a .bit account for an Agent.
   *
   * On-chain registration flow:
   * 1. Check availability
   * 2. Get registration order (includes CKB tx to sign)
   * 3. Sign and submit transaction
   *
   * Note: Requires CKB balance for registration fee.
   * Testnet: use faucet (https://faucet.nervos.org/)
   * Mainnet: ~$5/year
   *
   * @param bitAccount - Desired .bit name (e.g. "my-agent.bit")
   * @param ownerCkbAddress - CKB address to own the account
   * @param years - Registration period (1-5 years)
   * @returns Registration order info, or null if unavailable
   */
  async register(
    bitAccount: string,
    ownerCkbAddress: string,
    years: number = 1,
  ): Promise<{ orderId: string; paymentAddress: string; amount: string } | null> {
    const normalized = bitAccount.endsWith('.bit') ? bitAccount : `${bitAccount}.bit`;

    // 1. Check availability
    const available = await this.isAvailable(normalized);
    if (!available) {
      return null;
    }

    // 2. Request registration order
    try {
      const resp = await fetch(`${this.registrarUrl}/v1/account/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: normalized,
          pay_chain_type: 1,         // 1 = CKB
          pay_token_id: 'ckb_ckb',
          pay_type: '',
          pay_address: ownerCkbAddress,
          register_years: years,
          inviter_account: '',
          channel_account: '',
        }),
      });

      if (!resp.ok) return null;
      const data = await resp.json() as {
        data?: {
          order_id?: string;
          receipt_address?: string;
          amount?: string;
        }
      };

      const order = data?.data;
      if (!order?.order_id) return null;

      return {
        orderId: order.order_id,
        paymentAddress: order.receipt_address ?? '',
        amount: order.amount ?? '0',
      };
    } catch {
      return null;
    }
  }

  // ─── DID Helpers ──────────────────────────────────────

  /**
   * Convert a .bit account name to W3C DID format.
   * @example toBitDid("alice.bit") → "did:bit:alice.bit"
   */
  static toBitDid(bitAccount: string): string {
    const normalized = bitAccount.endsWith('.bit') ? bitAccount : `${bitAccount}.bit`;
    return `did:bit:${normalized}`;
  }

  /**
   * Extract .bit account from a DID.
   * @example fromBitDid("did:bit:alice.bit") → "alice.bit"
   */
  static fromBitDid(did: string): string | null {
    const match = did.match(/^did:bit:(.+\.bit)$/);
    return match?.[1] ?? null;
  }
}
