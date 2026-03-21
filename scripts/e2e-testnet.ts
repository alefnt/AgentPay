#!/usr/bin/env tsx
/**
 * AgentPay E2E — Live Fiber Testnet Test
 *
 * Tests our FiberRpcClient + invoice creation against a real Fiber testnet node.
 */

import { createHash, randomBytes } from 'node:crypto';
import { FiberRpcClient } from '../packages/core/src/fiber-rpc.js';

const FIBER_RPC = process.env.FIBER_RPC_URL || 'http://18.163.221.211:8227';

async function main() {
  const fiber = new FiberRpcClient({ rpcUrl: FIBER_RPC, timeoutMs: 10000 });

  console.log('=== Test 1: Node Info ===');
  const info = await fiber.nodeInfo();
  console.log('  Version:', info.version);
  console.log('  Node ID:', (info.node_id || '').slice(0, 30) + '...');
  console.log('  Peers:', info.peers_count);
  console.log('  PASS');

  console.log('\n=== Test 2: List Channels ===');
  const ch = await fiber.listChannels({});
  const total = ch.channels?.length || 0;
  const ready = ch.channels?.filter((c: any) => c.state?.state_name === 'CHANNEL_READY').length || 0;
  console.log('  Total channels:', total);
  console.log('  Ready channels:', ready);
  console.log('  PASS');

  console.log('\n=== Test 3: Create Invoice (REAL testnet!) ===');
  const preimage = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
  console.log('  Payment hash:', hash.slice(0, 20) + '...');

  const inv = await fiber.newInvoice({
    amount: '100000000',  // 1 CKB
    currency: 'Fibt',
    payment_hash: `0x${hash}`,
    description: 'AgentPay E2E Test',
    expiry: 60,
  });
  console.log('  Invoice created!');
  console.log('  Invoice addr:', (inv.invoice_address || '').slice(0, 50) + '...');
  console.log('  PASS');

  console.log('\n=== Test 4: Get Invoice Status ===');
  const status = await fiber.getInvoice({ payment_hash: `0x${hash}` });
  console.log('  Status:', status.status);
  if (status.status !== 'Open') {
    throw new Error(`Expected 'Open', got '${status.status}'`);
  }
  console.log('  PASS');

  console.log('\n=== Test 5: Cancel Invoice ===');
  await fiber.cancelInvoice({ payment_hash: `0x${hash}` });
  console.log('  Invoice cancelled');
  console.log('  PASS');

  console.log('\n========================================');
  console.log('  ALL 5 TESTS PASSED on Fiber testnet!');
  console.log('  Node:', FIBER_RPC);
  console.log('========================================');
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
