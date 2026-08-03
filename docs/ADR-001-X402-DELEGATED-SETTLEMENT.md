# ADR-001: x402 delegated settlement path

**Status:** accepted for implementation  
**Date:** 2026-08-03

## Context

The normal x402 SVM exact-payment client creates a direct token-transfer transaction. BudgetRail must instead execute `transferFixed` through Solana's Subscriptions Program so the onchain allowance—not an offchain promise—enforces the cap and expiry.

The current `@x402/svm` facilitator provides a simulation-based verification path for program-mediated payments. It simulates an allowed top-level program and validates the resulting token transfer through inner instructions.

## Decision

Use x402 v2's `exact` scheme and configure the facilitator with:

- `enableSmartWalletVerification: true`
- `smartWalletAllowedPrograms: [SUBSCRIPTIONS_PROGRAM_ADDRESS]`
- a 400,000 compute-unit ceiling
- a 50,000 microlamport priority-fee ceiling

BudgetRail will replace only the buyer-side transaction construction: a strictly validated x402 `PaymentRequirements` object becomes a `transferFixed` instruction. The HTTP headers, merchant challenge, facilitator verify/settle cycle, and settlement receipt remain x402 v2.

## Security consequences

- The simulation fallback is not open to arbitrary programs.
- Recipient, mint, amount, network, resource origin, and timeout are validated before signing.
- The facilitator still verifies the actual token-transfer outcome.
- Duplicate settlement protection remains mandatory.
- An LLM is never allowed to construct or mutate the transaction.

## Phase 1 evidence

- Unit tests parse the constructed instruction and assert `transferFixed`, amount, mint, and delegator.
- Policy tests reject over-budget, wrong-origin, wrong-network, wrong-mint, wrong-recipient, and wrong-facilitator requirements.
- The full proof creates a disposable mint and fixed delegation on an isolated Surfpool devnet fork.
- x402's facilitator verifies the partially signed payload through its simulation path, adds the fee-payer signature, settles it, and post-verifies the inner token transfer.
- The merchant balance increases by exactly 100,000 base units and a 3,000,000-base-unit requirement is rejected before signing.

No custom facilitator fork and no custom onchain program are required. The public-devnet runner remains available for an explorer-linked replay; the public faucet returned HTTP 429 during this checkpoint.
