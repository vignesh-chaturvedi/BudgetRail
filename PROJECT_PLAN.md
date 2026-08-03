# BudgetRail — Project Plan

**Plan version:** 1.0  
**Prepared:** 3 August 2026  
**Target ship date:** 17 August 2026 (Asia/Kolkata)  
**Status:** review required; implementation has not started

## 1. Executive decision

Build BudgetRail as a thin, auditable orchestration layer over Solana's existing Subscriptions Delegation Program—not as a new wallet or custom smart contract.

The grant demo will prove one complete control loop:

1. A user creates a **2 USDC fixed delegation** to an agent wallet, expiring in 24 hours.
2. A merchant endpoint returns an x402 payment requirement for **0.10 USDC**.
3. The agent validates the recipient, mint, amount, network, host, and expiry before signing.
4. BudgetRail executes the delegated transfer and unlocks the resource.
5. The dashboard shows the transaction receipt and **1.90 USDC remaining**.
6. An attempted **3 USDC** transfer fails because it exceeds the cap.
7. The user revokes the delegation; the next **0.10 USDC** attempt fails.

This is a more credible and winnable demo than a broad “AI wallet”: success and failure are deterministic, visible, and verifiable onchain.

## 2. Product promise

> Give an autonomous agent enough USDC authority to do useful work—without giving it unrestricted custody.

### Target users

- Developers operating paid research, data, inference, or automation agents
- Teams that need agent budgets and a human-controlled kill switch
- x402 merchants that want safer machine customers

### Core jobs

- Create a spending cap and expiry without transferring wallet custody
- Let an agent pay an approved x402 merchant autonomously
- Inspect remaining authority and payment receipts
- Revoke authority immediately
- Prove that invalid, excessive, expired, replayed, or revoked payments cannot proceed

### Non-goals for the grant MVP

- General-purpose consumer wallet
- Natural-language transaction generation
- Portfolio management or token swaps
- Multi-chain support
- Custom tokenomics or a BudgetRail token
- A custom Solana program unless the compatibility spike proves it necessary
- Production custody of user seed phrases

## 3. Why this architecture

Solana's native Subscriptions Delegation Program already provides fixed and recurring token delegations, expiries, revocation, and emitted events. The fixed-delegation path directly matches the MVP. Reusing the audited program reduces contract risk and leaves the work focused on the novel integration: safe machine payments over x402.

The x402 SDK ecosystem is evolving, so the risky boundary is not the allowance itself—it is translating a merchant's payment requirement into a program-mediated delegated transfer that the merchant or facilitator can verify. Phase 1 therefore contains a strict compatibility gate before the UI is built.

The proposed MPP subscription-intent profile is not a dependency for the grant MVP because its specification is still evolving. BudgetRail will use stable fixed delegation plus a standard x402 exact-payment request, with a small documented adapter where needed.

## 4. System architecture

```text
┌──────────────────┐       creates/revokes       ┌───────────────────────────┐
│ Human owner      │ ───────────────────────────▶ │ Subscriptions Delegation  │
│ Wallet adapter   │                              │ Program (existing/audited)│
└────────┬─────────┘                              └────────────┬──────────────┘
         │ dashboard reads                                      │ enforces cap/expiry
         ▼                                                      ▼
┌──────────────────┐  policy + receipt  ┌─────────────────────────────────────┐
│ BudgetRail web   │ ◀───────────────── │ BudgetRail agent/runtime            │
│ control plane    │                    │ deterministic validator + delegate  │
└──────────────────┘                    └──────────────────┬──────────────────┘
                                                         │ HTTP request / payment
                                                         ▼
                                            ┌──────────────────────────────┐
                                            │ x402 merchant + facilitator │
                                            │ protected demo resource     │
                                            └──────────────────────────────┘
```

### Proposed workspace

```text
BudgetRail/
├── apps/
│   ├── web/             # Owner dashboard and public demo surface
│   ├── agent/           # Deterministic agent runner and delegated signer
│   └── merchant/        # Self-contained x402-protected endpoint/facilitator
├── packages/
│   ├── solana/          # @solana/kit and subscriptions integration
│   ├── x402-adapter/    # Requirements validation and delegated transfer adapter
│   ├── agent-registry/  # Isolated 8004-solana wrapper
│   └── shared/          # Schemas, types, constants, error taxonomy
├── tests/
│   ├── integration/
│   └── e2e/
├── docs/
├── scripts/
└── .superstack/
```

