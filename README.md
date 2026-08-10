# BudgetRail

BudgetRail gives autonomous agents capped, expiring, and instantly revocable token-spending authority for x402 payments on Solana.

## Build status

**Phases 1–5 are complete. The Phase 6 release candidate is ready for public deployment.**

The repository now contains an owner control plane for native fixed USDC delegations, a complete autonomous x402 request → challenge → pay → retry → unlock loop, a verifiable Agent Registry identity, and an adversarial judge console that proves success, over-budget denial, expiry, and revocation. All phase proofs pass on an isolated Surfpool devnet fork without a custom onchain program.

The final codebase now includes a portable long-running Node container, fail-closed release readiness, public endpoint quotas, dynamic agent metadata, and a complete deployment/demo/submission kit. Public hosting, clean-browser acceptance, the video, and final live evidence links are completed after this commit is pushed.

Mainnet writes remain intentionally locked. This release is approved only as a disposable Solana devnet grant demo.

## Phase 1 proof

The proof performs the complete risky integration path:

1. Create a disposable token mint and owner balance.
2. Initialize a native Solana subscription authority.
3. Create a fixed 2-token delegation for an agent.
4. Parse and validate an x402 v2 `exact` payment requirement.
5. Partially sign a native `transferFixed` transaction as the agent.
6. Let the x402 facilitator verify it through restricted simulation.
7. Let the facilitator add its fee-payer signature and settle it.
8. Confirm the merchant received exactly 0.10 token.
9. Reject a 3-token challenge before signing.

See [`docs/PHASE_1_EVIDENCE.md`](./docs/PHASE_1_EVIDENCE.md) for the recorded output and [`docs/ADR-001-X402-DELEGATED-SETTLEMENT.md`](./docs/ADR-001-X402-DELEGATED-SETTLEMENT.md) for the architecture decision.

## Phase 2 control plane

The connected owner dashboard now supports:

- exact six-decimal USDC caps and future expiries;
- an explicit review step before wallet signatures;
- live cap, spent, remaining, delegate, expiry, mint, and status;
- two-step, idempotent revocation;
- wrong-cluster, insufficient SOL/USDC, rejected-signature, RPC-delay, and already-revoked states;
- responsive disconnected, loading, empty, error, and success states.

Devnet uses Circle's canonical USDC test token. Mainnet and testnet remain read-only until the final safety review.

See [`docs/PHASE_2_EVIDENCE.md`](./docs/PHASE_2_EVIDENCE.md) for the reproducible create → inspect → revoke proof.

## Phase 3 autonomous payment loop

The live proof now includes:

- a self-contained HTTP 402 merchant endpoint;
- a deterministic agent that validates requirements and retries with `PAYMENT-SIGNATURE`;
- one-time, expiring challenge binding and atomic replay protection;
- facilitator verification and settlement through the native fixed delegation;
- a useful protected spend-safety brief;
- streamed transaction lifecycle, errors, and before/after budget state in the UI.

See [`docs/PHASE_3_EVIDENCE.md`](./docs/PHASE_3_EVIDENCE.md) for the recorded 0.10 USDC settlement and replay rejection.

## Phase 4 identity and operator proof

The judge-facing console now adds:

- an ERC-8004 Solana Agent Registry identity;
- an on-chain link from that identity to the exact x402 payment wallet;
- one view of the owner, agent, merchant, fixed budget, and policy trail;
- Explorer-linked registration, wallet-link, payment, and revocation receipts;
- a two-step kill switch and explicit post-revocation denial;
- a reset action that creates a fresh disposable rail for repeatable judging.

See [`docs/PHASE_4_EVIDENCE.md`](./docs/PHASE_4_EVIDENCE.md) for the reproducible identity → pay → revoke → prove workflow.

## Phase 5 adversarial hardening

The automated safety matrix now proves:

