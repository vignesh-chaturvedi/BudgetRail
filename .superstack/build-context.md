# Build Context

> Phase 4 handoff updated 2026-08-04. Stop here for the repository push before Phase 5.

## Product

- **Name:** BudgetRail
- **Deadline:** 2026-08-17 (Asia/Kolkata)
- **Primary KPI:** one end-to-end proof loop showing a successful delegated x402 payment, an over-budget rejection, and a post-revocation rejection, each with verifiable evidence
- **Network policy:** Surfpool/local and Solana devnet during development; no mainnet execution until the finished-project safety review

## Actual stack

| Layer               | Choice                                                     | Current status                                           |
| ------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| Web                 | Next.js 16 + React 19 + TypeScript + Tailwind CSS 4        | owner control plane + judge operator console complete    |
| Solana client       | `@solana/kit` 6.9                                          | wallet, RPC queries, and native actions integrated       |
| Allowance primitive | native Subscriptions Program + `@solana/subscriptions` 0.3 | create, inspect, and idempotent revoke proven            |
| Payments            | x402 v2.20 `exact` + BudgetRail delegated payload adapter  | full HTTP 402 request/pay/retry/unlock loop proven       |
| Identity            | ERC-8004 Solana Agent Registry via `8004-solana` 0.8.2     | identity registration and operational-wallet link proven |
| Token               | Circle test USDC on devnet; disposable mint in proofs      | exact six-decimal model and balance checks complete      |
| Testing             | Vitest + Surfpool 1.4                                      | 48 passing tests + four standalone phase proofs          |
| Package manager     | pnpm 11.20 via Corepack                                    | locked                                                   |
| License             | MIT                                                        | added                                                    |

The global Solana CLI was not installed because the Phase 1 native integration needs no custom program build or deployment. Surfpool is project-local and reproducible through the lockfile.

`pnpm peers check` reports an upstream metadata warning inside `@x402/svm` 2.20: its bundled Solana program clients declare Kit 5 while the x402 package itself supports Kit 5.1 and newer. Kit 6.9 typechecks, all tests pass, and the full facilitator settlement succeeds, so this is recorded rather than papered over with overrides.

## Scaffold and helpers

- Base: official `solana-foundation/templates/kit/nextjs-subscriptions`
- Installed skill: `.agents/skills/solana-dev`
- Payment reference: official `kit-node-solanax402` template and x402 v2.20 SDK
- MCPs: none required for Phase 1; Helius can be added later if the dashboard needs indexed history

## Architecture rule

Use the audited native delegation program. No custom Anchor program is required: x402 v2.20's smart-wallet verification path accepts the program-mediated `TransferChecked` CPI when the top-level program allow-list contains only the Subscriptions Program.

## Phase 1 result

- Strictly validated x402 fields: version, origin, scheme, network, asset, recipient, facilitator fee payer, amount, and timeout
- Native `transferFixed` instruction and x402 `PAYMENT-SIGNATURE` payload builder
- Facilitator constrained to `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`
- Full Surfpool settlement: facilitator verification `true`; merchant delta `100000` base units
- Over-budget policy rejection: `AMOUNT_EXCEEDS_REQUEST_LIMIT`
- Public devnet rerun prepared; Solana public faucet returned HTTP 429 on 2026-08-03

## Phase 2 result

- Owner dashboard creates, inspects, and revokes native fixed delegations
- Exact bigint USDC parsing prevents floating-point precision loss
- On-chain remaining amount is authoritative; local metadata only preserves the original cap
- Transaction review, two-step revoke, Explorer links, balance readiness, and actionable failures
- Mainnet and testnet writes disabled until the finished-project safety review
- Standalone Surfpool proof records create/revoke signatures and idempotent repeat-revoke behavior
- Responsive review passed at 375 px, 768 px, and 1280 px with no browser console warnings/errors

## Phase 3 result

- Self-contained x402 merchant endpoint issues one-time, expiring 0.10 USDC challenges
- Deterministic agent validates origin, network, mint, recipient, amount, fee payer, and timeout before signing
- Paid retry settles through native `transferFixed` and unlocks a structured spend-safety brief
- Atomic challenge reservation and payment fingerprinting reject concurrent and repeated fulfillment
- Standalone Surfpool proof records a 2.00 → 1.90 USDC allowance change and HTTP 409 replay rejection
- Dashboard streams the real lifecycle and exposes idle, loading, success, and retryable failure states

## Phase 4 result

- BudgetRail Agent receives an ERC-8004 Solana Agent Registry identity backed by a Metaplex Core asset
- Registry state is read back to verify both the owner and the exact operational wallet that signs x402 payments
- One judge console shows owner, agent, merchant, cap, spent, unused authority, policy decisions, and transaction receipts
- A two-step revoke closes the native delegation; the next payment fails before signing or unlocking the resource
- Reset creates fresh disposable wallets, identity, mint, and 2.00 USDC rail for repeatable judging
- Responsive review passed at 375 px, 768 px, and 1280 px with no overflow, undersized control, or browser warning/error

## Progress

- [x] Idea validated
- [x] Official primitives researched
- [x] Phase plan approved by user
- [x] pnpm and project-local Surfpool installed
- [x] Official repository scaffolded
- [x] x402/delegation compatibility spike passed
- [x] Phase 1 evidence recorded
- [x] Phase 2 allowance control plane
- [x] Phase 3 autonomous payment loop
- [x] Phase 4 identity, receipts, and operator UX
- [ ] Phase 5 adversarial hardening
- [ ] Phase 6 deployment and submission evidence

## Next action

Review and push this Phase 4 checkpoint to GitHub. Start Phase 5 only after the user confirms the push is complete.
