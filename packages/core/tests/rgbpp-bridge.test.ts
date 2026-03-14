/**
 * RGB++ Bridge Unit Tests
 *
 * Tests RgbppBridge: initialization, asset query, Leap status, error handling.
 * Uses mock BtcAssetsApi to avoid real API calls.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { RgbppBridge, RGBPP_SERVICE_URLS, createRgbppBridge } from '../src/rgbpp-bridge.js';

// ═══════════════════════════════════════════════════════════
//  Mock BtcAssetsApi
// ═══════════════════════════════════════════════════════════

let mockApi: Server;
let mockPort: number;

const MOCK_ASSETS: any[] = [
  {
    name: 'TestUDT',
    symbol: 'TUDT',
    decimal: 8,
    total_amount: '100000000',
    available_amount: '90000000',
    pending_amount: '10000000',
    type_hash: '0xabcd1234',
    type_script: {
      code_hash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
      hash_type: 'type',
      args: '0xtest_args_001',
    },
  },
];

beforeAll(async () => {
  mockApi = createServer((req, res) => {
    const url = req.url || '';
    res.writeHead(200, { 'Content-Type': 'application/json' });

    if (url.includes('/rgbpp/v1/address/') && url.includes('/balance')) {
      res.end(JSON.stringify({ address: 'tb1qtest', xudt: MOCK_ASSETS }));
    } else if (url.includes('/rgbpp/v1/assets/')) {
      res.end(JSON.stringify([{ cell_output: {}, data: '0x' }]));
    } else if (url.includes('/bitcoin/v1/address/') && url.includes('/balance')) {
      res.end(JSON.stringify({
        address: 'tb1qtest', satoshi: 50000, pending_satoshi: 0, utxo_count: 3,
      }));
    } else if (url.includes('/rgbpp/v1/transaction/') && url.includes('/state')) {
      res.end(JSON.stringify({ state: 'completed', attempts: 1 }));
    } else if (url.includes('/rgbpp/v1/transaction/')) {
      res.end(JSON.stringify({ txhash: '0xckb_tx_hash_mock' }));
    } else if (url.includes('/rgbpp/v1/paymaster/info')) {
      res.end(JSON.stringify({ btc_address: 'tb1qpaymaster', fee: 546 }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });

  await new Promise<void>((resolve) => {
    mockApi.listen(0, () => { mockPort = (mockApi.address() as any).port; resolve(); });
  });
});

afterAll(() => { mockApi?.close(); });

// ═══════════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════════

describe('RgbppBridge Initialization', () => {
  it('should initialize with default testnet config', () => {
    const bridge = new RgbppBridge();
    expect(bridge).toBeDefined();
  });

  it('should initialize with custom service URL', () => {
    const bridge = new RgbppBridge({
      serviceUrl: `http://127.0.0.1:${mockPort}`,
      network: 'testnet',
    });
    expect(bridge).toBeDefined();
  });

  it('should have correct service URLs', () => {
    expect(RGBPP_SERVICE_URLS.testnet).toBe('https://api.testnet.rgbpp.io');
    expect(RGBPP_SERVICE_URLS.signet).toBe('https://api.signet.rgbpp.io');
    expect(RGBPP_SERVICE_URLS.mainnet).toBe('https://api.rgbpp.io');
  });

  it('should create bridge from env factory', () => {
    const bridge = createRgbppBridge({ serviceUrl: `http://127.0.0.1:${mockPort}` });
    expect(bridge).toBeDefined();
  });
});

describe('RgbppBridge Asset Query', () => {
  let bridge: RgbppBridge;

  beforeAll(() => {
    bridge = new RgbppBridge({
      serviceUrl: `http://127.0.0.1:${mockPort}`,
      network: 'testnet',
    });
  });

  it('should query RGB++ assets by BTC address', async () => {
    const assets = await bridge.getAssets('tb1qtest');
    expect(assets.length).toBe(1);
    expect(assets[0].symbol).toBe('TUDT');
    expect(assets[0].total_amount).toBe('100000000');
    expect(assets[0].available_amount).toBe('90000000');
  });

  it('should reject empty BTC address', async () => {
    await expect(bridge.getAssets('')).rejects.toThrow('btcAddress is required');
  });

  it('should query assets by UTXO', async () => {
    const assets = await bridge.getAssetsByUtxo('0xtxid_test', 0);
    expect(Array.isArray(assets)).toBe(true);
  });

  it('should reject empty UTXO txid', async () => {
    await expect(bridge.getAssetsByUtxo('', 0)).rejects.toThrow('btcTxId is required');
  });

  it('should query BTC balance', async () => {
    const balance = await bridge.getBtcBalance('tb1qtest');
    expect(balance.satoshi).toBe(50000);
    expect(balance.utxo_count).toBe(3);
  });

  it('should reject empty BTC address for balance', async () => {
    await expect(bridge.getBtcBalance('')).rejects.toThrow('btcAddress is required');
  });
});

describe('RgbppBridge Leap Status', () => {
  let bridge: RgbppBridge;

  beforeAll(() => {
    bridge = new RgbppBridge({
      serviceUrl: `http://127.0.0.1:${mockPort}`,
      network: 'testnet',
    });
  });

  it('should check Leap transaction status', async () => {
    const status = await bridge.getLeapStatus('0xbtc_tx_id_test');
    expect(status.state).toBe('completed');
    expect(status.ckbTxHash).toBe('0xckb_tx_hash_mock');
  });

  it('should reject empty btcTxId', async () => {
    await expect(bridge.getLeapStatus('')).rejects.toThrow('btcTxId is required');
  });
});

describe('RgbppBridge Paymaster', () => {
  it('should get paymaster info', async () => {
    const bridge = new RgbppBridge({
      serviceUrl: `http://127.0.0.1:${mockPort}`,
      network: 'testnet',
    });
    const info = await bridge.getPaymasterInfo();
    expect(info.btc_address).toBe('tb1qpaymaster');
    expect(info.fee).toBe(546);
  });
});
