/**
 * AgentPay — RGB++ Bridge Module
 *
 * Integrates RGB++ protocol for BTC↔CKB asset bridging.
 * Enables BTC-native assets to flow through Fiber payment channels.
 *
 * Architecture:
 *   BTC Asset (RGB++ on BTC)
 *     ↓ Leap (BTC → CKB)
 *   CKB xUDT Cell
 *     ↓ Deposit into Fiber Channel
 *   Fiber Payment Channel
 *     ↓ Hold Invoice + AgentPay Protocol
 *   Agent Service Payment
 *
 * Key capabilities:
 * - Query RGB++ assets by BTC address
 * - Leap xUDT from BTC to CKB (for Fiber deposit)
 * - Leap xUDT from CKB to BTC (withdraw)
 * - Track Leap transaction status
 */

import { createLogger } from './logger.js';

const log = createLogger({ name: 'rgbpp-bridge', version: '0.1.0' });

// ═══════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════

/** RGB++ network configuration */
export type RgbppNetwork = 'testnet' | 'signet' | 'mainnet';

/** RGB++ service endpoints */
export const RGBPP_SERVICE_URLS: Record<RgbppNetwork, string> = {
  testnet: 'https://api.testnet.rgbpp.io',
  signet: 'https://api.signet.rgbpp.io',
  mainnet: 'https://api.rgbpp.io',
};

/** RGB++ asset balance from BtcAssetsApi */
export interface RgbppAssetBalance {
  name: string;
  symbol: string;
  decimal: number;
  total_amount: string;
  available_amount: string;
  pending_amount: string;
  type_hash: string;
  type_script: {
    code_hash: string;
    hash_type: string;
    args: string;
  };
}

/** RGB++ transaction state */
export type RgbppTxState = 'completed' | 'failed' | 'delayed' | 'active' | 'waiting';

/** Leap transaction result */
export interface LeapResult {
  btcTxId: string;
  state: RgbppTxState;
  ckbTxHash?: string;
}

/** RGB++ Bridge configuration */
export interface RgbppBridgeConfig {
  /** RGB++ network (testnet/signet/mainnet) */
  network?: RgbppNetwork;
  /** BtcAssetsApi access token (free for testnet) */
  serviceToken?: string;
  /** Service URL override */
  serviceUrl?: string;
  /** CKB RPC URL for CKB transactions */
  ckbRpcUrl?: string;
  /** App origin for token validation */
  origin?: string;
}

// ═══════════════════════════════════════════════════════════
//  RGB++ Bridge
// ═══════════════════════════════════════════════════════════

/**
 * RgbppBridge — BTC ↔ CKB Asset Bridge for AgentPay
 *
 * Provides RGB++ asset operations:
 * - Query BTC address RGB++ balances
 * - Leap xUDT from BTC to CKB (for Fiber channel deposit)
 * - Leap xUDT from CKB to BTC (withdraw)
 * - Track leap transaction status
 *
 * ```ts
 * const bridge = new RgbppBridge({
 *   network: 'testnet',
 *   serviceToken: 'your_token',
 * });
 *
 * // Query RGB++ assets on a BTC address
 * const balance = await bridge.getAssets('tb1q...');
 *
 * // Leap xUDT from BTC to CKB (for Fiber deposit)
 * const leap = await bridge.leapToCkb({
 *   btcAddress: 'tb1q...',
 *   toCkbAddress: 'ckt1q...',
 *   xudtTypeArgs: '0x...',
 *   amount: '100000000',
 * });
 * ```
 */
export class RgbppBridge {
  private readonly serviceUrl: string;
  private readonly network: RgbppNetwork;
  private readonly serviceToken: string;
  private readonly ckbRpcUrl: string;
  private readonly origin: string;

  constructor(config: RgbppBridgeConfig = {}) {
    this.network = config.network || 'testnet';
    this.serviceUrl = config.serviceUrl || RGBPP_SERVICE_URLS[this.network];
    this.serviceToken = config.serviceToken || process.env.RGBPP_SERVICE_TOKEN || '';
    this.ckbRpcUrl = config.ckbRpcUrl || process.env.CKB_RPC_URL || 'https://testnet.ckb.dev';
    this.origin = config.origin || 'https://agentpay.dev';

    log.info({
      msg: 'RgbppBridge initialized',
      network: this.network,
      serviceUrl: this.serviceUrl,
      ckbRpcUrl: this.ckbRpcUrl,
    });
  }

