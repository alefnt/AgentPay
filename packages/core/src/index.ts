/**
 * @agentpay/core — Public API
 *
 * Core library for AgentPay protocol, providing:
 * - Fiber Network RPC client
 * - Agent identity utilities
 * - Asset registry (USDT, USDC, USDI, WBTC, etc.)
 * - RGB++ Bridge (BTC↔CKB asset bridging)
 * - Protocol type definitions
 */

// Fiber RPC Client
export { FiberRpcClient, FiberRpcError, FiberTimeoutError, FiberValidationError } from './fiber-rpc.js';
export type { FiberConfig } from './fiber-rpc.js';

// Logger
export { createLogger } from './logger.js';
export type { Logger, LoggerConfig, LogLevel } from './logger.js';

// Identity
export { getAgentIdFromNode, signPayload, verifySignature, agentDisplayName } from './identity.js';

// Assets
export {
  TESTNET_ASSETS,
  MAINNET_ASSETS,
  resolveAssetScript,
  getAssetDefinition,
  formatAmount,
  createCustomAsset,
} from './assets.js';
export type { AssetDefinition } from './assets.js';

// RGB++ Bridge
export { RgbppBridge, createRgbppBridge, RGBPP_SERVICE_URLS } from './rgbpp-bridge.js';
export type {
  RgbppBridgeConfig,
  RgbppNetwork,
  RgbppAssetBalance,
  RgbppTxState,
  LeapResult,
} from './rgbpp-bridge.js';

// Types — re-export everything
export type {
  // CKB / Fiber native types
  Script,
  OutPoint,
  Hash256,
  Pubkey,
  FiberCurrency,
  // Channel
  ChannelState,
  FiberChannel,
  FiberHtlc,
  // Invoice
  CkbInvoice,
  InvoiceData,
  InvoiceAttribute,
  CkbInvoiceStatus,
  // Payment
  PaymentStatus,
  PaymentResult,
  SessionRoute,
  SessionRouteNode,
  // Cross-chain hub
  CchOrderStatus,
  CchOrder,
  CchInvoice,
  // AgentPay protocol
  AgentId,
  AssetType,
  MessageType,
  ProtocolMessage,
  ServiceRequestPayload,
  ServiceOfferPayload,
  TaskInputPayload,
  TaskResultPayload,
  ErrorPayload,
  // Service spec
  ServiceSpec,
  ServicePricing,
  ServiceSLA,
  // Registration
  AgentRegistration,
} from './types.js';

