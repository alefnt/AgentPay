#!/usr/bin/env node
/**
 * AgentPay MCP Server
 *
 * Exposes AgentPay capabilities as MCP tools for AI assistants
 * (Claude, GPT, etc.) to make payments and call paid services.
 *
 * Usage:
 *   npx agentpay-mcp
 *
 * Claude Desktop config (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "agentpay": {
 *         "command": "npx",
 *         "args": ["agentpay-mcp"],
 *         "env": {
 *           "FIBER_RPC_URL": "http://127.0.0.1:8227"
 *         }
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { AgentWallet } from '@agentpay-dev/sdk';
import { formatAmount, getAssetDefinition } from '@agentpay-dev/core';

// ══════════════════════════════════════════════════════════�?//  Initialize
// ══════════════════════════════════════════════════════════�?
const wallet = new AgentWallet({
  fiberRpcUrl: process.env.FIBER_RPC_URL || 'http://127.0.0.1:8227',
  currency: (process.env.FIBER_CURRENCY as any) || 'Fibt',
});

const server = new Server(
  { name: 'agentpay', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

// ══════════════════════════════════════════════════════════�?//  Tool Definitions
// ══════════════════════════════════════════════════════════�?
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'pay_and_call',
      description:
        'Pay another AI agent and call their service via CKB Fiber Network. ' +
        'Supports CKB, BTC, USDT, USDC payments. ' +
        'The payment is trustless: funds are locked until the service completes.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          provider_url: {
            type: 'string',
            description: 'HTTP URL of the service provider agent',
          },
          service: {
            type: 'string',
            description: 'Name of the service to call (e.g., "translate", "summarize")',
          },
          input: {
            type: 'object',
            description: 'Input data for the service',
          },
          max_budget: {
            type: 'string',
            description: 'Maximum budget in shannons (1 CKB = 100000000 shannons)',
            default: '100000000',
          },
          asset: {
            type: 'string',
            enum: ['CKB', 'BTC', 'USDT', 'USDC', 'USDI'],
            description: 'Payment asset type',
            default: 'CKB',
          },
        },
        required: ['provider_url', 'service', 'input'],
      },
    },
    {
      name: 'get_wallet_info',
      description:
        'Get information about the connected Fiber node including pubkey, channels, and peers.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
    {
      name: 'list_channels',
      description: 'List all open payment channels on the Fiber Network.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
    {
      name: 'open_channel',
      description:
        'Open a new payment channel with another Fiber node. ' +
        'Requires the peer pubkey and funding amount.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          peer_pubkey: {
            type: 'string',
            description: 'Secp256k1 compressed public key of the peer',
          },
          funding_amount: {
            type: 'string',
            description: 'Amount to fund the channel with (in shannons)',
          },
          asset: {
            type: 'string',
            enum: ['CKB', 'USDT', 'USDC', 'USDI'],
            description: 'Asset type for the channel',
            default: 'CKB',
          },
        },
        required: ['peer_pubkey', 'funding_amount'],
      },
    },
    {
      name: 'pay_btc_lightning',
      description:
        'Pay a Bitcoin Lightning Network invoice through Fiber �?Lightning cross-chain hub.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          btc_invoice: {
            type: 'string',
            description: 'BTC Lightning invoice string (lnbc...)',
          },
        },
        required: ['btc_invoice'],
      },
    },
    {
      name: 'create_hold_payment',
      description:
        'Create a Hold payment invoice. Funds are locked (escrowed) until you settle or cancel. ' +
        'Use this for trustless pay-on-delivery: lock payment, verify work, then settle.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          amount: {
            type: 'string',
            description: 'Amount in shannons (1 CKB = 100000000)',
          },
          description: {
            type: 'string',
            description: 'Description of what the payment is for',
            default: 'Hold payment',
          },
        },
        required: ['amount'],
      },
    },
    {
      name: 'settle_hold_payment',
      description:
        'Settle a held payment by revealing the preimage. ' +
        'This releases the locked funds to the provider. Only call after verifying work is complete.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          payment_hash: {
            type: 'string',
            description: 'The payment hash (0x-prefixed) of the hold invoice',
          },
          preimage: {
            type: 'string',
            description: 'The preimage (0x-prefixed) to reveal for settlement',
          },
        },
        required: ['payment_hash', 'preimage'],
      },
    },
    {
      name: 'cancel_hold_payment',
      description:
        'Cancel a held payment, refunding the locked funds back to the payer. ' +
        'Use this if the work was not completed or was unsatisfactory.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          payment_hash: {
            type: 'string',
            description: 'The payment hash (0x-prefixed) of the hold invoice to cancel',
          },
        },
        required: ['payment_hash'],
      },
    },
  ],
}));

// ══════════════════════════════════════════════════════════�?//  Tool Handlers
// ══════════════════════════════════════════════════════════�?
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'pay_and_call': {
        const result = await wallet.payAndCall(
          args!.provider_url as string,
          args!.service as string,
          args!.input as Record<string, unknown>,
          {
            maxBudget: (args!.max_budget as string) || '100000000',
            asset: (args!.asset as any) || 'CKB',
          },
        );

        const assetDef = getAssetDefinition(result.asset) || { decimals: 8, symbol: result.asset };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                output: result.output,
                payment: {
                  hash: result.payment_hash,
                  amount: formatAmount(result.amount, result.asset),
                  fee: formatAmount(result.fee, result.asset),
                  provider: result.provider,
                },
                execution_time_ms: result.execution_time_ms,
              }, null, 2),
            },
          ],
        };
      }

      case 'get_wallet_info': {
        const info = await wallet.nodeInfo();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                version: info.version,
                node_id: info.node_id,
                node_name: info.node_name || '',
                channels: info.channel_count || info.open_channel_count || 0,
                peers: info.peers_count || 0,
                addresses: info.addresses,
              }, null, 2),
            },
          ],
        };
      }

      case 'list_channels': {
        const { channels } = await wallet.listChannels();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                count: channels.length,
                channels: channels.map((ch) => ({
                  id: ch.channel_id,
                  peer: ch.pubkey,
                  local_balance: ch.local_balance,
                  remote_balance: ch.remote_balance,
                  asset: ch.funding_udt_type_script ? 'UDT' : 'CKB',
                  status: Object.keys(ch.state)[0],
                })),
              }, null, 2),
            },
          ],
        };
      }

      case 'open_channel': {
        const result = await wallet.openChannel(
          args!.peer_pubkey as string,
          args!.funding_amount as string,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                temporary_channel_id: result.temporary_channel_id,
                message: 'Channel opening initiated. It will be ready after on-chain confirmation.',
              }, null, 2),
            },
          ],
        };
      }

      case 'pay_btc_lightning': {
        const order = await wallet.payBtcLightning(args!.btc_invoice as string);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                payment_hash: order.payment_hash,
                amount_sats: order.amount_sats,
                fee_sats: order.fee_sats,
                status: order.status,
              }, null, 2),
            },
          ],
        };
      }

      case 'create_hold_payment': {
        const { randomBytes, createHash } = await import('node:crypto');
        const preimage = randomBytes(32);
        const hash = createHash('sha256').update(preimage).digest('hex');

        const { invoice_address } = await wallet.rpc.newInvoice({
          amount: args!.amount as string,
          currency: (process.env.FIBER_CURRENCY as any) || 'Fibt',
          payment_hash: `0x${hash}`,
          description: (args!.description as string) || 'Hold payment',
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                invoice_address,
                payment_hash: `0x${hash}`,
                preimage: `0x${preimage.toString('hex')}`,
                message: 'Hold invoice created. Share the invoice_address with the payer. ' +
                  'Keep the preimage secret until you want to settle.',
              }, null, 2),
            },
          ],
        };
      }

      case 'settle_hold_payment': {
        await wallet.rpc.settleInvoice({
          payment_hash: args!.payment_hash as string,
          payment_preimage: args!.preimage as string,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                payment_hash: args!.payment_hash,
                message: 'Payment settled. Funds released to provider.',
              }, null, 2),
            },
          ],
        };
      }

      case 'cancel_hold_payment': {
        await wallet.rpc.cancelInvoice({
          payment_hash: args!.payment_hash as string,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                payment_hash: args!.payment_hash,
                message: 'Hold payment cancelled. Funds refunded to payer.',
              }, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: true,
            message: error.message,
            tool: name,
          }),
        },
      ],
      isError: true,
    };
  }
});

// ══════════════════════════════════════════════════════════�?//  Start Server
// ══════════════════════════════════════════════════════════�?
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[AgentPay MCP] Server started');
}

main().catch((err) => {
  console.error('[AgentPay MCP] Fatal error:', err);
  process.exit(1);
});
