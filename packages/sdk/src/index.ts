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


export { SecureChannel } from './secure-channel.js';
export type { SecureResultPayload } from './secure-channel.js';

// Refactored Provider layers
export { ProviderServer } from './provider-server.js';
export type { ServerConfig, RouteHandler } from './provider-server.js';
export { ProtocolHandler } from './provider-protocol.js';
export { ProviderFacade } from './provider-handler.js';
export type { ProviderFacadeConfig } from './provider-handler.js';

// x402 / MPP Universal Gateway
export { X402Gateway } from './x402-gateway.js';
export type { X402PaymentRequirements, X402PaymentPayload, X402GatewayConfig } from './x402-gateway.js';

// Streaming Micropayments (DePIN / high-frequency)
export { StreamingProvider } from './streaming-provider.js';
export type { StreamingConfig } from './streaming-provider.js';

// Deposit Gateway (fee compression for EVM agents)
export { DepositGateway } from './x402-deposit.js';
export type { DepositAccount, DepositTransaction } from './x402-deposit.js';

// Nevermined Payment Backend
export { NeverminedBackend } from './nevermined-backend.js';
export type { NeverminedPayment, NeverminedBackendConfig } from './nevermined-backend.js';
