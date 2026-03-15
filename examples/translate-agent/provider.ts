/**
 * Example: Provider Agent �?Translation Service
 *
 * This Agent offers a translation service and receives CKB payments
 * via Fiber Network Hold Invoice.
 *
 * Prerequisites:
 * 1. Running Fiber node (fnn) at localhost:8227
 * 2. Node has funded channels
 *
 * Run: npx tsx provider.ts
 */

import { ServiceProvider } from '@agentpay-dev/sdk';

// ─── Create Provider ───────────────────────────────────────

const provider = new ServiceProvider({
  fiberRpcUrl: process.env.FIBER_RPC_URL || 'http://127.0.0.1:8227',
  currency: 'Fibt',  // testnet
  services: [
    {
      name: 'translate',
      description: 'Translate text between languages',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to translate' },
          source: { type: 'string', description: 'Source language code' },
          target: { type: 'string', description: 'Target language code' },
        },
        required: ['text', 'target'],
      },
      output_schema: {
        type: 'object',
        properties: {
          translated: { type: 'string' },
          source_detected: { type: 'string' },
        },
      },
      pricing: {
        model: 'per-call',
        amount: '100000000',   // 1 CKB per call
        asset: 'CKB',
      },
      sla: {
        max_latency_ms: 5000,
        uptime: 0.99,
      },
    },
  ],
});

// ─── Register Task Handler ────────────────────────────────

provider.onTask('translate', async (input: unknown) => {
  const { text, target } = input as { text: string; target: string };

  console.log(`[Translate] "${text}" �?${target}`);

  // In production: call actual translation API (DeepL, OpenAI, etc.)
  // For demo: simple mock translation
  const translations: Record<string, Record<string, string>> = {
    zh: { 'Hello World': '你好世界', 'Good morning': '早上�? },
    en: { '你好世界': 'Hello World', '早上�?: 'Good morning' },
    ja: { 'Hello World': 'こんにちは世�?, 'Good morning': 'おはようございま�? },
  };

  const translated = translations[target]?.[text] || `[${target}] ${text}`;

  return {
    translated,
    source_detected: 'auto',
  };
});

// ─── Start Server ──────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001');
provider.listen(PORT);

console.log(`
╔══════════════════════════════════════════════════╗
�? AgentPay Translation Provider                   �?�?                                                 �?�? Endpoints:                                      �?�?   POST /agentpay/request  �?SERVICE_OFFER       �?�?   POST /agentpay/execute  �?TASK_RESULT         �?�?                                                 �?�? Pricing: 1 CKB per translation                  �?�? Fiber:   ${process.env.FIBER_RPC_URL || 'http://127.0.0.1:8227'}        �?╚══════════════════════════════════════════════════╝
`);
