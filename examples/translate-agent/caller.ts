/**
 * Example: Caller Agent — Uses Translation Service
 *
 * This Agent calls the Translation Provider and pays with CKB
 * via Fiber Network.
 *
 * Prerequisites:
 * 1. Running Fiber node (fnn) at localhost:8228 (different port from provider)
 * 2. Node has funded channels
 * 3. Provider Agent is running at localhost:3001
 *
 * Run: npx tsx caller.ts
 */

import { AgentWallet } from '@agentpay/sdk';

async function main() {
  // ─── Create Wallet ─────────────────────────────────────

  const wallet = new AgentWallet({
    fiberRpcUrl: process.env.FIBER_RPC_URL || 'http://127.0.0.1:8228',
    currency: 'Fibt',
  });

  const providerUrl = process.env.PROVIDER_URL || 'http://127.0.0.1:3001';

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  AgentPay Caller Agent                           ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();

  // ─── Get Node Info ─────────────────────────────────────

  try {
    const info = await wallet.nodeInfo();
    console.log(`Agent Pubkey: ${info.public_key}`);
    console.log(`Open Channels: ${info.open_channel_count}`);
    console.log(`Peers: ${info.peers_count}`);
    console.log();
  } catch (err) {
    console.log('⚠ Could not connect to Fiber node. Make sure fnn is running.');
    console.log(`  Tried: ${process.env.FIBER_RPC_URL || 'http://127.0.0.1:8228'}`);
    console.log();
  }

  // ─── Pay and Call Translation ──────────────────────────

  console.log('─── Calling Translation Service ───');
  console.log(`Provider: ${providerUrl}`);
  console.log('Input: { text: "Hello World", target: "zh" }');
  console.log('Budget: 1000000000 shannons (10 CKB)');
  console.log();

  try {
    const result = await wallet.payAndCall<{ translated: string }>(
      providerUrl,
      'translate',
      { text: 'Hello World', target: 'zh' },
      { maxBudget: '1000000000' },
    );

    console.log('✅ Success!');
    console.log(`Output:         ${JSON.stringify(result.output)}`);
    console.log(`Payment Hash:   ${result.payment_hash}`);
    console.log(`Amount Paid:    ${result.amount} shannons`);
    console.log(`Fee:            ${result.fee} shannons`);
    console.log(`Provider:       ${result.provider}`);
    console.log(`Execution Time: ${result.execution_time_ms}ms`);
  } catch (err) {
    console.log(`❌ Failed: ${(err as Error).message}`);
    console.log();
    console.log('Make sure:');
    console.log('  1. Both Fiber nodes are running');
    console.log('  2. Channels are open between the two nodes');
    console.log('  3. Provider Agent is running at the specified URL');
  }
}

main().catch(console.error);
