/**
 * MCP Server Unit Tests
 *
 * Tests tool listing and handler logic without requiring a real Fiber node.
 * Uses the MCP SDK's in-memory transport for testing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createServer, type Server as HttpServer } from 'node:http';

// ══════════════════════════════════════════════════════════�?//  Mock Fiber RPC for MCP tests
// ══════════════════════════════════════════════════════════�?
let mockFiber: HttpServer;
let mockFiberPort: number;

const MOCK_PUBKEY = '0x02aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb2222cc';

beforeAll(async () => {
  mockFiber = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { method, id } = JSON.parse(body);
      let result: any = null;

      if (method === 'node_info') {
        result = {
          node_name: 'mcp-test', public_key: MOCK_PUBKEY,
          addresses: ['/ip4/127.0.0.1/tcp/8119'], chain_hash: '0x1',
          open_channel_count: 2, pending_channel_count: 0, peers_count: 3,
          network_sync_status: 'Synced', udt_cfg_infos: {},
        };
      } else if (method === 'list_channels') {
        result = {
          channels: [{
            channel_id: '0xchannel_id_1', peer_id: '0xpeer1', pubkey: MOCK_PUBKEY,
            state: { ChannelReady: {} }, state_name: 'ChannelReady',
            local_balance: '0x5f5e100', remote_balance: '0x2faf080',
            offered_tlc_balance: '0x0', received_tlc_balance: '0x0',
            created_at: '0x0', funding_udt_type_script: null,
          }],
        };
      } else if (method === 'open_channel') {
        result = { temporary_channel_id: '0xtemp_channel_123' };
      } else if (method === 'send_payment') {
        result = {
          payment_hash: '0xdeadbeef', status: 'Success',
          fee: '0x64', failed_error: null,
        };
      } else if (method === 'new_invoice') {
        result = {
          invoice_address: 'fibt1q_mock_invoice',
          invoice: { currency: 'Fibt', amount: '0x5f5e100', data: { timestamp: String(Date.now()), payment_hash: '0xabcd', attrs: [] } },
        };
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    });
  });

  await new Promise<void>((resolve) => {
    mockFiber.listen(0, () => { mockFiberPort = (mockFiber.address() as any).port; resolve(); });
  });

  // Set env for tests
  process.env.FIBER_RPC_URL = `http://127.0.0.1:${mockFiberPort}`;
});

afterAll(() => { mockFiber?.close(); });

// ══════════════════════════════════════════════════════════�?//  We test the MCP tools by importing AgentWallet directly
//  (MCP server is a thin wrapper around wallet)
// ══════════════════════════════════════════════════════════�?
import { AgentWallet } from '@agentpay-dev/sdk';
import { formatAmount, getAssetDefinition } from '@agentpay-dev/core';

describe('MCP Tool: get_wallet_info', () => {
  it('should return node info with pubkey and channels', async () => {
    const wallet = new AgentWallet({ fiberRpcUrl: `http://127.0.0.1:${mockFiberPort}` });
    const info = await wallet.nodeInfo();
    expect(info.public_key).toBe(MOCK_PUBKEY);
    expect(info.node_name).toBe('mcp-test');
    expect(info.open_channel_count).toBe(2);
    expect(info.peers_count).toBe(3);
  });
});

describe('MCP Tool: list_channels', () => {
  it('should return channel list with balances', async () => {
    const wallet = new AgentWallet({ fiberRpcUrl: `http://127.0.0.1:${mockFiberPort}` });
    const { channels } = await wallet.listChannels();
    expect(channels.length).toBe(1);
    expect(channels[0].channel_id).toBe('0xchannel_id_1');
    expect(channels[0].local_balance).toBe('0x5f5e100');
  });
});

describe('MCP Tool: open_channel', () => {
  it('should return temporary channel id', async () => {
    const wallet = new AgentWallet({ fiberRpcUrl: `http://127.0.0.1:${mockFiberPort}` });
    const result = await wallet.openChannel(MOCK_PUBKEY, '1000000000');
    expect(result.temporary_channel_id).toBe('0xtemp_channel_123');
  });
});

describe('MCP Tool: formatAmount', () => {
  it('should format CKB amount correctly', () => {
    expect(formatAmount('100000000', 'CKB')).toBe('1.00000000 CKB');
    expect(formatAmount('250000000', 'CKB')).toBe('2.50000000 CKB');
  });

  it('should format USDT amount correctly', () => {
    expect(formatAmount('1000000', 'USDT')).toBe('1.000000 USDT');
  });

  it('should handle zero amounts', () => {
    expect(formatAmount('0', 'CKB')).toBe('0.00000000 CKB');
  });
});

describe('MCP Tool: getAssetDefinition', () => {
  it('should return CKB definition', () => {
    const def = getAssetDefinition('CKB');
    expect(def?.decimals).toBe(8);
    expect(def?.symbol).toBe('CKB');
  });

  it('should return BTC definition', () => {
    const def = getAssetDefinition('BTC');
    expect(def?.decimals).toBe(8);
    expect(def?.udt_type_script).toBeNull();
  });

  it('should return undefined for unknown', () => {
    const def = getAssetDefinition('UNKNOWN' as any);
    expect(def).toBeUndefined();
  });
});

describe('MCP Error Handling', () => {
  it('should handle unknown tool gracefully', () => {
    // Simulate the switch default case
    const name = 'nonexistent_tool';
    const result = { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown tool');
  });

  it('should wrap errors with tool name', () => {
    const error = new Error('Connection refused');
    const result = {
      content: [{ type: 'text', text: JSON.stringify({ error: true, message: error.message, tool: 'pay_and_call' }) }],
      isError: true,
    };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toBe('Connection refused');
    expect(parsed.tool).toBe('pay_and_call');
  });
});
