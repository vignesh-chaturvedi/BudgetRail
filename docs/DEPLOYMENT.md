# BudgetRail deployment runbook

This runbook publishes the devnet grant demo. It does **not** authorize or enable mainnet transactions.

## Hosting requirement

Use a Linux x64 platform that runs the included Docker image as one long-lived Node 22 container with persistent process lifetime. Do not use arm64: Surfpool 1.4 publishes a Linux x64 native binary, but no Linux arm64 binary. Do not use a serverless/edge function target for the judge demo: the embedded Surfpool runtime and replay store are process-local. Node 22.13+ is required by pinned pnpm 11.20.

Recommended shape: one container, port `3000`, HTTPS termination at the hosting proxy, and no autoscaling beyond one replica.

Measured footprint: **76 MB idle, ~150 MB peak** with a rail seeded and the full judge flow running, settling to ~100 MB after a reset. A 512 MB instance is comfortable; the rail is a single embedded ledger, not a database, so there is no reason to buy 2 GB. CPU matters more than memory during the ~14 s rail seed — a fractional-CPU instance will seed more slowly than the figures in the container rehearsal below.

Prefer a host that polls the health check continuously. Render restarts an instance after 60 s of failed checks, so an exhausted rail recovers on its own; Railway only checks at deploy time, so there the slot budget and the console's Reset are the only recovery paths.

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
| `BUDGETRAIL_SLOT_TIME_MS`           | `400`                                     | decides how long a rail survives — see below  |
| `BUDGETRAIL_BLOCK_PRODUCTION_MODE`  | `transaction`                             | one block per transaction, not per tick       |
| `BUDGETRAIL_DEVNET_RPC_URL`         | dedicated devnet endpoint                 | **secret** — set in the host's env store only |

`BUDGETRAIL_DEVNET_RPC_URL` may contain an API key. Set it through the hosting
platform's secret store; never commit it, never put it in `.env.example`, and
never expose it as a `NEXT_PUBLIC_*` variable. It is read only on the server, is
never returned by any API route, and is redacted from public diagnostics.

## Surfpool slot budget

Surfpool 1.4 stops answering ledger state after roughly **1,050 produced
slots**. The failure is partial, so nothing external looks wrong: `getHealth`
and `getVersion` keep returning while `getSlot`, `getAccountInfo`, and the whole
judge console hang. Measured directly — an offline surfnet starts at slot 0 and
stops answering at slot ~1,060 — and it reproduces identically whether the
ledger forks devnet or runs offline, on every block-production mode, and against
both the public and a dedicated devnet RPC.

The budget is spent in **slots, not seconds**, so the slot tick is what decides
how long a rail lives. At Surfpool's default tick the rail produces ~13 slots
per second and dies about 90 seconds after it starts — shorter than any review.
`BUDGETRAIL_SLOT_TIME_MS=400` stretches the same budget across hours while
transactions still confirm immediately, because a transaction lands in the next
produced block rather than waiting for a tick.

Do not lower this value for a hosted demo. If Surfpool is upgraded, re-measure
before changing it: start a rail, leave it idle, and confirm `getSlot` still
answers after ten minutes.

`/api/readiness` fails closed on an exhausted rail, so a container healthcheck
recycles the process instead of serving a frozen console. Verify after deploying
that readiness reports `ledger.status: "live"`.

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
curl --fail http://127.0.0.1:3000/api/ledger/rpc
```

## Verifiable ledger endpoint

Explorer links in the judge console point at `/api/ledger/rpc` on the public
origin, not at the container-local Surfpool port, so a reviewer's browser can
actually resolve them. `GET` on that path returns the endpoint's own policy
description; `POST` speaks read-only JSON-RPC.

Confirm after deploying that a refused method still answers like a validator —
HTTP 200 carrying `-32601`, not an HTTP error — because Solana Explorer probes
optional enhanced methods on every account view and an HTTP error status leaves
its account page spinning:

```bash
curl -s -X POST https://YOUR-ORIGIN/api/ledger/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAsset","params":["x"]}'
```

Confirm writes and cheat codes are refused and the ledger is untouched:

```bash
for m in sendTransaction requestAirdrop surfnet_setAccount getLargestAccounts; do
  curl -s -X POST https://YOUR-ORIGIN/api/ledger/rpc \
    -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$m\"}"
done
```

## Public verification

1. Deploy the commit that passed the release gate.
2. Confirm the platform is running exactly one replica and overwrites `X-Forwarded-For`/equivalent client-IP headers.
3. Confirm `/api/health` is `200` and `/api/readiness` returns `status: ready`, `cluster: devnet`, and `mainnetWritesLocked: true`.
4. Open a clean private browser with no local storage and execute Identity → Pay → Challenge cap → Revoke → Prove.
5. Repeat from a separate browser profile. Use Reset between runs.
6. Open at least one signature link and the allowance address link in Solana
   Explorer and confirm both render — the transaction should decode as
   `Subscriptions: CreateFixedDelegation`/`TransferFixed` and the allowance
   address as a `Fixed Delegation` showing the cap, delegatee, and expiry. Use a
   fresh tab: Explorer caches a failed custom cluster for the life of the tab,
   so a reload after any rail outage keeps showing `Loading`.
7. Confirm security headers, mobile layout, agent card URLs, and no browser-console errors.
8. Paste the live URL, video, Colosseum link, receipt, and public transaction signatures into `docs/SUBMISSION_CHECKLIST.md`.

## Rollback

- Keep the previously verified image tag/Git SHA available.
- If readiness fails, disable traffic and redeploy the previous SHA; never bypass the readiness check.
- If the public demo is abused, take it offline or tighten quotas. No mainnet funds are at risk because the deployed profile uses disposable local/devnet state.
- Runtime restart resets disposable signers and demo state; use Reset after recovery.

## Mainnet is a separate project gate

BudgetRail has no custom program to deploy. The hosted grant demo remains devnet-only, but a separately gated, fixed-value mainnet proof is defined in [`PHASE_7_MAINNET_CANARY.md`](./PHASE_7_MAINNET_CANARY.md). That canary does not make the hosted service production-ready.

A real mainnet service would still need a paid primary and independent fallback RPC, durable replay state, distributed quotas, monitored wallet balances, external signer custody, a funded-wallet threat review, transaction simulation, and explicit owner approval. None of those are inferred from either the grant-demo deployment or the tiny canary.
