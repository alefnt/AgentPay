/**
 * Example: BTC Lightning → CKB Fiber Cross-Chain Payment
 *
 * Shows how a BTC-native Agent can pay a CKB Agent via Fiber's Cch module.
 *
 * Flow:
 *   1. CKB Agent creates a Fiber invoice
 *   2. Cch Hub wraps it as a BTC Lightning invoice
 *   3. BTC Agent pays the Lightning invoice
 *   4. Cch Hub atomically swaps BTC→CKB
 *   5. CKB Agent receives CKB
 *
 * Run: npx tsx btc-to-ckb.ts
 */

import { AgentWallet } from '@agentpay/sdk';
import { FiberRpcClient } from '@agentpay/core';

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  BTC Lightning → CKB Fiber Cross-Chain Demo      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();

  // ─── CKB Agent (Receiver) ─────────────────────────────

  const ckbAgent = new AgentWallet({
    fiberRpcUrl: process.env.CKB_FIBER_RPC || 'http://127.0.0.1:8227',
    currency: 'Fibt',
  });

  // Step 1: CKB Agent creates a Fiber invoice
  console.log('1. CKB Agent creates Fiber invoice...');
  const { invoice_address, invoice } = await ckbAgent.rpc.newInvoice({
    amount: '100000000',  // 1 CKB
    currency: 'Fibt',
    description: 'Payment for translation service',
    expiry: 3600,  // 1 hour
  });
  console.log(`   Invoice: ${invoice_address}`);
  console.log(`   Amount: ${invoice.amount} (1 CKB)`);
  console.log();

  // Step 2: Cch Hub converts Fiber invoice → BTC Lightning invoice
  console.log('2. Cch Hub wraps as BTC Lightning invoice...');
  const cchOrder = await ckbAgent.rpc.receiveBtc({
    fiber_pay_req: invoice_address,
  });
  console.log(`   BTC Lightning Invoice: ${cchOrder.incoming_invoice.invoice}`);
  console.log(`   BTC Amount: ${cchOrder.amount_sats} sats`);
  console.log(`   Fee: ${cchOrder.fee_sats} sats`);
  console.log(`   Status: ${cchOrder.status}`);
  console.log();

  // Step 3: BTC Agent pays the Lightning invoice
  // (In practice, this would be done by the BTC Agent's Lightning wallet)
  console.log('3. BTC Agent pays Lightning invoice...');
  console.log('   [BTC Agent would use their Lightning wallet here]');
  console.log('   lncli payinvoice', cchOrder.incoming_invoice.invoice);
  console.log();

  // Step 4: Monitor the cross-chain order
  console.log('4. Monitoring cross-chain swap...');
  const orderStatus = await ckbAgent.rpc.getCchOrder({
    payment_hash: cchOrder.payment_hash,
  });
  console.log(`   Order Status: ${orderStatus.status}`);
  console.log(`   Payment Hash: ${orderStatus.payment_hash}`);
  console.log();

  // Step 5: CKB Agent receives CKB
  console.log('5. Cross-chain swap complete!');
  console.log('   CKB Agent has received CKB via Fiber.');
  console.log();

  // ─── Reverse: CKB Agent → BTC Lightning ──────────────

  console.log('═══ Reverse Direction: CKB → BTC ═══');
  console.log();

  // A CKB Agent can also pay BTC Lightning invoices
  console.log('CKB Agent pays a BTC Lightning invoice...');
  const btcInvoice = 'lnbc100n1p0example...'; // Example BTC Lightning invoice
  try {
    const sendOrder = await ckbAgent.payBtcLightning(btcInvoice);
    console.log(`   Status: ${sendOrder.status}`);
    console.log(`   Amount: ${sendOrder.amount_sats} sats`);
  } catch (err) {
    console.log(`   (Skipped — needs real BTC Lightning invoice)`);
  }
}

main().catch(console.error);
