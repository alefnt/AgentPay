# AgentPay Protocol Specification v1.0

## 1. Overview

AgentPay is an open protocol for trustless machine-to-machine micropayments. It enables AI Agents to pay each other for services using the CKB Fiber Network, with optional BTC Lightning interoperability.

### Design Goals

1. **Trustless**: Neither party needs to trust the other
2. **Instant**: Payments settle in milliseconds (off-chain)
3. **Cheap**: Sub-cent fees (Fiber Network, not L1)
4. **Multi-Asset**: CKB, BTC, USDT, USDC, any UDT
5. **Standard**: HTTP transport, JSON format, x402 compatible

---

## 2. Protocol Actors

| Actor | Role | Identity |
|---|---|---|
| **Caller** | Pays for and consumes a service | Fiber node pubkey |
| **Provider** | Executes work and receives payment | Fiber node pubkey |
| **Fiber Node** | Manages payment channels (each actor runs one) | secp256k1 keypair |

---

## 3. Message Format

All messages use a standard envelope:

```json
{
  "protocol": "agentpay/1.0",
  "id": "uuid-v4",
  "timestamp": 1710000000,
  "from": "0x02...(pubkey)",
  "to": "0x03...(pubkey)",
  "signature": "hex",
  "type": "SERVICE_REQUEST | SERVICE_OFFER | TASK_INPUT | TASK_RESULT | ERROR",
  "payload": { ... }
}
```

---

## 4. Protocol Flow

```
Caller                                 Provider
  │                                       │
  │  ① SERVICE_REQUEST                    │
  │  POST /agentpay/request               │
  │  ─────────────────────────────→       │
  │  { service, budget, requirements }    │
  │                                       │
  │  ② SERVICE_OFFER                      │
  │  ←─────────────────────────────       │
  │  { price, hold_invoice, ttl }         │
  │                                       │
  │  ③ Fiber: send_payment(invoice)       │
  │  ═══════════════════════════→         │
  │  (funds locked in Fiber TLC)          │
  │                                       │
  │  ④ TASK_INPUT                         │
  │  POST /agentpay/execute               │
  │  ─────────────────────────────→       │
  │  { payment_hash, input }              │
  │                                       │
  │      [Provider executes task]         │
  │      [Provider: settle_invoice]       │
  │                                       │
  │  ⑤ TASK_RESULT                        │
  │  ←─────────────────────────────       │
  │  { output, preimage, proof_hash }     │
  │                                       │
  │  Caller verifies:                     │
  │  sha256(preimage) == payment_hash ✓   │
  │  Transaction complete                 │
```

### Step Details

#### ① SERVICE_REQUEST

Caller discovers a Provider (via registry or direct URL) and requests a service.

```json
{
  "type": "SERVICE_REQUEST",
  "payload": {
    "service": "translate",
    "input_preview": { "keys": ["text", "target"] },
    "budget": {
      "max_amount": "1000000000",
      "asset": "CKB"
    }
  }
}
```

#### ② SERVICE_OFFER

Provider creates a **Hold Invoice** on Fiber (hash only, no preimage) and returns the offer.

Provider-side operations:
1. `preimage = random(32 bytes)`
2. `payment_hash = sha256(preimage)`
3. `fiber.new_invoice({ amount, payment_hash })` — creates hold invoice
4. Store `preimage` mapped to `payment_hash`

```json
{
  "type": "SERVICE_OFFER",
  "payload": {
    "request_id": "original-request-id",
    "price": "100000000",
    "asset": "CKB",
    "hold_invoice": "fibt1q...",
    "estimated_time_ms": 5000,
    "offer_ttl_seconds": 60
  }
}
```

#### ③ Payment Lock

Caller pays the hold invoice via Fiber:
```
fiber.send_payment({ invoice: "fibt1q..." })
```
Funds are now **locked in a TLC** (Time-Locked Contract) — Provider cannot claim them yet.

#### ④ TASK_INPUT

Caller sends the actual task input with payment proof.

```json
{
  "type": "TASK_INPUT",
  "payload": {
    "offer_id": "offer-msg-id",
    "payment_hash": "0x...",
    "input": { "text": "Hello World", "target": "zh" }
  }
}
```

#### ⑤ TASK_RESULT

Provider executes the task, settles the invoice, and returns the result.

Provider-side operations:
1. Verify: `fiber.get_invoice({ payment_hash })` → status = "Received"
2. Execute: `output = handler(input)`
3. Settle: `fiber.settle_invoice({ payment_hash, preimage })` — releases funds
4. Return result with preimage as proof

```json
{
  "type": "TASK_RESULT",
  "payload": {
    "output": { "translated": "你好世界" },
    "preimage": "0x...",
    "execution_time_ms": 123,
    "proof_hash": "sha256(output)"
  }
}
```

---

## 5. Security Model

### Hold Invoice Guarantee

| Scenario | Outcome |
|---|---|
| Provider completes work | Provider settles invoice → receives funds |
| Provider doesn't complete work | Invoice expires → funds return to Caller |
| Provider sends wrong output | Caller has preimage proof of payment |
| Caller refuses to pay | Provider doesn't execute (checks payment first) |
| Network failure during execution | Invoice expires → funds return to Caller |

### Attack Vectors Mitigated

| Attack | Mitigation |
|---|---|
| Double-spend | Fiber TLC atomically locks funds |
| Replay attack | Message IDs + timestamps + signatures |
| MITM | TLS for HTTP, Fiber's encrypted P2P channels |
| DoS | offer_ttl_seconds limits resource allocation |

---

## 6. Transport

### Primary: HTTP

- `POST /agentpay/request` — SERVICE_REQUEST → SERVICE_OFFER
- `POST /agentpay/execute` — TASK_INPUT → TASK_RESULT

### Secondary: Fiber custom_records

For fully on-chain communication, protocol data can be embedded in Fiber payments:
```
fiber.send_payment({
  custom_records: {
    "65536": base64(SERVICE_REQUEST)
  }
})
```

### Tertiary: x402 Compatible

AgentPay can act as an x402 Facilitator:
- HTTP 402 response with `PAYMENT-REQUIRED` header including Fiber invoice
- Scheme: `exact`, Network: `ckb-fiber`

---

## 7. Multi-Asset Support

| Asset | Fiber Mechanism |
|---|---|
| CKB | Native (no `udt_type_script`) |
| BTC | Cch module (`send_btc`/`receive_btc`) |
| USDT/USDC/USDI | `udt_type_script` in channel & invoice |
| Custom UDT | Any xUDT `type_script` |

---

## 8. Service Discovery

Agents can be discovered via:
1. **Direct URL**: Known provider endpoint
2. **AgentPay Registry**: HTTP API listing agents and services
3. **.bit Domain**: `translator.agent.bit` → resolve to pubkey + endpoints
4. **Fiber Graph**: `fiber.graph_nodes()` to discover peers

---

## 9. Error Codes

| Code | Meaning |
|---|---|
| 1001 | Service not found |
| 1002 | Budget insufficient |
| 1003 | Offer expired |
| 2001 | Payment failed |
| 2002 | Payment timeout |
| 2003 | Invoice expired |
| 3001 | Task execution failed |
| 3002 | Task timeout |
| 4001 | Invalid signature |
| 4002 | Protocol version mismatch |
