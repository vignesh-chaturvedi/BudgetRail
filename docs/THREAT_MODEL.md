# BudgetRail threat model

Updated on 2026-08-10 for the Phase 6 devnet grant-demo release candidate and isolated Phase 7 mainnet canary.

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
| Local mainnet canary CLI           | executing one reviewed, fixed-value proof                 | unattended production payments or hosted custody        |

## STRIDE matrix

| Threat                 | Attack                                                    | Existing mitigation                                                                                                                                               | Remaining production action                                    |
| ---------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Spoofing               | malicious merchant, facilitator, or operational wallet    | exact origin/network/mint/recipient/fee-payer allow-lists; registry read-back; four unique canary addresses; independently confirmed recovery wallet              | require reviewed production identities before wider mainnet    |
| Tampering              | mutate amount or requirements between challenge and retry | canonical requirement equality; signed payload; fixed mainnet constants; deterministic run nonce; clean-commit preflight                                          | durable transactional replay storage before horizontal scaling |
| Repudiation            | deny payment or revocation                                | Solana signatures, finalized slots, registry receipts, bounded activity records, atomic external evidence journal                                                 | production audit retention before real-value use               |
| Information disclosure | RPC/API error contains a key or credential                | centralized redaction; fixed errors; keypairs, authenticated RPC, and raw state outside Git; owner-only permissions; current/history/bundle secret scan           | configure hosted log retention and secret scanning             |
| Denial of service      | repeatedly reset or run expensive proof endpoints         | same-origin mutation guard, operation locks, bounded public quotas; the mainnet CLI is local-only and single-use per run ID                                       | distributed rate limits before horizontal scaling              |
| Elevation of privilege | bypass app policy to overspend                            | native fixed delegation; restricted top-level programs; fail-closed hosted mainnet tripwire; 0.20 USDC exact-balance gate; 0.05 SOL ceiling; explicit write guard | formal funded-wallet review before raising any exposure        |

## Invariants

1. A successful payment decreases remaining authority by exactly the settled amount.
2. A denied payment changes neither allowance nor merchant balance.
3. Only the registered operational wallet may sign delegated x402 payments.
4. A challenge is single-use; reservation happens before facilitator I/O.
5. Unknown settlement outcome is consumed, never automatically retried.
6. Revocation removes all remaining agent authority.
7. Protected data is returned only with a successful x402 settlement receipt.
8. External error text is not exposed without redaction.
9. Mainnet canary writes cannot start without a clean committed tree, private mainnet RPC, exact acknowledgement, and exact bounded funding.
10. A completed canary leaves no delegation or Subscription Authority and no token delegate on the owner account.

## Data classification

| Data                                   | Classification             | Storage                                    | Retention                          |
| -------------------------------------- | -------------------------- | ------------------------------------------ | ---------------------------------- |
| Disposable agent/owner private keys    | critical credential        | server memory inside isolated demo process | process lifetime only              |
| Public keys, balances, signatures      | public financial metadata  | Solana ledger and transient UI state       | ledger lifetime / browser session  |
| x402 challenge and payment fingerprint | security state             | in-memory merchant map                     | demo process lifetime              |
| Policy decisions                       | non-secret audit data      | in-memory activity list                    | demo process lifetime              |
| Hosted RPC/API credentials             | future critical credential | not required by the devnet grant demo      | must use deployment secret store   |
| Mainnet canary keypair files           | critical credential        | protected local directory outside Git      | delete after sweep and final audit |
| Authenticated canary RPC URL           | critical credential        | protected local shell/runtime file         | rotate or delete after canary      |
| Sanitized canary evidence              | public financial metadata  | external journal, then reviewed Git copy   | project evidence lifetime          |

## Explicit non-goals

- No mainnet execution in the hosted grant demo; the local canary is a separate bounded proof.
- No custom on-chain program or upgrade authority.
- No claim that the in-memory demo runtime is horizontally scalable; readiness enforces one replica.
- No long-term storage of user identity or transaction history.
- No production custody, funded server signer, authenticated browser RPC credential, recurring unattended payments, or claim of production mainnet readiness.
