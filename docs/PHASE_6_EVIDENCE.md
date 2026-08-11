# Phase 6 evidence — release candidate

Date: 2026-08-10  
Target: public single-container Solana devnet grant demo  
Mainnet status: locked; no transaction signed or broadcast

## What Phase 6 adds

- Portable linux/amd64 Node 22 standalone Docker image for the embedded Surfpool runtime.
- Fail-closed `/api/readiness` policy for container runtime, devnet CAIP-2 binding, HTTPS origin, one replica, and the mainnet-write lock.
- Lightweight `/api/health` liveness endpoint with public build provenance.
- Dynamic `/.well-known/agent.json`, so agent metadata always uses the deployed origin.
- Registry metadata resolves to that live origin when configured, with a stable public-repository fallback for local proofs.
- Bounded per-client quotas on public state, reset, purchase, merchant, over-budget, and revoke routes.
- Canonical mainnet USDC for read-only views while mainnet mutations remain impossible.
- Reproducible release checker, architecture, threat model, deployment/rollback runbook, 75-second demo script, and submission checklist.

## Automated release proof

Run:

```bash
pnpm phase6:release
```

Expected headline output:

```json
{
  "status": "phase-6-release-candidate",
  "expectedGitHubRemote": true,
  "deploymentProfileReady": true,
  "mainnetWritesLocked": true
}
```

The checker validates the repository remote, required public artifacts, hosted-demo configuration, one-replica constraint, and the mainnet tripwire. It intentionally reports public deployment, clean-browser verification, video, and final evidence links as external gates.

## Security decision

This build is approved as a **devnet grant-demo release candidate**, not as a production-money or mainnet system. A single long-running container keeps replay state coherent. Public endpoint quotas reduce accidental or abusive proof execution. Durable multi-instance replay state, distributed limits, external signer custody, production RPC failover, and monitoring remain prerequisites for any future mainnet proposal.

## Verification record

On 2026-08-10 the final local run produced:

- typecheck, lint, and Next.js standalone production build: pass;
- Vitest: 14 files and 91 tests passed;
- release checker: all 16 artifacts present and all eight hosted-profile controls passed;
- secret scan: 117 current tracked/untracked files, five Git-history commits, and 19 client artifacts checked with zero finding;
- production dependency audit: zero high or critical advisories and one transitive moderate advisory.

The Dockerfile is pinned to the only Surfpool-hosted Linux architecture (`linux/amd64`). The final image built successfully under Colima with Rosetta support, runs as the non-root `nextjs` user, and reports all eight grant-profile readiness controls as passing with mainnet writes locked.

The image measures **412 MB** on disk (10 layers, `amd64`/`linux`). An earlier revision of this document recorded 98.4 MB; that figure was a mis-measurement, not a regression — the dependency set has not changed, and the size was confirmed by rebuilding the same Dockerfile.

The exact image also passed the five-step local judge flow: Identity → Pay 0.10 USDC → reject 3.00 USDC → Revoke → reject the next payment. The standalone adversarial proof still performs a fresh post-payment native program simulation, while the judge runtime prepares the same native over-budget denial at rail creation so the interactive proof is deterministic across translated and native x64 hosts. Responsive checks at 375 px, 768 px, and 1280 px had no horizontal overflow, and browser logs contained no warnings or errors.

The results are summarized visually in [`PHASE_6_DEPLOYMENT_REPORT.html`](./PHASE_6_DEPLOYMENT_REPORT.html). The public URL, public-host clean-browser rerun, hosted-demo evidence links, video, and Colosseum links remain in [`SUBMISSION_CHECKLIST.md`](./SUBMISSION_CHECKLIST.md) until the pushed commit is deployed. Those evidence links resolve against the deployment's own read-only ledger view rather than public devnet, because the judge rail is an isolated Surfpool fork.

## Container rehearsal

The `linux/amd64` image was re-verified end to end under Colima with Rosetta, running the grant-demo profile with a dedicated devnet RPC:

- all eight readiness controls pass inside the container, including the `x64` runtime-architecture check under Rosetta translation;
- the full judge flow completes at native speed — seed 14.1 s, payment 2.2 s, over-budget denial 1.2 s, revocation 0.05 s;
- the rail answered every probe across a 1,000-second soak (50/50 `getSlot`, `/api/readiness`, and `/api/demo/state` checks) with Docker reporting `healthy` and a failing streak of zero;
- Solana Explorer resolved a settlement signature through the container's `/api/ledger/rpc` and decoded it as a Subscriptions instruction;
- writes, airdrops, simulation, `surfnet_*` cheat codes, and full-ledger scans were all refused with a validator-shaped `-32601` at HTTP 200, and a look-alike origin was rejected with HTTP 403.

This supersedes the earlier five-step local check, which predates the Surfpool slot-budget fix and would have run inside the window before a rail exhausts itself.