- valid 0.10 USDC settlement;
- production-policy and native-program rejection of a 3.00 USDC request against a 2.00 rail;
- expired and revoked delegation rejection with unchanged balances;
- exact failure codes for wrong recipient, mint, network, timeout, and malformed amounts;
- replay, concurrent retry, merchant, RPC, facilitator, and unknown-settlement behavior;
- redacted diagnostics, clean repository/client-bundle secret scans, and zero high/critical production dependency advisory.

See [`docs/PHASE_5_EVIDENCE.md`](./docs/PHASE_5_EVIDENCE.md), [`docs/THREAT_MODEL.md`](./docs/THREAT_MODEL.md), and [`docs/PHASE_5_SECURITY_REVIEW.html`](./docs/PHASE_5_SECURITY_REVIEW.html).

## Phase 6 release candidate

The deployment package adds:

- a linux/amd64 Node 22 standalone Docker image for the embedded Surfpool runtime;
- `/api/health` and fail-closed `/api/readiness` contracts;
- strict devnet, HTTPS-origin, one-replica, and mainnet-write-lock checks;
- bounded quotas for every public proof action;
- deployment, rollback, architecture, demo, and submission documentation;
- a reproducible `pnpm phase6:release` gate.

Start with [`docs/PHASE_6_EVIDENCE.md`](./docs/PHASE_6_EVIDENCE.md), [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md), and [`docs/SUBMISSION_CHECKLIST.md`](./docs/SUBMISSION_CHECKLIST.md).

## Run locally

Requirements: Node.js 22.13 or newer and Corepack (required by pinned pnpm 11.20).

```bash
corepack enable pnpm
pnpm install
pnpm typecheck
pnpm test
pnpm phase1:spike
pnpm phase1:local
pnpm phase2:local
pnpm phase3:local
pnpm phase4:local
pnpm phase5:local
pnpm phase6:release
pnpm security:secrets
pnpm security:audit
pnpm dev
```

The `phase*:local` commands start and stop isolated Surfpool networks. `phase1:devnet` runs the settlement proof against public devnet when the public faucet is available. All proof signers are disposable and remain in memory only.

## Important files

- `packages/x402-adapter/` — payment policy, delegated transfer, agent loop, merchant, and facilitator configuration
- `scripts/phase1-compatibility-spike.ts` — fast offline instruction-shape proof
- `scripts/phase1-devnet-proof.ts` — full Surfpool/public-devnet settlement proof
- `scripts/phase2-local-proof.ts` — reproducible allowance create/inspect/revoke proof
- `scripts/phase3-local-proof.ts` — complete autonomous purchase and replay-rejection proof
- `scripts/phase4-local-proof.ts` — identity, wallet-link, payment, revoke, and fail-closed proof
- `scripts/phase5-adversarial-proof.ts` — valid, over-budget, expired, and revoked invariant proof
- `scripts/phase6-release-check.ts` — deployment profile, artifact, repository, and mainnet-lock gate
- `scripts/security-scan.ts` — current-source, Git-history, and client-bundle credential scan
- `packages/agent-registry/` — isolated adapter for the ERC-8004 Solana Agent Registry SDK
- `packages/security/` — bounded redaction for public diagnostics and activity records
- `app/components/allowances/` — owner allowance control plane
- `app/components/phase4/` — judge-facing operator console and receipt timeline
- `app/lib/release/` — hosted-demo readiness and mainnet tripwire
- `Dockerfile` — portable single-container judge deployment
- `app/lib/allowances/` — exact amount model, persistence, errors, and native actions
- `PROJECT_PLAN.html` — interactive project assessment dashboard
- `PROJECT_PLAN.md` — source-of-truth phased specification

## Safety boundary

The LLM never chooses or mutates transaction-critical fields. Network, token mint, recipient, facilitator fee payer, amount, timeout, and resource origin must all match deterministic policy before the agent signs anything.

The public grant demo must run as one long-lived container because its disposable signers and replay store are process-local. It is not a horizontally scaled custody service.

## License

MIT
