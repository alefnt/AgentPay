/**
 * AgentPay — Stablecoin Payment Demo
 *
 * This demo shows the core use case:
 * Agent A pays Agent B with USDI (stablecoin) via Fiber Network.
 *
 * This is the PRIMARY payment flow — all Agent-to-Agent payments
 * happen in stablecoins on Fiber. BTC/ETH are just on-ramp/off-ramp.
 *
 * Usage:
 *   npx ts-node --esm examples/stablecoin-payment.ts
 *
 * Prerequisites:
 *   docker compose up fiber-node-1 -d
 */

import { AgentWallet, ServiceProvider } from '@agentpay/sdk';

// ─── Provider Agent (sells translation service) ─────────

const provider = new ServiceProvider({
  fiberRpcUrl: 'http://127.0.0.1:8227',
  services: [{
    name: 'translate',
    description: 'AI-powered translation service',
    pricing: {
      model: 'per-call',
      amount: '10000',     // $0.01 USDI (6 decimals → 10000 = 0.01)
      asset: 'USDI',       // ← Stablecoin! Not CKB, not BTC
    },
    input_schema: { text: 'string', target: 'string' },
    output_schema: { translated: 'string' },
  }],
});

provider.onTask('translate', async (input) => {
  const { text, target } = input as { text: string; target: string };
  // In production this would call an LLM API
  return { translated: `[${target}] ${text}` };
});

provider.listen(3001);
console.log('✅ Provider Agent listening on :3001 (USDI pricing)');

// ─── Caller Agent (pays for translation) ─────────────────

const wallet = new AgentWallet({
  fiberRpcUrl: 'http://127.0.0.1:8227',
  defaultAsset: 'USDI',    // ← All payments default to stablecoin
  bitAccount: 'caller.bit', // ← .bit DID identity
});

async function main() {
  console.log('\n📤 Calling translate service with USDI payment...\n');

  const result = await wallet.payAndCall(
    'http://127.0.0.1:3001',
    'translate',
    { text: 'Hello World', target: 'zh' },
    { maxBudget: '100000', asset: 'USDI' },  // max $0.10 USDI
  );

  console.log('✅ Payment Result:');
  console.log(`   Output:  ${JSON.stringify(result.output)}`);
  console.log(`   Paid:    ${result.amount} (${result.asset})`);
  console.log(`   Hash:    ${result.payment_hash}`);
  console.log(`   Time:    ${result.execution_time_ms}ms`);
  console.log('\n💡 Key insight: No gas fees, no volatility, millisecond settlement.');
  console.log('   This is what Agent-to-Agent payments should feel like.');
}

main().catch(console.error);
