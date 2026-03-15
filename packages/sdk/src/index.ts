/**
 * @agentpay-dev/sdk �?Public API
 *
 * Two main classes:
 * - AgentWallet: For Caller Agents (pay and call services)
 * - ServiceProvider: For Provider Agents (receive payments and execute tasks)
 *
 * ```ts
 * // Caller
 * import { AgentWallet } from '@agentpay-dev/sdk';
 * const wallet = new AgentWallet();
 * const result = await wallet.payAndCall('http://provider:3000', 'translate', { text: 'Hi' });
 *
 * // Provider
 * import { ServiceProvider } from '@agentpay-dev/sdk';
 * const provider = new ServiceProvider({ services: [...] });
 * provider.onTask('translate', async (input) => ({ translated: '你好' }));
 * provider.listen(3000);
 * ```
 */

export { AgentWallet } from './wallet.js';
export type { WalletConfig, PayAndCallResult } from './wallet.js';

export { ServiceProvider } from './provider.js';
export type { ProviderConfig, TaskHandler } from './provider.js';

export { HubClient, createHubWallet } from './hub.js';
export type { HubConfig } from './hub.js';

// Re-export commonly needed types from core
export type {
  Pubkey,
  Hash256,
  AssetType,
  ServiceSpec,
  ServicePricing,
  ServiceSLA,
  FiberChannel,
  PaymentResult,
  ProtocolMessage,
} from '@agentpay-dev/core';
