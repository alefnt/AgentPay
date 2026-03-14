# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-03-14

### Added
- **Hold Payment Scheme** (`hold` | `exact` | `upto`) — AgentPay's core differentiator
  - `createHoldRequirements()` — lock funds via Fiber PTLC
  - `settleHold(hash, preimage)` — provider reveals preimage to collect
  - `cancelHold(hash)` — refund locked funds to client
  - HTTP endpoints: `/x402/create-hold`, `/x402/settle-hold`, `/x402/cancel-hold`
  - `verify()` now supports both `exact` and `hold` schemes
- **AI Agent Skills** (`.agent/skills/`)
  - `agentpay-payment/SKILL.md` — how to pay another Agent
  - `agentpay-provider/SKILL.md` — how to create a paid service
- **One-click Fiber node setup** (`pnpm setup` / `scripts/setup-node.ts`)
- **Fiber node guide** (`docs/fiber-node-guide.md`)
- **Deploy workflow** (`.agent/workflows/deploy-local.md`)
- **E2E tests** — hold scheme lifecycle + LND sync monitor

### Changed
- **Architecture**: Fiber-first with fallbacks (was: pluggable settlement)
- **PTLC correction**: Fiber uses PTLC per official spec (was HTLC)
- **architecture.md**: 6 access methods, payment schemes, updated status
- **README**: Architecture diagram with 6 access paths + PTLC label

### Fixed
- LND config: removed invalid `neutrino.feeurl`, added multiple signet peers

## [0.1.0] - 2026-03-14

### Added

#### Core (@agentpay/core)
- Full Fiber Network RPC client (Channel, Invoice, Payment, Cch, Peer, Info, Graph)
- Production hardening: 30s timeout, retry with exponential backoff, input validation
- 3 error types: FiberRpcError, FiberTimeoutError, FiberValidationError
- Asset registry: CKB, BTC, USDI, USDT, USDC, WBTC, custom UDT
- Agent identity module (pubkey-based, payload signing/verification)
- Zero-dependency structured logger (pino-compatible JSON)
- 53 unit tests

#### SDK (@agentpay/sdk)
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
