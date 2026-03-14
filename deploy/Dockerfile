# ─── Build Stage ──────────────────────────────────────────
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/sdk/package.json packages/sdk/
COPY packages/x402-facilitator/package.json packages/x402-facilitator/
COPY examples/translate-agent/package.json examples/translate-agent/
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY packages/ packages/
COPY examples/ examples/
RUN pnpm -r build

# ─── Provider Agent ──────────────────────────────────────
FROM node:20-alpine AS provider
RUN corepack enable
WORKDIR /app
COPY --from=base /app .
EXPOSE 3001
CMD ["node", "--loader", "tsx", "examples/translate-agent/provider.ts"]

# ─── x402 Facilitator ───────────────────────────────────
FROM node:20-alpine AS x402
RUN corepack enable
WORKDIR /app
COPY --from=base /app .
EXPOSE 4020
CMD ["node", "--loader", "tsx", "packages/x402-facilitator/src/index.ts"]
