<div align="center">

<img src="public/logo-mark.svg" alt="" width="76" height="76">

# BudgetRail

**Give an autonomous agent a spending limit it cannot exceed.**

Capped, expiring, and instantly revocable USDC authority for x402 payments on
Solana — built on the native Subscriptions Program, with no custom onchain code.

[Live demo](https://budgetrail.onrender.com) ·
[Architecture](docs/ARCHITECTURE.md) ·
[Threat model](docs/THREAT_MODEL.md) ·
[Mainnet evidence](docs/PHASE_7_MAINNET_EVIDENCE.md)

</div>

---

BudgetRail gives autonomous agents capped, expiring, and instantly revocable token-spending authority for x402 payments on Solana.

## Try it

### 1. Hosted, nothing to install — about a minute

Open **[budgetrail.onrender.com](https://budgetrail.onrender.com)** and scroll past the wallet card to the judge console. No wallet, no login, no setup.

| Click                           | What it proves                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Run 0.10 USDC task`            | The agent gets an HTTP 402, checks price against policy, signs, and settles. Budget drops 2.00 → 1.90.          |
| `Prove 3.00 denial`             | Policy rejects it before signing, and Solana's program simulation rejects it independently. Balances unchanged. |
| `Revoke now` → `Confirm revoke` | The owner closes the delegation account on-chain.                                                               |
| `Prove post-revoke denial`      | The next payment fails closed — the authority is gone from the chain, not disabled in the app.                  |
| Any `↗` in Verifiable activity  | Opens that signature in Solana Explorer.                                                                        |

`Reset demo` seeds a fresh rail at any time.

The hosted rail is an isolated Surfpool fork of devnet, so its signatures resolve
through this deployment's own read-only ledger at `/api/ledger/rpc` rather than
public devnet. **Open Explorer links in a fresh tab** — Explorer caches a failed
custom cluster for the life of a tab.

### 2. Your own rail on public devnet

Connect a devnet wallet holding devnet USDC ([Circle's faucet](https://faucet.circle.com/)) at the top of the page, then create, inspect, and revoke a real allowance against Solana's native Subscriptions Program. Your wallet signs every transaction; BudgetRail never receives a key.

### 3. From a clean clone

Requires Node 22.13+ and Corepack.

```bash
corepack enable pnpm
pnpm install
pnpm test          # unit and Surfpool smoke tests
pnpm phase5:local  # valid, over-budget, expired, and revoked invariants
pnpm dev           # the same console on http://localhost:3000
```

Every `phase*:local` command starts and stops its own isolated Surfpool network
and needs no faucet, key, or funded wallet.

## Build status

**Phases 1–7 are complete. The fixed-value mainnet canary passed and was fully swept without enabling mainnet writes in the hosted app.**

The repository now contains an owner control plane for native fixed USDC delegations, a complete autonomous x402 request → challenge → pay → retry → unlock loop, a verifiable Agent Registry identity, and an adversarial judge console that proves success, over-budget denial, expiry, and revocation. All phase proofs pass on an isolated Surfpool devnet fork without a custom onchain program.

The codebase includes a portable long-running Node container, fail-closed release readiness, public endpoint quotas, dynamic agent metadata, a deployment/demo/submission kit, and a separate local mainnet-canary harness.

The demo is live at **[budgetrail.onrender.com](https://budgetrail.onrender.com)**, where the full Identity → Pay → Challenge cap → Revoke → Prove loop runs with no wallet, login, or local setup. Every signature it produces is verifiable in Solana Explorer against the deployment's own read-only ledger view.

Mainnet writes remain intentionally locked in the hosted application. The only mainnet write path is the local Phase 7 CLI: it pins canonical USDC and the native Subscriptions Program, enforces an exact 0.20 USDC exposure, requires a private RPC and explicit acknowledgement, records finalized evidence, revokes authority, and sweeps every disposable balance.

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
- `/api/ledger/rpc`, a read-only public view of the judge ledger so every
  Explorer link in the console resolves for a remote reviewer;
- a slot-budget-aware rail configuration and a readiness probe that fails closed
  on an exhausted ledger, because Surfpool 1.4 stops answering state reads after
  roughly 1,050 produced slots while still reporting `getHealth: ok`;
- strict devnet, HTTPS-origin, one-replica, and mainnet-write-lock checks;
- bounded quotas for every public proof action;
- deployment, rollback, architecture, demo, and submission documentation;
- a reproducible `pnpm phase6:release` gate.

Start with [`docs/PHASE_6_EVIDENCE.md`](./docs/PHASE_6_EVIDENCE.md), [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md), and [`docs/SUBMISSION_CHECKLIST.md`](./docs/SUBMISSION_CHECKLIST.md).

## Phase 7 mainnet canary

The isolated canary harness adds:

- disposable mainnet-only owner, agent, facilitator, and merchant signers stored outside Git;
- pinned cluster, program, mint, allowance, payment, rejection, expiry, and SOL-exposure checks;
- exact 0.10 USDC x402 settlement from a 0.20 USDC native fixed delegation;
- policy and native-simulation rejection of a 0.30 USDC attempt with unchanged balances;
- finalized revocation, post-revoke denial, authority closure, and token-delegate verification;
- an independently replayable signature check, rent-recovering cleanup sweep, and sanitized evidence report.

Run `BR-MN-20260810-001` passed on mainnet: the 0.10 USDC payment finalized, both negative tests left balances unchanged, all authority was removed, and the full 0.20 USDC plus remaining SOL and token-account rent returned to the confirmed recovery wallet. Mainnet also exposed a trailing-account mismatch in the installed Subscriptions SDK; the journal failed closed, the guarded containment path finalized revocation, and the fix is now covered by the canary workflow.

The hosted demo remains devnet-only. Review [`docs/PHASE_7_MAINNET_EVIDENCE.md`](./docs/PHASE_7_MAINNET_EVIDENCE.md), the [standalone HTML report](./docs/PHASE_7_MAINNET_REPORT.html), and the reusable [`docs/PHASE_7_MAINNET_CANARY.md`](./docs/PHASE_7_MAINNET_CANARY.md) runbook.

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
pnpm ledger:budget
pnpm phase7:canary inspect
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
- `scripts/mainnet-canary.ts` — fixed-scope mainnet inspection, canary, verification, evidence, and sweep CLI
- `scripts/security-scan.ts` — current-source, Git-history, and client-bundle credential scan
- `packages/agent-registry/` — isolated adapter for the ERC-8004 Solana Agent Registry SDK
- `packages/security/` — bounded redaction for public diagnostics and activity records
- `packages/mainnet-canary/` — mainnet constants, configuration guards, evidence schema, report rendering, and tests
- `app/components/allowances/` — owner allowance control plane
- `app/components/phase4/` — judge-facing operator console and receipt timeline
- `app/lib/release/` — hosted-demo readiness and mainnet tripwire
- `app/lib/ledger/` — rail startup configuration, ledger liveness probe, and read-only method/origin/load policy for the public ledger view
- `scripts/ledger-slot-budget-probe.ts` — measures how long a Surfpool rail keeps answering; re-run after any Surfpool upgrade
- `Dockerfile` — portable single-container judge deployment
- `app/lib/allowances/` — exact amount model, persistence, errors, and native actions
- `PROJECT_PLAN.html` — interactive project assessment dashboard
- `PROJECT_PLAN.md` — source-of-truth phased specification

## Safety boundary

The LLM never chooses or mutates transaction-critical fields. Network, token mint, recipient, facilitator fee payer, amount, timeout, and resource origin must all match deterministic policy before the agent signs anything.

The public grant demo must run as one long-lived container because its disposable signers and replay store are process-local. It is not a horizontally scaled custody service. The local Phase 7 canary is evidence of the bounded mainnet primitive, not authorization for unattended production spending.

## License

MIT
