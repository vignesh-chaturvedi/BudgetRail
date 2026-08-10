# BudgetRail threat model

Updated on 2026-08-10 for the Phase 5 devnet architecture.

## Security objective

An autonomous agent may spend only the amount, token, network, recipient, and time window explicitly authorized by its owner. A merchant releases protected data only after a one-time x402 challenge is verified and settled. No LLM output may modify transaction-critical fields.

## Trust boundaries

| Component                          | Trusted for                                               | Never trusted for                                       |
| ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| Owner wallet                       | approving allowance creation and revocation               | server custody or silent signing                        |
| Deterministic agent policy         | narrowing immutable payment requirements                  | natural-language transaction construction               |
| Agent signer                       | signing the approved delegated instruction                | selecting merchant, mint, network, amount, or fee payer |
| Merchant                           | issuing one-time challenges and releasing the artifact    | changing a signed requirement after issuance            |
| x402 facilitator                   | restricted simulation, fee-payer signature, settlement    | arbitrary top-level program execution                   |
| Solana Subscriptions Program       | enforcing cap, expiry, delegate, and revocation           | application UX or off-chain replay storage              |
| RPC response and registry metadata | data to validate against expected identities and programs | instructions, secrets, or executable content            |

## STRIDE matrix

| Threat                 | Attack                                                    | Existing mitigation                                                                                      | Phase 6 action                                                             |
| ---------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Spoofing               | malicious merchant, facilitator, or operational wallet    | exact origin/network/mint/recipient/fee-payer allow-lists; registry state read-back                      | bind production configuration to reviewed deployment values                |
| Tampering              | mutate amount or requirements between challenge and retry | canonical requirement equality; signed payload; deterministic instruction construction                   | persist challenge records across production instances                      |
| Repudiation            | deny payment or revocation                                | Solana signatures, registry receipts, policy activity, settlement response                               | retain structured production audit events without sensitive payloads       |
| Information disclosure | RPC/API error contains a key or credential                | centralized redaction, fixed facilitator errors, no raw browser console errors, secret scan              | configure hosted log redaction and retention                               |
| Denial of service      | repeatedly reset or run expensive proof endpoints         | same-origin browser mutation guard and operation locks                                                   | add per-session isolation, distributed rate limits, quotas, and timeouts   |
| Elevation of privilege | bypass app policy to overspend                            | native fixed delegation enforces cap/expiry/delegate; facilitator allow-lists only Subscriptions Program | simulate every mainnet transaction and keep writes disabled until approval |

## Invariants

1. A successful payment decreases remaining authority by exactly the settled amount.
2. A denied payment changes neither allowance nor merchant balance.
3. Only the registered operational wallet may sign delegated x402 payments.
4. A challenge is single-use; reservation happens before facilitator I/O.
5. Unknown settlement outcome is consumed, never automatically retried.
6. Revocation removes all remaining agent authority.
7. Protected data is returned only with a successful x402 settlement receipt.
8. External error text is not exposed without redaction.

## Data classification

| Data                                   | Classification             | Storage                                    | Retention                         |
| -------------------------------------- | -------------------------- | ------------------------------------------ | --------------------------------- |
| Disposable agent/owner private keys    | critical credential        | server memory inside isolated demo process | process lifetime only             |
| Public keys, balances, signatures      | public financial metadata  | Solana ledger and transient UI state       | ledger lifetime / browser session |
| x402 challenge and payment fingerprint | security state             | in-memory merchant map                     | demo process lifetime             |
| Policy decisions                       | non-secret audit data      | in-memory activity list                    | demo process lifetime             |
| Hosted RPC/API credentials             | future critical credential | not currently required                     | must use deployment secret store  |

## Explicit non-goals for Phase 5

- No mainnet execution or funded production key.
- No custom on-chain program or upgrade authority.
- No claim that the in-memory demo runtime is horizontally scalable.
- No long-term storage of user identity or transaction history.
