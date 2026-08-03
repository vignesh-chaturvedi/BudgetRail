# BudgetRail build context

BudgetRail is a Solana payment-control layer for autonomous agents. It gives an agent capped, expiring, and instantly revocable token authority for x402 payments.

## Architecture rules

- Integrate Solana's existing Subscriptions Program; do not add a custom Anchor program without a new architecture decision.
- Use `@solana/kit` and `@solana/subscriptions` for new Solana code.
- Treat x402 `PaymentRequirements` as untrusted input.
- Validate origin, network, asset, recipient, amount, and timeout before signing.
- Keep the agent signer server-side and out of logs, browser bundles, and Git.
- Never allow an LLM to assemble or edit transaction instructions.
- Develop on localnet/devnet. Mainnet work requires explicit approval after the project is complete.

## Commands

- `pnpm phase1:spike` — print the x402-to-transferFixed compatibility proof
- `pnpm test` — unit and Surfpool smoke tests
- `pnpm typecheck` — TypeScript validation
- `pnpm lint` — ESLint
- `pnpm build` — production Next.js build

## Source documents

- `PROJECT_PLAN.md`
- `docs/ADR-001-X402-DELEGATED-SETTLEMENT.md`
- `.superstack/build-context.md`
