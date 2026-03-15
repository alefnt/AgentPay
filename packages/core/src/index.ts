/**
 * @agentpay-dev/core â€?Public API
 *
 * Core library for AgentPay protocol, providing:
 * - Fiber Network RPC client
 * - Agent identity utilities
 * - Asset registry (USDT, USDC, USDI, WBTC, etc.)
 * - RGB++ Bridge (BTCâ†”CKB asset bridging)
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

// .bit Identity (CKB DID)
export { BitIdentity } from './bit-identity.js';
export type {
  BitAccount,
  BitRecord,
  BitIdentityConfig,
} from './bit-identity.js';

// Settlement Layer (pluggable: Fiber / CKB L1 / Hub)
export {
  FiberSettlement,
  CkbL1Settlement,
  HubSettlement,
  autoSelectSettlement,
} from './settlement.js';
export type {
  SettlementLayer,
  SettlementLayerType,
  SettlementCapabilities,
  HoldInvoiceResult,
  SettlementResult,
  AutoSettlementConfig,
} from './settlement.js';

// Types â€?re-export everything
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

// DePIN â€?Decentralized Physical Infrastructure payments
export type {
  DeviceType,
  ResourceUnit,
  SessionStatus,
  ResourceSpec,
  DeviceIdentity,
  DeviceLocation,
  ResourceUsage,
  StreamingSession,
  CreateSessionOptions,
  SettlementResult as DepinSettlementResult,
} from './depin-types.js';

export {
  calculateCost,
  exceedsBudget,
  remainingBudget,
  maxAffordableUnits,
  createUsageProof,
  verifyUsageProof,
  formatResourceAmount,
  formatCost,
} from './depin-metering.js';

export {
  createSession,
  activateSession,
  tick,
  settleSession as settleStreamingSession,
  markSettled,
  cancelSession,
  getSessionCost,
  getSessionBudgetRemaining,
  isSessionExpired,
  getSessionDuration,
} from './depin-streaming.js';

