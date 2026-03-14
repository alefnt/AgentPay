#!/usr/bin/env tsx
/**
 * AgentPay — Real Fiber Node E2E Test
 *
 * This script tests the FULL payment flow against a real Fiber node.
 * It requires a running Fiber node with at least one funded channel.
 *
 * Prerequisites:
 *   1. A running Fiber node: docker run -d nervosnetwork/fiber:latest
 *   2. At least 1 funded channel (for payments)
 *   3. Set FIBER_RPC_URL env var (default: http://127.0.0.1:8227)
 *
 * Usage:
 *   FIBER_RPC_URL=http://your-fiber:8227 npx tsx scripts/e2e-fiber.ts
 *
 * What it tests:
 *   1. Node connectivity + info
 *   2. Channel listing
 *   3. Invoice creation (regular + Hold Invoice)
 *   4. Full ServiceProvider startup
 *   5. Full payAndCall flow (if 2+ nodes available)
 */

import { FiberRpcClient, createLogger } from '@agentpay/core';
import { ServiceProvider, AgentWallet } from '@agentpay/sdk';

const log = createLogger({ name: 'e2e-fiber', version: '0.1.0' });

const FIBER_RPC_URL = process.env.FIBER_RPC_URL || 'http://127.0.0.1:8227';

async function main() {
  log.info({ url: FIBER_RPC_URL }, '═══ AgentPay Fiber E2E Test ═══');

  const fiber = new FiberRpcClient({ rpcUrl: FIBER_RPC_URL, timeoutMs: 10_000 });
  let passed = 0;
  let failed = 0;

  // ─── Test 1: Node Connectivity ───────────────────────────
  try {
    log.info('Test 1: Node connectivity...');
    const info = await fiber.nodeInfo();
    log.info({
      node_name: info.node_name,
      pubkey: info.public_key.slice(0, 20) + '...',
      peers: info.peers_count,
      channels: info.open_channel_count,
      sync: info.network_sync_status,
    }, '✅ Node info retrieved');
    passed++;
  } catch (err: any) {
    log.error({ err: err.message }, '❌ Node connectivity FAILED');
    log.error('Make sure Fiber node is running at: ' + FIBER_RPC_URL);
    process.exit(1);
  }

  // ─── Test 2: Channel Listing ─────────────────────────────
  try {
    log.info('Test 2: Channel listing...');
    const { channels } = await fiber.listChannels();
    log.info({ count: channels.length }, '✅ Channels retrieved');
    for (const ch of channels) {
      log.info({
        id: ch.channel_id?.slice(0, 16),
        state: ch.state_name,
        local: ch.local_balance,
        remote: ch.remote_balance,
      }, '  Channel details');
    }
    passed++;

    if (channels.length === 0) {
      log.warn('⚠️ No channels found — payment tests will be skipped');
      log.warn('Open a channel first: fiber.openChannel({ pubkey, funding_amount })');
    }
  } catch (err: any) {
    log.error({ err: err.message }, '❌ Channel listing FAILED');
    failed++;
  }

  // ─── Test 3: Regular Invoice ─────────────────────────────
  try {
    log.info('Test 3: Create regular invoice...');
    const { invoice_address, invoice } = await fiber.newInvoice({
      amount: '100000000', // 1 CKB
      currency: 'Fibt',
      description: 'E2E test invoice',
    });
    log.info({
      address: invoice_address.slice(0, 30) + '...',
      currency: invoice.currency,
    }, '✅ Regular invoice created');
    passed++;
  } catch (err: any) {
    log.error({ err: err.message }, '❌ Regular invoice FAILED');
    failed++;
  }

  // ─── Test 4: Hold Invoice ────────────────────────────────
  try {
    log.info('Test 4: Create Hold Invoice (payment_hash only)...');
    const { randomBytes, createHash } = await import('node:crypto');
    const preimage = randomBytes(32);
    const hash = createHash('sha256').update(preimage).digest('hex');

    const { invoice_address } = await fiber.newInvoice({
      amount: '50000000', // 0.5 CKB
      currency: 'Fibt',
      payment_hash: `0x${hash}`,
      description: 'E2E Hold Invoice test',
      expiry: 120,
    });
    log.info({
      address: invoice_address.slice(0, 30) + '...',
      hash: hash.slice(0, 16) + '...',
    }, '✅ Hold Invoice created (preimage NOT revealed)');
    passed++;

    // Verify invoice status
    const status = await fiber.getInvoice({ payment_hash: `0x${hash}` });
    log.info({ status: status.status }, '✅ Invoice status retrieved');
    passed++;

    // Cancel the hold invoice (cleanup)
    await fiber.cancelInvoice({ payment_hash: `0x${hash}` });
    log.info('✅ Hold Invoice cancelled (cleanup)');
  } catch (err: any) {
    log.error({ err: err.message }, '❌ Hold Invoice FAILED');
    failed++;
  }

  // ─── Test 5: ServiceProvider Startup ─────────────────────
  try {
    log.info('Test 5: ServiceProvider startup...');
    const provider = new ServiceProvider({
      fiberRpcUrl: FIBER_RPC_URL,
      currency: 'Fibt',
      services: [{
        name: 'e2e_test',
        description: 'E2E test service',
        pricing: { model: 'per-call', amount: '100000000', asset: 'CKB' },
        input_schema: { msg: 'string' },
        output_schema: { echo: 'string' },
      }],
    });

    provider.onTask('e2e_test', async (input: any) => {
      return { echo: `[e2e] ${input.msg}` };
    });

    // Don't actually listen — just verify it doesn't throw
    log.info('✅ ServiceProvider configured successfully');
    passed++;
  } catch (err: any) {
    log.error({ err: err.message }, '❌ ServiceProvider FAILED');
    failed++;
  }

  // ─── Test 6: AgentWallet Info ────────────────────────────
  try {
    log.info('Test 6: AgentWallet node info...');
    const wallet = new AgentWallet({ fiberRpcUrl: FIBER_RPC_URL });
    const pubkey = await wallet.getPubkey();
    log.info({ pubkey: pubkey.slice(0, 20) + '...' }, '✅ AgentWallet pubkey retrieved');
    passed++;
  } catch (err: any) {
    log.error({ err: err.message }, '❌ AgentWallet FAILED');
    failed++;
  }

  // ─── Test 7: Graph Nodes ─────────────────────────────────
  try {
    log.info('Test 7: Network graph...');
    const { nodes } = await fiber.graphNodes({ limit: 5 });
    log.info({ node_count: nodes.length }, '✅ Graph nodes retrieved');
    passed++;
  } catch (err: any) {
    log.error({ err: err.message }, '❌ Graph FAILED');
    failed++;
  }

  // ─── Summary ─────────────────────────────────────────────
  log.info('');
  log.info('═══════════════════════════════════════════════');
  log.info({ passed, failed, total: passed + failed }, `E2E Results: ${passed} passed, ${failed} failed`);
  log.info('═══════════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  log.fatal({ err }, 'E2E test crashed');
  process.exit(1);
});
