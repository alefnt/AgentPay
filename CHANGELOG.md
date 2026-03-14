# Changelog

All notable changes to this project will be documented in this file.

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
- Input validation, body size limits, CORS, health endpoint
- 17 unit tests

#### Services
- Hub Server: managed Fiber access, Agent registration, API key auth, rate limiting (13 tests)
- Registry Server: Agent service discovery, search by name/asset/price (17 tests)

#### Ecosystem
- MCP Server: 5 tools for Claude/GPT integration (12 tests)
- x402 Facilitator: x402 protocol compatibility with Fiber settlement (10 tests)
- create-agentpay CLI: one-command project generation (7 tests)
- Agent Skills (SKILL.md): skill definition for any Agent framework
- Docker deployment: Fiber + Agent in one docker-compose
- GitHub Actions CI/CD: test + build + Docker

#### Documentation
- Protocol specification (docs/protocol-spec.md)
- Product documentation (docs/product.md)
- Competitive analysis (docs/competitive-analysis.md)
- Strategic positioning (docs/strategic-positioning.md)
- Package READMEs (core, sdk, x402-facilitator)