  // ─── Asset Query ─────────────────────────────────────────

  /**
   * Get RGB++ xUDT balances for a BTC address
   *
   * Uses BtcAssetsApi: GET /rgbpp/v1/address/{btcAddress}/balance
   */
  async getAssets(btcAddress: string): Promise<RgbppAssetBalance[]> {
    if (!btcAddress) throw new Error('btcAddress is required');

    log.info({ msg: 'Querying RGB++ assets', btcAddress });

    const res = await this.apiCall(`/rgbpp/v1/address/${btcAddress}/balance`);
    const data = res as { address: string; xudt: RgbppAssetBalance[] };
    return data.xudt || [];
  }

  /**
   * Get RGB++ assets bound to a specific BTC UTXO
   *
   * Uses BtcAssetsApi: GET /rgbpp/v1/btc-spv/btc_txid/{txid}/{vout}
   */
  async getAssetsByUtxo(btcTxId: string, vout: number): Promise<unknown[]> {
    if (!btcTxId) throw new Error('btcTxId is required');

    log.info({ msg: 'Querying UTXO assets', btcTxId, vout });

    return this.apiCall(`/rgbpp/v1/assets/${btcTxId}/${vout}`) as Promise<unknown[]>;
  }

  /**
   * Get BTC address balance (sats)
   */
  async getBtcBalance(btcAddress: string): Promise<{
    address: string;
    satoshi: number;
    pending_satoshi: number;
    utxo_count: number;
  }> {
    if (!btcAddress) throw new Error('btcAddress is required');

    return this.apiCall(`/bitcoin/v1/address/${btcAddress}/balance`) as any;
  }

  // ─── Leap: BTC → CKB ────────────────────────────────────

  /**
   * Leap xUDT from BTC to CKB
   *
   * This is the key operation that brings BTC-native RGB++ assets
   * into CKB, where they become xUDT and can be deposited into
   * Fiber payment channels.
   *
   * Flow:
   * 1. genBtcJumpCkbVirtualTx (create CKB virtual tx)
   * 2. Build isomorphic BTC tx with commitment
   * 3. Sign + broadcast BTC tx
   * 4. Submit to RGB++ CKB tx queue
   * 5. Queue processes: verify → finalize → broadcast CKB tx
   *
   * Note: This is an async operation. The CKB tx confirmation
   * may take several minutes after the BTC tx is confirmed.
   *
   * @returns LeapResult with btcTxId and initial state
   */
  async leapToCkb(params: {
    /** Source BTC UTXO tx id */
    btcUtxoTxId: string;
    /** Source BTC UTXO output index */
    btcUtxoVout: number;
    /** xUDT type script args (identifies the token) */
    xudtTypeArgs: string;
    /** Amount to transfer */
    amount: string;
    /** Destination CKB address */
    toCkbAddress: string;
    /** BTC private key (WIF format) for signing */
    btcPrivateKey: string;
  }): Promise<LeapResult> {
    log.info({
      msg: 'Initiating RGB++ Leap: BTC → CKB',
      btcUtxo: `${params.btcUtxoTxId}:${params.btcUtxoVout}`,
      xudtType: params.xudtTypeArgs.slice(0, 20) + '...',
      amount: params.amount,
      toCkbAddress: params.toCkbAddress.slice(0, 20) + '...',
    });

    // RGB++ Leap requires the full SDK for tx construction + signing.
    // This is the high-level orchestration; actual implementation uses:
    //   1. @rgbpp-sdk/ckb: genBtcJumpCkbVirtualTx()
    //   2. @rgbpp-sdk/btc: build + sign isomorphic BTC tx
    //   3. @rgbpp-sdk/service: sendRgbppCkbTransaction()

    try {
      // Dynamic import — only loads RGB++ SDK when actually doing Leap
      // @ts-ignore — optional runtime dependency (installed by user)
      const { genBtcJumpCkbVirtualTx } = await import('@rgbpp-sdk/ckb');
      // @ts-ignore — optional runtime dependency
      const { BtcAssetsApi } = await import('@rgbpp-sdk/service');

      const service = BtcAssetsApi.fromToken(
        this.serviceUrl,
        this.serviceToken,
        this.origin,
      );

      // Step 1: Build CKB virtual transaction
      const isMainnet = this.network === 'mainnet';

      // Construct rgbppLockArgs from UTXO: out_index | bitcoin_tx_id
      const voutHex = params.btcUtxoVout.toString(16).padStart(8, '0');
      const rgbppLockArgs = `0x${voutHex}${params.btcUtxoTxId.replace('0x', '')}`;

      // Serialize xUDT type script bytes for the SDK
      const xudtTypeBytes = serializeXudtType(params.xudtTypeArgs, isMainnet);

      const ckbVirtualResult = await genBtcJumpCkbVirtualTx({
        collector: await createCkbCollector(this.ckbRpcUrl),
        xudtTypeBytes,
        rgbppLockArgsList: [rgbppLockArgs],
        transferAmount: BigInt(params.amount),
        toCkbAddress: params.toCkbAddress,
        isMainnet,
      });

      log.info({
        msg: 'CKB virtual tx created',
        commitment: ckbVirtualResult.commitment,
        needPaymaster: ckbVirtualResult.needPaymasterCell,
      });

      // Step 2: Build and sign isomorphic BTC transaction
      // @ts-ignore — optional runtime dependency
      const { buildRgbppBtcTx } = await import('@rgbpp-sdk/btc');
      const btcTx = await buildRgbppBtcTx({
        ckbVirtualTx: ckbVirtualResult.ckbRawTx,
        commitment: ckbVirtualResult.commitment,
        btcUtxos: [{ txid: params.btcUtxoTxId, vout: params.btcUtxoVout }],
        btcPrivateKey: params.btcPrivateKey,
        isMainnet,
      });

      // Step 3: Broadcast BTC tx
      const btcTxId = (await service.sendBtcTransaction(btcTx.toHex())) as any as string;

      log.info({ msg: 'BTC tx broadcast', btcTxId });

      // Step 4: Submit to RGB++ CKB tx queue
      await service.sendRgbppCkbTransaction({
        btc_txid: btcTxId,
        ckb_virtual_result: {
          ckbRawTx: ckbVirtualResult.ckbRawTx,
          needPaymasterCell: ckbVirtualResult.needPaymasterCell,
          sumInputsCapacity: ckbVirtualResult.sumInputsCapacity,
          commitment: ckbVirtualResult.commitment,
        },
      });

      log.info({ msg: 'Submitted to RGB++ CKB tx queue', btcTxId: String(btcTxId) });

      return {
        btcTxId: String(btcTxId),
        state: 'waiting' as const,
      };
    } catch (error: any) {
      log.error({ msg: 'Leap BTC→CKB failed', error: error.message });
      throw new Error(`RGB++ Leap BTC→CKB failed: ${error.message}`);
    }
  }

