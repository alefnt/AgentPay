/**
 * Tests for Fiber RPC Client
 * Uses mock HTTP server to simulate Fiber node responses.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { FiberRpcClient, FiberRpcError } from '../src/fiber-rpc.js';

// Mock Fiber node RPC server
let server: Server;
let port: number;

const MOCK_PUBKEY = '0x02abc123def456789abc123def456789abc123def456789abc123def456789abcd01';
const MOCK_CHANNEL_ID = '0xaa11bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44';
const MOCK_PAYMENT_HASH = '0xff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00';

function handleRpcRequest(method: string, params: any): any {
  switch (method) {
    case 'node_info':
      return {
        node_name: 'test-node',
        public_key: MOCK_PUBKEY,
        addresses: ['/ip4/127.0.0.1/tcp/8119/p2p/test'],
        chain_hash: '0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606',
        open_channel_count: 2,
        pending_channel_count: 0,
        peers_count: 3,
        network_sync_status: 'Synced',
        udt_cfg_infos: {},
      };

    case 'open_channel':
      return { temporary_channel_id: MOCK_CHANNEL_ID };

    case 'list_channels':
      return {
        channels: [
          {
            channel_id: MOCK_CHANNEL_ID,
            is_public: true,
            is_acceptor: false,
            is_one_way: false,
            pubkey: params[0]?.pubkey || MOCK_PUBKEY,
            state: { ChannelReady: null },
            local_balance: '0x3b9aca00',  // 1 CKB
            offered_tlc_balance: '0x0',
            remote_balance: '0x3b9aca00',
            received_tlc_balance: '0x0',
            pending_tlcs: [],
            created_at: '1710000000000',
            enabled: true,
            tlc_expiry_delta: '86400000',
            tlc_fee_proportional_millionths: '1000',
          },
        ],
      };

    case 'shutdown_channel':
      return null;

    case 'new_invoice':
      return {
        invoice_address: 'fibt1qtest_invoice_address_mock_123',
        invoice: {
          currency: params[0]?.currency || 'Fibt',
          amount: params[0]?.amount || '0x5f5e100',
          data: {
            timestamp: '1710000000',
            payment_hash: params[0]?.payment_hash || MOCK_PAYMENT_HASH,
            attrs: [{ Description: params[0]?.description || 'test' }],
          },
        },
      };

    case 'get_invoice':
      return {
        invoice_address: 'fibt1qtest_invoice_address_mock_123',
        invoice: {
          currency: 'Fibt',
          amount: '0x5f5e100',
          data: {
            timestamp: '1710000000',
            payment_hash: params[0]?.payment_hash || MOCK_PAYMENT_HASH,
            attrs: [],
          },
        },
        status: 'Open',
      };

    case 'settle_invoice':
      return null;

    case 'cancel_invoice':
      return {
        invoice_address: 'fibt1qtest_cancelled',
        invoice: { currency: 'Fibt', amount: '0x5f5e100', data: { timestamp: '1710000000', payment_hash: MOCK_PAYMENT_HASH, attrs: [] } },
        status: 'Cancelled',
      };

    case 'send_payment':
      return {
        payment_hash: params[0]?.payment_hash || MOCK_PAYMENT_HASH,
        status: params[0]?.dry_run ? 'Created' : 'Success',
        created_at: '1710000000000',
        last_updated_at: '1710000001000',
        fee: '0x186a0',  // 100000 shannons
        routers: [],
      };

    case 'get_payment':
      return {
        payment_hash: params[0]?.payment_hash || MOCK_PAYMENT_HASH,
        status: 'Success',
        created_at: '1710000000000',
        last_updated_at: '1710000001000',
        fee: '0x186a0',
        routers: [],
      };

    case 'send_btc':
      return {
        timestamp: '1710000000',
        expiry_delta_seconds: '3600',
        wrapped_btc_type_script: { code_hash: '0x00', hash_type: 'type', args: '0x00' },
        incoming_invoice: { invoice: 'fibt1q_cch_invoice', final_tlc_expiry_delta: '86400000' },
        outgoing_pay_req: params[0]?.btc_pay_req,
        payment_hash: MOCK_PAYMENT_HASH,
        amount_sats: '0x2710',
        fee_sats: '0x64',
        status: 'Pending',
      };

    case 'receive_btc':
      return {
        timestamp: '1710000000',
        expiry_delta_seconds: '3600',
        wrapped_btc_type_script: { code_hash: '0x00', hash_type: 'type', args: '0x00' },
        incoming_invoice: { invoice: 'lnbc1_btc_invoice', final_tlc_expiry_delta: '86400000' },
        outgoing_pay_req: params[0]?.fiber_pay_req,
        payment_hash: MOCK_PAYMENT_HASH,
        amount_sats: '0x2710',
        fee_sats: '0x64',
        status: 'Pending',
      };

    case 'connect_peer':
    case 'disconnect_peer':
    case 'update_channel':
    case 'abandon_channel':
      return null;

    case 'graph_nodes':
      return { nodes: [], last_cursor: '' };

    case 'graph_channels':
      return { channels: [], last_cursor: '' };

    default:
      throw { code: -32601, message: `Method not found: ${method}` };
  }
}

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { method, params, id } = JSON.parse(body);
        const result = handleRpcRequest(method, params);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
      } catch (err: any) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: 0, error: err }));
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

// ─── Tests ─────────────────────────────────────────────────

describe('FiberRpcClient', () => {
  let client: FiberRpcClient;

  beforeAll(() => {
    client = new FiberRpcClient({ rpcUrl: `http://127.0.0.1:${port}` });
  });

  // ── Info Module ──
  describe('Info', () => {
    it('should get node info', async () => {
      const info = await client.nodeInfo();
      expect(info.public_key).toBe(MOCK_PUBKEY);
      expect(info.node_name).toBe('test-node');
      expect(info.open_channel_count).toBe(2);
      expect(info.peers_count).toBe(3);
    });
  });

  // ── Channel Module ──
  describe('Channel', () => {
    it('should open a channel', async () => {
      const result = await client.openChannel({
        pubkey: MOCK_PUBKEY,
        funding_amount: '0x3b9aca00',
      });
      expect(result.temporary_channel_id).toBe(MOCK_CHANNEL_ID);
    });

    it('should list channels', async () => {
      const result = await client.listChannels();
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].channel_id).toBe(MOCK_CHANNEL_ID);
      expect(result.channels[0].is_public).toBe(true);
      expect(result.channels[0].local_balance).toBe('0x3b9aca00');
    });

    it('should list channels filtered by pubkey', async () => {
      const result = await client.listChannels({ pubkey: MOCK_PUBKEY });
      expect(result.channels).toHaveLength(1);
    });

    it('should shutdown a channel', async () => {
      await expect(client.shutdownChannel({
        channel_id: MOCK_CHANNEL_ID,
      })).resolves.toBeNull();
    });

    it('should update channel', async () => {
      await expect(client.updateChannel({
        channel_id: MOCK_CHANNEL_ID,
        tlc_fee_proportional_millionths: '2000',
      })).resolves.toBeNull();
    });
  });

  // ── Invoice Module ──
  describe('Invoice', () => {
    it('should create a regular invoice', async () => {
      const result = await client.newInvoice({
        amount: '0x5f5e100',
        currency: 'Fibt',
        description: 'Test payment',
      });
      expect(result.invoice_address).toContain('fibt1q');
      expect(result.invoice.currency).toBe('Fibt');
    });

    it('should create a hold invoice (hash only, no preimage)', async () => {
      const result = await client.newInvoice({
        amount: '0x5f5e100',
        currency: 'Fibt',
        payment_hash: MOCK_PAYMENT_HASH,
        description: 'Hold invoice for AgentPay',
      });
      expect(result.invoice.data.payment_hash).toBe(MOCK_PAYMENT_HASH);
    });

    it('should get an invoice by hash', async () => {
      const result = await client.getInvoice({ payment_hash: MOCK_PAYMENT_HASH });
      expect(result.status).toBe('Open');
    });

    it('should cancel an invoice', async () => {
      const result = await client.cancelInvoice({ payment_hash: MOCK_PAYMENT_HASH });
      expect(result.status).toBe('Cancelled');
    });

    it('should settle a hold invoice', async () => {
      await expect(client.settleInvoice({
        payment_hash: MOCK_PAYMENT_HASH,
        payment_preimage: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      })).resolves.toBeNull();
    });
  });

  // ── Payment Module ──
  describe('Payment', () => {
    it('should send a payment by invoice', async () => {
      const result = await client.sendPayment({
        invoice: 'fibt1q_test_invoice',
        timeout: 30,
      });
      expect(result.status).toBe('Success');
      expect(result.payment_hash).toBe(MOCK_PAYMENT_HASH);
    });

    it('should send a keysend payment', async () => {
      const result = await client.sendPayment({
        target_pubkey: MOCK_PUBKEY,
        amount: '0x5f5e100',
        keysend: true,
      });
      expect(result.status).toBe('Success');
    });

    it('should dry-run a payment', async () => {
      const result = await client.sendPayment({
        invoice: 'fibt1q_test_invoice',
        dry_run: true,
      });
      expect(result.status).toBe('Created');
    });

    it('should get a payment status', async () => {
      const result = await client.getPayment({ payment_hash: MOCK_PAYMENT_HASH });
      expect(result.status).toBe('Success');
      expect(result.fee).toBe('0x186a0');
    });
  });

  // ── Cch Module (BTC Lightning) ──
  describe('Cch (Cross-Chain Hub)', () => {
    it('should create a send_btc order', async () => {
      const result = await client.sendBtc({
        btc_pay_req: 'lnbc10000n1p0test',
        currency: 'Fibt',
      });
      expect(result.status).toBe('Pending');
      expect(result.payment_hash).toBe(MOCK_PAYMENT_HASH);
      expect(result.outgoing_pay_req).toBe('lnbc10000n1p0test');
    });

    it('should create a receive_btc order', async () => {
      const result = await client.receiveBtc({
        fiber_pay_req: 'fibt1q_receive_btc',
      });
      expect(result.status).toBe('Pending');
      expect(result.incoming_invoice.invoice).toContain('lnbc');
    });
  });

  // ── Error Handling ──
  describe('Error Handling', () => {
    it('should throw FiberRpcError on unknown method', async () => {
      const badClient = new FiberRpcClient({ rpcUrl: `http://127.0.0.1:${port}` });
      await expect(
        (badClient as any).call('nonexistent_method', {}),
      ).rejects.toThrow(FiberRpcError);
    });

    it('should throw on connection failure', async () => {
      const badClient = new FiberRpcClient({ rpcUrl: 'http://127.0.0.1:1' });
      await expect(badClient.nodeInfo()).rejects.toThrow();
    });
  });
});
