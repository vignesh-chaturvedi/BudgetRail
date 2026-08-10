# BudgetRail deployment runbook

This runbook publishes the devnet grant demo. It does **not** authorize or enable mainnet transactions.

## Hosting requirement

Use a Linux x64 platform that runs the included Docker image as one long-lived Node 22 container with persistent process lifetime. Do not use arm64: Surfpool 1.4 publishes a Linux x64 native binary, but no Linux arm64 binary. Do not use a serverless/edge function target for the judge demo: the embedded Surfpool runtime and replay store are process-local. Node 22.13+ is required by pinned pnpm 11.20.

Recommended shape: one container, 2 vCPU, at least 2 GB RAM, port `3000`, HTTPS termination at the hosting proxy, and no autoscaling beyond one replica.

## Required environment

| Variable                            | Hosted value                              | Notes                                         |
| ----------------------------------- | ----------------------------------------- | --------------------------------------------- |
| `BUDGETRAIL_DEPLOYMENT_MODE`        | `grant-demo`                              | activates the strict hosted readiness profile |
| `BUDGETRAIL_RUNTIME`                | `container`                               | already set by the image                      |
| `BUDGETRAIL_PUBLIC_URL`             | final HTTPS origin                        | no trailing path                              |
| `BUDGETRAIL_REPLICA_COUNT`          | `1`                                       | required while replay state is process-local  |
| `BUDGETRAIL_X402_NETWORK`           | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | Solana devnet CAIP-2 identifier               |
| `BUDGETRAIL_MAX_PAYMENT_BASE_UNITS` | `100000`                                  | 0.10 USDC                                     |
| `BUDGETRAIL_ENABLE_MAINNET_WRITES`  | `false`                                   | readiness fails if true                       |
| `BUDGETRAIL_BUILD_SHA`              | deployed Git SHA                          | public, non-secret provenance                 |

The image builds with `NEXT_PUBLIC_SOLANA_CLUSTER=devnet` and the public devnet RPC. Any `NEXT_PUBLIC_*` value is browser-visible and must never contain an API key.

## Pre-flight

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm run ci
pnpm phase5:local
pnpm security:secrets
pnpm security:audit
pnpm phase6:release
docker build --platform linux/amd64 --tag budgetrail:phase6 .
```

## Local image rehearsal

```bash
docker run --rm --publish 3000:3000 \
  --platform linux/amd64 \
  --env BUDGETRAIL_DEPLOYMENT_MODE=grant-demo \
  --env BUDGETRAIL_PUBLIC_URL=https://budgetrail.example \
  --env BUDGETRAIL_X402_NETWORK=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1 \
  --env BUDGETRAIL_ENABLE_MAINNET_WRITES=false \
  budgetrail:phase6
```

Verify:

```bash
curl --fail http://127.0.0.1:3000/api/health
curl --fail http://127.0.0.1:3000/api/readiness
curl --fail http://127.0.0.1:3000/.well-known/agent.json
```

## Public verification

1. Deploy the commit that passed the release gate.
2. Confirm the platform is running exactly one replica and overwrites `X-Forwarded-For`/equivalent client-IP headers.
3. Confirm `/api/health` is `200` and `/api/readiness` returns `status: ready`, `cluster: devnet`, and `mainnetWritesLocked: true`.
4. Open a clean private browser with no local storage and execute Identity → Pay → Challenge cap → Revoke → Prove.
5. Repeat from a separate browser profile. Use Reset between runs.
6. Confirm security headers, mobile layout, Explorer links, agent card URLs, and no browser-console errors.
7. Paste the live URL, video, Colosseum link, receipt, and public transaction signatures into `docs/SUBMISSION_CHECKLIST.md`.

## Rollback

- Keep the previously verified image tag/Git SHA available.
- If readiness fails, disable traffic and redeploy the previous SHA; never bypass the readiness check.
- If the public demo is abused, take it offline or tighten quotas. No mainnet funds are at risk because the deployed profile uses disposable local/devnet state.
- Runtime restart resets disposable signers and demo state; use Reset after recovery.

## Mainnet is a separate project gate

BudgetRail has no custom program to deploy, but a real mainnet service would still need a paid primary and independent fallback RPC, durable replay state, distributed quotas, monitored wallet balances, external signer custody, a funded-wallet threat review, transaction simulation, and explicit owner approval. None of those are inferred from this grant-demo deployment.
