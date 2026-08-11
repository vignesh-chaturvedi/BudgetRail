FROM --platform=linux/amd64 amd64/node:22-bookworm-slim AS dependencies
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --fetch-retries=5 --fetch-timeout=300000 --network-concurrency=4

FROM dependencies AS builder
ARG NEXT_PUBLIC_SOLANA_CLUSTER=devnet
ARG NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
ENV NEXT_PUBLIC_SOLANA_CLUSTER=$NEXT_PUBLIC_SOLANA_CLUSTER
ENV NEXT_PUBLIC_SOLANA_RPC_URL=$NEXT_PUBLIC_SOLANA_RPC_URL
COPY . .
RUN pnpm build

FROM --platform=linux/amd64 amd64/node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV BUDGETRAIL_RUNTIME=container
ENV BUDGETRAIL_REPLICA_COUNT=1
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
# Readiness, not health: /api/health answers from static state and keeps
# returning 200 when the Surfpool rail has stopped serving reads, which is the
# failure a reviewer would actually hit. /api/readiness probes the ledger, so an
# exhausted rail marks the container unhealthy and the platform recycles it. The
# timeout clears that probe's own 4s ledger deadline.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/readiness').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