### Component boundaries

| Component         | Responsibility                                                                                                         | Must not do                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Web control plane | Connect owner wallet, create/revoke authority, show remaining amount and receipts                                      | Hold the agent secret                                  |
| Agent runtime     | Call protected endpoint, validate the 402 challenge, authorize deterministic payment, keep delegate signer server-side | Let an LLM construct arbitrary transactions            |
| x402 adapter      | Validate host, network, mint, amount, recipient, nonce/expiry; construct or verify payment                             | Accept partially matching requirements                 |
| Merchant demo     | Return a real 402, verify/settle payment, unlock a useful resource                                                     | Depend on a third-party paid service for the core demo |
| Solana adapter    | Build fixed-delegation create/transfer/revoke instructions and parse state/events                                      | Reimplement allowance enforcement offchain             |
| Registry adapter  | Register and display the agent identity                                                                                | Mix legacy SDK types into the core Kit layer           |

## 5. Transaction and trust model

### Keys

- The **owner wallet** signs creation and revocation in the browser.
- The **agent delegate key** lives only in the server-side agent runtime for the demo.
- No seed phrase is stored in the browser, repository, logs, analytics, or database.
- Cluster, USDC mint, program ID, and allowed merchant are explicit configuration—not inferred from arbitrary model output.

### Policy checks before payment

Every challenge must pass all checks:

1. HTTPS origin/host is allow-listed in production.
2. Network/cluster matches the configured deployment.
3. Asset mint is the configured USDC mint.
4. Recipient equals the approved merchant recipient.
5. Amount is positive, correctly decimalized, and within both per-request and remaining limits.
6. Challenge has not expired and its replay identifier has not been consumed.
7. Delegation is live, unexpired, unrecalled, and owned by the expected user.
8. Simulated transaction succeeds before broadcast where the RPC supports it.

### Storage

Onchain delegation accounts and transaction signatures are the source of truth. The MVP may keep a small local receipt/index cache for UX, but it must be rebuildable from chain data and must not become the spending authority.

## 6. x402 compatibility gate

Before building the dashboard, implement a minimal command-line spike:

1. Merchant returns standard x402 `PaymentRequirements` for 0.10 USDC.
2. Adapter parses and strictly validates the requirements.
3. Agent signs a `transferFixed` transaction through the delegation program.
4. Merchant/facilitator settles or verifies that transaction.
5. Protected response is returned exactly once.

### Pass condition

A fresh local/devnet run produces an explorer-verifiable delegated transfer and a successful protected response without bypassing the allowance program.

### Fallback, if the current SDK assumes a plain token transfer

Use a self-hosted merchant/facilitator derived from Solana's official x402 template. It will accept and verify the program-mediated transaction while preserving the HTTP 402 challenge/response semantics. Document the adapter and the exact divergence. Do **not** silently replace the flow with an unrelated API call.

### Stop condition

If the spike cannot meet the pass condition by the end of 5 August, pause UI work and reduce scope to a transaction-verification bridge plus CLI proof. Do not spend the remaining schedule polishing an unproven integration.

## 7. Phase plan

### Phase 0 — approve the build contract (3 August)

**Outcome:** scope and risk decisions are frozen.

- Review this plan and HTML dashboard.
- Approve the MVP proof loop and non-goals.
- Choose devnet-first versus mainnet demo.
- Confirm public GitHub repository and open-source license.
- Decide whether the demo agent performs a useful paid action such as retrieving a signed research result or market-data report.

**Exit gate:** all four decisions in Section 12 are approved.

### Phase 1 — bootstrap and retire the hardest risk (4–5 August) — **complete**

**Outcome:** the delegated x402 transfer works before product UI begins.

- Install `pnpm`, current Solana CLI, and Surfpool.
- Scaffold a TypeScript monorepo from the current official Solana Next.js starter.
- Add `@solana/kit`, `@solana/subscriptions`, token helpers, and x402 dependencies.
- Implement the merchant, 402 parser, fixed-delegation transfer, and verification spike.
- Record exact transaction signatures and failure logs.
- Write an architecture decision record for the chosen settlement path.

**Exit gate:** compatibility spike passes; no custom onchain program is required.

### Phase 2 — allowance control plane (5–7 August) — **complete**

**Outcome:** the owner can create, inspect, and revoke a fixed USDC delegation.

