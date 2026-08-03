# BudgetRail

BudgetRail gives autonomous agents capped, expiring, and instantly revocable token-spending authority for x402 payments on Solana.

## Build status

**Phases 1–3 are complete. Phase 4 has not started.**

The repository now contains an owner control plane for native fixed USDC delegations and a complete autonomous x402 request → challenge → pay → retry → unlock loop. All phase proofs pass on an isolated Surfpool devnet fork without a custom onchain program.

Mainnet is intentionally out of scope until the product and safety matrix are complete.

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

## Run locally

Requirements: Node.js 18 or newer and Corepack.

```bash
corepack enable pnpm
pnpm install
pnpm typecheck
pnpm test
pnpm phase1:spike
pnpm phase1:local
pnpm phase2:local
pnpm phase3:local
pnpm dev
```

The `phase*:local` commands start and stop isolated Surfpool networks. `phase1:devnet` runs the settlement proof against public devnet when the public faucet is available. All proof signers are disposable and remain in memory only.

## Important files

- `packages/x402-adapter/` — payment policy, delegated transfer, agent loop, merchant, and facilitator configuration
- `scripts/phase1-compatibility-spike.ts` — fast offline instruction-shape proof
- `scripts/phase1-devnet-proof.ts` — full Surfpool/public-devnet settlement proof
- `scripts/phase2-local-proof.ts` — reproducible allowance create/inspect/revoke proof
- `scripts/phase3-local-proof.ts` — complete autonomous purchase and replay-rejection proof
- `app/components/allowances/` — owner allowance control plane
- `app/components/phase3/` — streamed autonomous payment lab
- `app/lib/allowances/` — exact amount model, persistence, errors, and native actions
- `PROJECT_PLAN.html` — interactive project assessment dashboard
- `PROJECT_PLAN.md` — source-of-truth phased specification

## Safety boundary

The LLM never chooses or mutates transaction-critical fields. Network, token mint, recipient, facilitator fee payer, amount, timeout, and resource origin must all match deterministic policy before the agent signs anything.

## License

MIT
