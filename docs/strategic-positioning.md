# AgentPay — Strategic Positioning

## One-line pitch
**The payment protocol that turns AI Agents into economic participants — BTC-native, trustless, zero-fee.**

## vs x402 (Coinbase)

| | x402 | AgentPay |
|---|---|---|
| Security | Trust the Facilitator | Hold Invoice (cryptographic) |
| Cost per tx | ~$0.0001 (Base gas) | $0 (channel-internal) |
| Speed | ~2s (Base block) | ~20ms (P2P) |
| BTC support | ❌ | ✅ Cch (Lightning ↔ Fiber) |
| Multi-asset | USDC only | CKB + BTC + any xUDT |
| Agent SDK | ❌ | ✅ SDK + MCP + Skills |
| Service discovery | ❌ | ✅ Registry |

**x402 is HTTP middleware for payments. AgentPay is a full Agent economic stack.**

## vs Skyfire / L402

| | Skyfire | L402 | AgentPay |
|---|---|---|---|
| Trustless | ❌ (custody) | ❌ (pre-pay) | ✅ Hold Invoice |
| BTC native | ❌ | Partial | ✅ Cch + RGB++ |
| MCP/Skills | ❌ | ❌ | ✅ |
| Open source | ❌ | ✅ | ✅ MIT |

## For Coinbase
AgentPay improves x402 by adding:
- **Hold Invoice** → trustless (no Facilitator trust needed)
- **BTC support** → x402 + Bitcoin ecosystem
- **Zero-fee micropayments** → better for Agent-to-Agent high frequency

We can be x402's BTC backend. x402 for ETH, AgentPay for BTC.

## For BTC Community
AgentPay is the **BTC-native Agent payment protocol**:
- Uses Fiber Network (CKB L2, BTC interop via Cch)
- BTC flows in via Lightning, stays economic via Fiber channels
- RGB++ bridges BTC-issued assets to Fiber for payments
- No ETH, no EVM, no custodians — pure BTC stack

## Risks

1. **Fiber mainnet** — No public timeline. All our work runs on testnet.
2. **Cch adoption** — Needs Cch node operators with cross-chain liquidity
3. **Wrapped BTC xUDT** — Needs deployment on CKB for Cch to work with real value
4. **Competition** — x402 has Coinbase brand. We have better tech but less distribution.
