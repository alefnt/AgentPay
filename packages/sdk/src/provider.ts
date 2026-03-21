/**
 * AgentPay SDK — ServiceProvider (backwards-compatible alias)
 *
 * This file re-exports ProviderFacade as ServiceProvider
 * for backwards compatibility with existing code.
 *
 * The original monolithic ServiceProvider has been refactored into:
 *   - ProviderServer (HTTP layer)
 *   - ProtocolHandler (protocol logic)
 *   - ProviderFacade (composer)
 *
 * New code should use ProviderFacade directly.
 *
 * @deprecated Use ProviderFacade instead
 */

import { ProviderFacade, type ProviderFacadeConfig } from './provider-handler.js';
import type { TaskHandler } from './provider-protocol.js';

// Re-export ProviderFacade as ServiceProvider for backwards compat
export { ProviderFacade as ServiceProvider };

// Re-export config type with legacy name
export type ProviderConfig = ProviderFacadeConfig;

// Re-export TaskHandler
export type { TaskHandler };
