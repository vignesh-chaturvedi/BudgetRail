# BudgetRail threat model

Updated on 2026-08-10 for the Phase 6 devnet grant-demo release candidate.

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

| Threat                 | Attack                                                    | Existing mitigation                                                                                           | Phase 6 action                                                     |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Spoofing               | malicious merchant, facilitator, or operational wallet    | exact origin/network/mint/recipient/fee-payer allow-lists; registry read-back; dynamic same-origin agent card | require reviewed production identities before any mainnet proposal |
| Tampering              | mutate amount or requirements between challenge and retry | canonical requirement equality; signed payload; configured public-origin guard; one-replica deployment gate   | durable transactional replay storage before horizontal scaling     |
| Repudiation            | deny payment or revocation                                | Solana signatures, registry receipts, bounded activity records, settlement response                           | production audit retention before real-value use                   |
| Information disclosure | RPC/API error contains a key or credential                | centralized redaction, fixed errors, no raw browser console errors, secret scan, public readiness allow-list  | configure hosted log retention and secret scanning                 |
| Denial of service      | repeatedly reset or run expensive proof endpoints         | same-origin mutation guard, operation locks, bounded per-client quotas and in-memory key count, one replica   | distributed rate limits before horizontal scaling                  |
| Elevation of privilege | bypass app policy to overspend                            | native fixed delegation; restricted top-level programs; fail-closed mainnet tripwire                          | separate funded-wallet review and simulate-first mainnet plan      |

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
| Hosted RPC/API credentials             | future critical credential | not required by the devnet grant demo      | must use deployment secret store  |

## Explicit non-goals for the Phase 6 grant demo

- No mainnet execution or funded production key.
- No custom on-chain program or upgrade authority.
- No claim that the in-memory demo runtime is horizontally scalable; readiness enforces one replica.
- No long-term storage of user identity or transaction history.
- No production custody, funded server signer, or authenticated browser RPC credential.
