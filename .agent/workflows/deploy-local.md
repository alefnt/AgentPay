---
description: how to deploy and test AgentPay locally with Docker
---

# Deploy AgentPay Locally

// turbo-all

## Steps

1. Start the infrastructure (Fiber + LND nodes):
```bash
cd d:\111new_sp\Agentxieyi
docker compose up -d
```

2. Check node status:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

3. Check Fiber node:
```bash
curl -s -X POST http://127.0.0.1:8227 -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"node_info","params":[]}' | python -m json.tool
```

4. Check LND sync status:
```bash
docker exec agentpay-lnd lncli --network=signet getinfo | python -m json.tool
```

5. Run tests:
```bash
cd d:\111new_sp\Agentxieyi
pnpm test
```

6. Start the x402 Facilitator:
```bash
cd d:\111new_sp\Agentxieyi
FIBER_RPC_URL=http://127.0.0.1:8227 npx tsx packages/x402-facilitator/src/index.ts
```

7. Verify schemes endpoint:
```bash
curl http://localhost:4020/x402/schemes | python -m json.tool
```
