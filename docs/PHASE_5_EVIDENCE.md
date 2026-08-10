# Phase 5 evidence — adversarial proof matrix

Recorded on 2026-08-10.

## Exit gate

**Passed:** every critical payment guardrail is automated, the three headline outcomes are visible in the judge console, the repository and generated client bundle pass a high-confidence secret scan, and the production dependency tree contains no high or critical advisory.

All transaction proofs run on an isolated Surfpool fork of Solana devnet with disposable in-memory signers. Mainnet remains untouched.

## Reproduce

```bash
pnpm test
pnpm phase5:local
pnpm security:secrets
pnpm security:audit
pnpm run ci
```

## Headline proof

`pnpm phase5:local` executes one rail through four state-changing conditions:

1. **Valid:** 0.10 USDC settles and the allowance falls from 2.00 to 1.90 USDC.
2. **Over budget:** production policy rejects a 3.00 USDC request before signing; a test-only payload then reaches restricted facilitator simulation, where the native 2.00 USDC delegation independently rejects it.
3. **Expired:** Surfpool advances the chain clock past the allowance expiry and restricted simulation rejects another 0.10 USDC payment.
4. **Revoked:** the owner closes the delegation and the next autonomous purchase fails before payment preparation.

Both adversarial simulations assert that the remaining allowance and merchant balance are unchanged.

```json
{
  "status": "phase-5-adversarial-proof-complete",
  "execution": "isolated-surfpool-devnet-fork",
  "headlineOutcomes": {
    "delegatedPayment": {
      "result": "settled",
      "amountBaseUnits": "100000"
    },
    "overBudget": {
      "result": "denied-before-settlement",
      "requestedBaseUnits": "3000000",
      "policyCode": "AMOUNT_EXCEEDS_REQUEST_LIMIT",
      "programSimulation": "rejected",
      "remainingBaseUnits": "1900000"
    },
    "expired": {
      "result": "rejected",
      "remainingBefore": "1900000",
      "remainingAfter": "1900000",
      "merchantBefore": "100001",
      "merchantAfter": "100001"
    },
    "postRevocation": {
      "result": "denied-before-payment",
      "railStatus": "revoked"
    }
  }
}
```

The command prints the disposable settlement signature for that run. It belongs to the isolated Surfpool ledger and is reproducibility evidence, not a public Explorer transaction.

## Automated matrix

| Scenario                             | Enforced at                                  | Expected result                                                    | Automated evidence              |
| ------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------ | ------------------------------- |
| Valid 0.10 USDC                      | policy + facilitator + Subscriptions Program | settle once; unlock result; 1.90 remains                           | Surfpool proof + merchant tests |
| 3.00 against 2.00 cap                | policy + restricted program simulation       | reject; balances unchanged                                         | Surfpool proof + policy tests   |
| Expired delegation                   | chain clock + Subscriptions Program          | reject; balances unchanged                                         | Surfpool time-travel proof      |
| Revoked delegation                   | chain account state                          | reject before payment                                              | Surfpool proof                  |
| Duplicate/concurrent replay          | merchant challenge reservation               | HTTP 409; settle once                                              | merchant concurrency tests      |
| Wrong recipient                      | deterministic agent policy                   | reject before signing                                              | exact-code policy test          |
| Wrong mint                           | deterministic agent policy                   | reject before signing                                              | exact-code policy test          |
| Wrong network                        | deterministic agent policy                   | reject before signing                                              | exact-code policy test          |
| Stale challenge                      | merchant expiry                              | reject before facilitator call                                     | controlled-clock merchant test  |
| Malformed amount                     | strict base-unit parser                      | reject zero, signed, decimal, exponent, plus, and whitespace forms | parameterized policy tests      |
| Merchant unavailable                 | agent transport boundary                     | actionable failure before signing                                  | agent-loop tests                |
| RPC unavailable                      | transaction preparation boundary             | no submission; actionable failure                                  | agent-loop tests                |
| Facilitator verification unavailable | merchant boundary                            | retryable 502; challenge reopens                                   | merchant tests                  |
| Settlement outcome unknown           | merchant boundary                            | challenge consumed; no automatic retry                             | merchant tests                  |

## Secret and diagnostic safety

- `packages/security` redacts bearer tokens, credential assignments, token prefixes, PEM keys, RPC query credentials, and Solana 64-byte key arrays.
- API responses and activity records use bounded, redacted diagnostics.
- External facilitator failure messages are replaced with fixed public errors.
- Browser-side transaction failures no longer write raw error objects to the console.
- Mutation endpoints reject cross-origin browser requests.
- The repository scanner covers current tracked/untracked files, all four Git commits, and generated `.next/static` artifacts.
- Result: **103 source files, 4 commits, and 19 client artifacts scanned; zero high-confidence secret finding.**

## Dependency hardening

The first production audit found eight high-severity advisories. Phase 5 remediated them by:

- upgrading Next.js and `eslint-config-next` from 16.2.6/16.0.10 to 16.2.12;
- overriding `sharp` to 0.35.3;
- overriding `postcss` to 8.5.26;
- overriding legacy `nanoid` versions below 3.3.17 to 3.3.17.

The final `pnpm audit --prod --audit-level high` passes with **0 critical and 0 high** vulnerabilities. One moderate `uuid@8.3.2` advisory remains in the legacy Agent Registry/web3.js RPC dependency chain. BudgetRail does not call the affected UUID v3/v5/v6 buffer APIs; forcing a transitive major override would create a larger compatibility risk, so it is documented and isolated for upstream monitoring.

## Browser proof

The Phase 5 console adds a **Prove 3.00 denial** control and expands the judge path to **Identity → Pay → Challenge cap → Revoke → Prove**. The over-budget activity has no signature because it is intentionally rejected before settlement, while its independent program simulation proves that bypassing the application policy still cannot exceed the native allowance.

The complete path was exercised in the browser against the isolated ledger. Responsive checks passed at 375 px, 768 px, and 1280 px with no horizontal overflow, undersized interactive controls, non-semantic click handlers, or browser warnings/errors. Reset then produced a fresh disposable identity and live 2.00 USDC rail.

The final CI run contains **74 passing tests across 12 test files**, plus the five standalone Surfpool phase proofs.

## Review outcome

- Security grade: **B**
- Quality grade: **A**
- Critical findings: **0**
- High findings: **0**
- Ready for mainnet: **No**—by policy, deployment isolation, persistent replay storage, rate limiting, and a mainnet simulation review belong to Phase 6.

See [`PHASE_5_SECURITY_REVIEW.html`](./PHASE_5_SECURITY_REVIEW.html), [`THREAT_MODEL.md`](./THREAT_MODEL.md), and [the dated security report](../.superstack/security-reports/BudgetRail-2026-08-10.md).
