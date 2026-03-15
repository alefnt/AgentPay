# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-03-15

### Added
- **Fiber v0.7.1 Full Compatibility**
  - `autoHexParams()` â€?transparently converts decimal strings/numbers to hex for all RPC calls
  - `nodeInfo()` return type updated (`node_id`, `channel_count`, `version`, optional fields)
  - `getPubkey()` uses `node_id || public_key` across wallet, provider, MCP, hub
- **MCP Server Hold Scheme Tools** (8 tools total, was 5)
  - `create_hold_payment` â€?create escrow invoice with auto-generated preimage
  - `settle_hold_payment` â€?release funds by revealing preimage
  - `cancel_hold_payment` â€?refund locked funds to payer
- **UDT Stablecoin Support** (RUSD verified on live node)
  - E2E Test 10: UDT stablecoin invoice creation
  - Fiber node UDT whitelist config detection
- **Registry Service Discovery Enhancements**
  - `POST /agents/:pubkey/heartbeat` â€?agent liveness tracking
  - `GET /services/discover` â€?find healthy agents (filters stale heartbeats)
  - `updateHeartbeat()` method in RegistryDatabase
- **E2E Test Suite Expanded** (11 tests, was 9)
  - Test 10: UDT Stablecoin (RUSD) invoice
  - Test 11: Registry service discovery lifecycle
- **4 autoHexParams Unit Tests** â€?decimalâ†’hex, hex passthrough, numberâ†’hex, non-numeric

### Fixed
- `get_wallet_info` MCP tool uses v0.7.1 fields
- CLI caller template uses `channel_count` instead of `open_channel_count`
- Hub `server.ts` uses `node_id || public_key` for agent pubkey
- Mock `node_info` in tests includes v0.7.1 fields

### Changed
- SDK README: hold scheme example, 6 access methods table, improved protocol flow diagram

## [0.2.0] - 2026-03-14

### Added
- **Hold Payment Scheme** (`hold` | `exact` | `upto`) â€?AgentPay's core differentiator
  - `createHoldRequirements()` â€?lock funds via Fiber PTLC
  - `settleHold(hash, preimage)` â€?provider reveals preimage to collect
  - `cancelHold(hash)` â€?refund locked funds to client
  - HTTP endpoints: `/x402/create-hold`, `/x402/settle-hold`, `/x402/cancel-hold`
  - `verify()` now supports both `exact` and `hold` schemes
- **AI Agent Skills** (`.agent/skills/`)
  - `agentpay-payment/SKILL.md` â€?how to pay another Agent
  - `agentpay-provider/SKILL.md` â€?how to create a paid service
- **One-click Fiber node setup** (`pnpm setup` / `scripts/setup-node.ts`)
- **Fiber node guide** (`docs/fiber-node-guide.md`)
- **Deploy workflow** (`.agent/workflows/deploy-local.md`)
- **E2E tests** â€?hold scheme lifecycle + LND sync monitor

### Changed
- **Architecture**: Fiber-first with fallbacks (was: pluggable settlement)
- **PTLC correction**: Fiber uses PTLC per official spec (was HTLC)
- **architecture.md**: 6 access methods, payment schemes, updated status
- **README**: Architecture diagram with 6 access paths + PTLC label

### Fixed
- LND config: removed invalid `neutrino.feeurl`, added multiple signet peers

## [0.1.0] - 2026-03-14

### Added

#### Core (@agentpay-dev/core)
- Full Fiber Network RPC client (Channel, Invoice, Payment, Cch, Peer, Info, Graph)
- Production hardening: 30s timeout, retry with exponential backoff, input validation
- 3 error types: FiberRpcError, FiberTimeoutError, FiberValidationError
- Asset registry: CKB, BTC, USDI, USDT, USDC, WBTC, custom UDT
- Agent identity module (pubkey-based, payload signing/verification)
- Zero-dependency structured logger (pino-compatible JSON)
- 53 unit tests

#### SDK (@agentpay-dev/sdk)
- AgentWallet: 3-line integration for paying services
- ServiceProvider: HTTP server for receiving paid requests
- HubClient: managed Fiber access (no node required)
- Hold Invoice trustless payment flow
- 17 unit tests

#### Services
- Hub Server: managed Fiber access, Agent registration, API key auth (13 tests)
- Registry Server: Agent service discovery, search by name/asset/price (17 tests)

#### Ecosystem
- MCP Server: 5 tools for Claude/GPT integration (12 tests)
- x402 Facilitator: x402 protocol compatibility with Fiber settlement (10 tests)
- create-agentpay CLI: one-command project generation (7 tests)
- Agent Skills (SKILL.md): skill definition for any Agent framework
- Docker deployment: Fiber + Agent in one docker-compose
- GitHub Actions CI/CD: test + build + Docker

#### Documentation
- Protocol specification, product docs, competitive analysis, strategic positioning