- Connect owner wallet.
- Create a subscription authority and fixed delegation.
- Display cap, spent/remaining amount, delegate, expiry, mint, and status.
- Revoke from the dashboard.
- Handle missing funds, wrong cluster, rejected signature, RPC delay, and already-revoked states.
- Add unit and integration coverage for amount precision and state parsing.

**Exit gate:** passed on an isolated Surfpool devnet fork with fresh disposable wallets and mint; the public devnet UI is configured for Circle test USDC.

### Phase 3 — autonomous payment loop (8–10 August)

**Outcome:** a deterministic agent buys a real protected result.

- Build the self-contained x402 merchant endpoint.
- Implement the agent's request/challenge/pay/retry flow.
- Add strict payment-requirements validation and replay protection.
- Produce a useful protected artifact rather than “hello world.”
- Surface transaction lifecycle and errors in the UI.

**Exit gate:** successful 0.10 USDC payment unlocks the resource and updates remaining budget.

### Phase 4 — identity, receipts, and operator UX (11–12 August)

**Outcome:** the demo tells a coherent, verifiable story.

- Register the demo agent through Solana Agent Registry.
- Link the operational wallet/identity in the UI.
- Add an activity table with Solana Explorer links and human-readable policy decisions.
- Add “revoke now” kill switch and clear transaction feedback.
- Add reset/demo-seed workflow for repeatable judging.

**Exit gate:** a new viewer can understand owner, agent, merchant, cap, and receipts without narration.

### Phase 5 — adversarial proof matrix (13–14 August)

**Outcome:** BudgetRail proves the guardrails, not only the happy path.

- Test over-budget, expired, revoked, duplicate/replayed, wrong-recipient, wrong-mint, wrong-network, stale challenge, and malformed amount cases.
- Confirm logs never expose secrets.
- Simulate RPC and facilitator failures.
- Run dependency and repository secret scans.
- Capture evidence for the three headline outcomes.

**Exit gate:** all critical cases pass automatically; no high-severity security finding remains.

### Phase 6 — deploy and submit (15–17 August)

**Outcome:** public, reproducible grant deliverable.

- Deploy web and merchant surfaces; deploy agent runtime in a compatible Node environment.
- Verify from a clean browser and separate wallet.
- Publish public GitHub repository, setup instructions, architecture, threat model, and demo script.
- Record a 60–90 second demo: grant → pay → reject over-limit → revoke → reject.
- Prepare Colosseum project link, repository link, AI receipt, transaction signatures, and grant update.

**Exit gate:** final KPI achieved and evidence links work without local-machine access.

### Stretch — recurring budgets (only after Phase 4 is stable)

- Add recurring delegation with a daily reset.
- Show current period, next reset, and per-period remaining amount.
- Never trade away the fixed-cap proof loop or adversarial tests for this stretch goal.

## 8. Test and evidence matrix

| Scenario                         | Expected result                                      | Evidence                                |
| -------------------------------- | ---------------------------------------------------- | --------------------------------------- |
| 0.10 USDC valid payment          | protected resource returned; remaining cap decreases | tx signature + receipt + UI state       |
| 3 USDC against 2 USDC cap        | transaction rejected; resource locked                | program error + unchanged balance       |
| Payment after revoke             | transaction rejected                                 | revoke tx + failed attempt              |
| Payment after expiry             | transaction rejected                                 | chain time/state + failed simulation/tx |
| Wrong recipient                  | blocked before signing                               | deterministic policy log                |
| Wrong USDC mint/network          | blocked before signing                               | deterministic policy log                |
| Replayed challenge               | no second resource/payment                           | replay-store assertion                  |
| Merchant/facilitator unavailable | no partial success; actionable retry state           | integration test                        |
| RPC delay                        | pending state, eventual reconciliation               | UI E2E + receipt reconciliation         |
| Secret scan                      | no private keys or credentials committed             | scan report                             |

## 9. UX surface

The MVP should have one focused control-room screen rather than a marketing-heavy product:

- **Top status:** cluster, owner, registered agent, merchant, and live/revoked state
- **Budget card:** cap, spent, remaining, expiry, and progress indicator
- **Primary actions:** create delegation, run paid task, attempt over-limit proof, revoke
- **Activity:** payment/revocation signatures and policy-denial records
- **Demo guide:** a four-step judge mode with reset instructions
- **Safety:** confirmation for revoke and explicit warnings when changing network or recipient

Accessibility baseline: keyboard reachable controls, visible focus, labeled status messages, WCAG AA contrast, reduced-motion support, and no color-only state communication.

## 10. Success metrics

