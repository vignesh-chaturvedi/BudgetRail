# BudgetRail

BudgetRail gives autonomous agents capped, expiring, and instantly revocable token-spending authority for x402 payments on Solana.

## Build status

**Phase 1 is complete. Phase 2 has not started.**

The repository now contains an official Solana Subscriptions Next.js scaffold, a strict x402 v2 policy layer, a native `transferFixed` transaction builder, and a facilitator-compatible payload adapter. The end-to-end proof passes on an isolated Surfpool devnet fork without a custom onchain program.

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

## Run locally

Requirements: Node.js 18 or newer and Corepack.

```bash
corepack enable pnpm
pnpm install
pnpm typecheck
pnpm test
pnpm phase1:spike
pnpm phase1:local
pnpm dev
```

`phase1:local` starts and stops an isolated Surfpool network. `phase1:devnet` runs the same proof against public devnet when the public faucet is available. All proof signers are disposable and remain in memory only.

## Important files

- `packages/x402-adapter/` — payment policy, delegated transfer, payload, and facilitator configuration
- `scripts/phase1-compatibility-spike.ts` — fast offline instruction-shape proof
- `scripts/phase1-devnet-proof.ts` — full Surfpool/public-devnet settlement proof
- `app/` — official Subscriptions Next.js starter to be transformed in Phase 2
- `PROJECT_PLAN.html` — interactive project assessment dashboard
- `PROJECT_PLAN.md` — source-of-truth phased specification

## Safety boundary

The LLM never chooses or mutates transaction-critical fields. Network, token mint, recipient, facilitator fee payer, amount, timeout, and resource origin must all match deterministic policy before the agent signs anything.

## License

MIT
