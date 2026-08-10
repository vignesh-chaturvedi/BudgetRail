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

The Dockerfile is pinned to the only Surfpool-hosted Linux architecture (`linux/amd64`). The final image built successfully under Colima with Rosetta support, runs as the non-root `nextjs` user, is 98.4 MB, and reports all eight grant-profile readiness controls as passing with mainnet writes locked.

The exact image also passed the five-step local judge flow: Identity → Pay 0.10 USDC → reject 3.00 USDC → Revoke → reject the next payment. The standalone adversarial proof still performs a fresh post-payment native program simulation, while the judge runtime prepares the same native over-budget denial at rail creation so the interactive proof is deterministic across translated and native x64 hosts. Responsive checks at 375 px, 768 px, and 1280 px had no horizontal overflow, and browser logs contained no warnings or errors.

The results are summarized visually in [`PHASE_6_DEPLOYMENT_REPORT.html`](./PHASE_6_DEPLOYMENT_REPORT.html). The public URL, public-host clean-browser rerun, public devnet signatures, video, and Colosseum links remain in [`SUBMISSION_CHECKLIST.md`](./SUBMISSION_CHECKLIST.md) until the pushed commit is deployed.