### Primary KPI

**One public end-to-end run that proves all three outcomes:** a successful delegated x402 purchase, an over-budget rejection, and a post-revocation rejection—with verifiable onchain receipts or deterministic failure evidence.

### Supporting metrics

- Fresh-wallet setup to first paid request in under 5 minutes
- Zero manual transaction editing during the demo
- 100% pass rate for the nine critical test scenarios
- Reproducible setup from the public README
- No private keys or privileged credentials in client bundles, logs, or Git history

## 11. Risks and mitigations

| Risk                                               | Likelihood / impact | Mitigation                                                                   | Owner phase |
| -------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- | ----------- |
| x402 SDK assumes a normal token transfer           | high / critical     | compatibility spike first; self-hosted verifier adapter fallback             | 1           |
| Devnet USDC/faucet or program availability changes | medium / high       | configurable mint/cluster; local Surfpool fixture; decide mainnet path early | 1           |
| Legacy Agent Registry SDK conflicts with Kit       | medium / medium     | isolate behind a narrow adapter package                                      | 4           |
| Scope expands into wallet/agent platform           | high / high         | enforce non-goals and one proof loop                                         | all         |
| Agent key leaks                                    | low / critical      | server-only key, secret scanning, redacted logs, disposable demo key         | 3–6         |
| Replay or malicious 402 challenge                  | medium / critical   | strict validation, nonce store, expiry, merchant allow-list                  | 3/5         |
| Deployment runtime cannot persist replay state     | medium / medium     | choose persistent store or single controlled merchant demo                   | 3/6         |
| RPC/indexing delay makes UI misleading             | medium / medium     | optimistic pending state plus chain reconciliation                           | 2/4         |
| Deadline compression                               | medium / high       | fixed delegation first; recurring and polish are stretch                     | all         |

## 12. Decisions required before implementation

- [x] **MVP:** approve the exact 2 USDC → 0.10 success → 3 USDC rejection → revoke → rejection proof loop.
- [x] **x402:** use x402 v2.20's standard simulation verifier with the Subscriptions Program as the only allowed program; no custom facilitator fork is required.
- [x] **Network:** approve devnet/local-first development, with mainnet demo only after the finished-project safety review.
- [x] **Repository:** approve a public GitHub repository with an MIT license and no secrets or funded production keys.

## 13. Cost and grant allocation

The grant is fixed at **200 USDC**. The MVP does not need a custom program deployment, so costs should remain small and most value should be demonstrated through execution quality rather than spending the full amount.

Suggested allocation:

| Use                                                                        |                     Target |
| -------------------------------------------------------------------------- | -------------------------: |
| AI coding subscription already required by the grant                       | receipt-backed actual cost |
| RPC/hosting/domain during build and demo                                   |              up to 50 USDC |
| Mainnet rent/transactions and controlled USDC demo float, only if approved |              up to 25 USDC |
| Contingency                                                                |                  remainder |

Do not inflate requested expenses or put more capital at risk to appear ambitious. A low-cost, verifiable integration is a strength.

## 14. Definition of done

- Public deployment and public GitHub repository
- Fixed USDC delegation create/inspect/revoke flow
- Real x402-protected useful resource
- Registered demo-agent identity
- Successful delegated payment with explorer-linked receipt
- Onchain over-budget rejection
- Post-revocation rejection
- Critical security and replay tests passing
- Setup guide, architecture diagram, threat model, and demo script
- Colosseum project link, GitHub link, AI receipt, and final grant evidence ready

## 15. Official technical sources

- [Solana Subscriptions & Allowances overview](https://solana.com/docs/payments/subscriptions/overview)
- [Fixed delegation guide](https://solana.com/docs/payments/subscriptions/fixed-delegation)
- [Recurring delegation guide](https://solana.com/docs/payments/subscriptions/recurring-delegation)
- [Subscriptions reference implementation](https://github.com/solana-foundation/subscriptions)
- [Solana x402 guide](https://solana.com/uk/developers/guides/getstarted/intro-to-x402)
- [Official Solana x402 template](https://solana.com/developers/templates/kit-node-solanax402)
- [Solana Agent Registry](https://solana.com/pl/agent-registry)
- [Agent Registry TypeScript quickstart](https://github.com/QuantuLabs/8004-solana-ts/blob/main/docs/QUICKSTART.md)
- [Solana Pay.sh subscription tooling](https://solana.com/docs/payments/subscriptions/pay-sh)