  // ─── Leap: CKB → BTC ────────────────────────────────────

  /**
   * Leap xUDT from CKB to BTC
   *
   * Withdraws RGB++ assets from CKB back to BTC.
   * Useful when an Agent wants to cash out earnings.
   */
  async leapToBtc(params: {
    /** xUDT type script args */
    xudtTypeArgs: string;
    /** Amount to transfer */
    amount: string;
    /** Source CKB address */
    fromCkbAddress: string;
    /** Destination BTC UTXO (out_index | bitcoin_tx_id) */
    toRgbppLockArgs: string;
    /** CKB private key for signing */
    ckbPrivateKey: string;
  }): Promise<{ ckbTxHash: string }> {
    log.info({
      msg: 'Initiating RGB++ Leap: CKB → BTC',
      xudtType: params.xudtTypeArgs.slice(0, 20) + '...',
      amount: params.amount,
    });

    try {
      // @ts-ignore — optional runtime dependency
      const { genCkbJumpBtcVirtualTx } = await import('@rgbpp-sdk/ckb');

      const isMainnet = this.network === 'mainnet';
      const xudtTypeBytes = serializeXudtType(params.xudtTypeArgs, isMainnet);

      const ckbRawTx = await (genCkbJumpBtcVirtualTx as any)({
        collector: await createCkbCollector(this.ckbRpcUrl),
        xudtTypeBytes,
        fromCkbAddress: params.fromCkbAddress,
        toRgbppLockArgs: params.toRgbppLockArgs,
        transferAmount: BigInt(params.amount),
      });

      // Sign and send CKB transaction
      const ckbTxHash = await signAndSendCkbTx(ckbRawTx, params.ckbPrivateKey, this.ckbRpcUrl);

      log.info({ msg: 'CKB→BTC Leap tx sent', ckbTxHash });

      return { ckbTxHash };
    } catch (error: any) {
      log.error({ msg: 'Leap CKB→BTC failed', error: error.message });
      throw new Error(`RGB++ Leap CKB→BTC failed: ${error.message}`);
    }
  }

