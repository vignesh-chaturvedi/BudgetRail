# Build Context

> Phase 1 handoff updated 2026-08-03. Stop here for the repository push before Phase 2.

## Product

- **Name:** BudgetRail
- **Deadline:** 2026-08-17 (Asia/Kolkata)
- **Primary KPI:** one end-to-end proof loop showing a successful delegated x402 payment, an over-budget rejection, and a post-revocation rejection, each with verifiable evidence
- **Network policy:** Surfpool/local and Solana devnet during development; no mainnet execution until the finished-project safety review

## Actual stack

| Layer               | Choice                                                      | Phase 1 status                              |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| Web                 | Next.js 16 + React 19 + TypeScript + Tailwind CSS 4         | scaffolded from official template           |
| Solana client       | `@solana/kit` 6.9                                           | installed and typechecked                   |
| Allowance primitive | native Subscriptions Program + `@solana/subscriptions` 0.3  | fixed delegation proven                     |
| Payments            | x402 v2.20 `exact` + BudgetRail delegated payload adapter   | facilitator verify/settle proven            |
| Token               | configurable SPL mint; disposable six-decimal mint in proof | proven locally                              |
| Testing             | Vitest + Surfpool 1.4                                       | 11 tests passing; full proof script passing |
| Package manager     | pnpm 11.20 via Corepack                                     | locked                                      |
| License             | MIT                                                         | added                                       |

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

## Progress

- [x] Idea validated
- [x] Official primitives researched
- [x] Phase plan approved by user
- [x] pnpm and project-local Surfpool installed
- [x] Official repository scaffolded
- [x] x402/delegation compatibility spike passed
- [x] Phase 1 evidence recorded
- [ ] Phase 2 allowance control plane
- [ ] Phase 3 autonomous payment loop
- [ ] Phase 4 identity, receipts, and operator UX
- [ ] Phase 5 adversarial hardening
- [ ] Phase 6 deployment and submission evidence

## Next action

Push this Phase 1 checkpoint to GitHub. Start Phase 2 only after the user confirms the push is complete.