  // ─── Leap Status ─────────────────────────────────────────

  /**
   * Check the status of a Leap transaction
   *
   * States: waiting → active → completed/failed
   */
  async getLeapStatus(btcTxId: string): Promise<{
    state: RgbppTxState;
    ckbTxHash?: string;
    failedReason?: string;
  }> {
    if (!btcTxId) throw new Error('btcTxId is required');

    const stateRes = await this.apiCall(`/rgbpp/v1/transaction/${btcTxId}/state`) as any;
    const hashRes = await this.apiCall(`/rgbpp/v1/transaction/${btcTxId}`).catch(() => null) as any;

    return {
      state: stateRes.state,
      ckbTxHash: hashRes?.txhash,
      failedReason: stateRes.failedReason,
    };
  }

  // ─── Paymaster Info ──────────────────────────────────────

  /**
   * Get RGB++ paymaster info (required for BTC→CKB Leap)
   */
  async getPaymasterInfo(): Promise<{ btc_address: string; fee: number }> {
    return this.apiCall('/rgbpp/v1/paymaster/info') as any;
  }

  // ─── Internal ────────────────────────────────────────────

  private async apiCall(path: string): Promise<unknown> {
    const url = `${this.serviceUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.serviceToken) {
      headers['Authorization'] = `Bearer ${this.serviceToken}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`RGB++ API ${res.status}: ${text}`);
      }

      return res.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════

/**
 * Serialize xUDT type script for RGB++ SDK
 *
 * The xUDT type script identifies which token is being transferred.
 * Format: code_hash (32 bytes) + hash_type (1 byte) + args (variable)
 */
function serializeXudtType(args: string, isMainnet: boolean): string {
  // xUDT code hash (same for testnet and mainnet from CKB script deployment)
  const XUDT_CODE_HASH = isMainnet
    ? '0x50bd8d6680b8b9cf98b73f3c08faf8b2a21914311954118ad6609571a33571555'
    : '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb';

  // Molecule serialization: code_hash + hash_type + args_length + args
  const codeHash = XUDT_CODE_HASH.replace('0x', '');
  const hashType = '01'; // type
  const argsClean = args.replace('0x', '');
  const argsLen = (argsClean.length / 2).toString(16).padStart(8, '0');

  return `0x${codeHash}${hashType}${argsLen}${argsClean}`;
}

/**
 * Create CKB collector for RGB++ SDK
 *
 * The collector queries CKB live cells for building transactions.
 */
async function createCkbCollector(ckbRpcUrl: string): Promise<any> {
  // Dynamic import to avoid requiring @ckb-lumos at install time
  try {
    // @ts-ignore — optional runtime dependency
    const { Indexer } = await import('@ckb-lumos/ckb-indexer');
    return new Indexer(ckbRpcUrl);
  } catch {
    // Fallback: simple HTTP-based collector
    return {
      getCells: async (searchKey: any) => {
        const res = await fetch(ckbRpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'get_cells',
            params: [searchKey, 'asc', '0x64'],
          }),
        });
        const data = await res.json() as any;
        return data.result?.objects || [];
      },
    };
  }
}

/**
 * Sign and send CKB transaction
 */
async function signAndSendCkbTx(
  rawTx: any,
  privateKey: string,
  ckbRpcUrl: string,
): Promise<string> {
  const res = await fetch(ckbRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'send_transaction',
      params: [rawTx, 'passthrough'],
    }),
  });

  const data = await res.json() as any;
  if (data.error) {
    throw new Error(`CKB send_transaction failed: ${data.error.message}`);
  }
  return data.result;
}

// ═══════════════════════════════════════════════════════════
//  Factory
// ═══════════════════════════════════════════════════════════

/**
 * Create an RgbppBridge instance from environment variables
 *
 * Reads:
 * - RGBPP_NETWORK (default: testnet)
 * - RGBPP_SERVICE_TOKEN
 * - CKB_RPC_URL (default: https://testnet.ckb.dev)
 */
export function createRgbppBridge(overrides?: Partial<RgbppBridgeConfig>): RgbppBridge {
  return new RgbppBridge({
    network: (process.env.RGBPP_NETWORK as RgbppNetwork) || 'testnet',
    serviceToken: process.env.RGBPP_SERVICE_TOKEN,
    ckbRpcUrl: process.env.CKB_RPC_URL,
    ...overrides,
  });
}
