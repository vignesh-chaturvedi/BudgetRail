# Phase 1 evidence

**Run date:** 2026-08-03  
**Command:** `pnpm phase1:local`  
**Environment:** isolated Surfpool network with the Solana devnet Subscriptions Program lazily cloned  
**Result:** pass

## Assertions

| Assertion                           | Result                                              |
| ----------------------------------- | --------------------------------------------------- |
| x402 version and scheme             | v2 / `exact`                                        |
| Facilitator simulation verification | `true`                                              |
| Allowed top-level payment program   | `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44` only |
| Fixed allowance                     | 2,000,000 base units                                |
| Delegated payment                   | 100,000 base units                                  |
| Merchant final balance              | 100,001 base units (1 seeded + 100,000 paid)        |
| Over-budget challenge               | rejected as `AMOUNT_EXCEEDS_REQUEST_LIMIT`          |
| Protected response                  | returned only after successful settlement           |
| Secret persistence                  | none; all signers were disposable and in memory     |

## Addresses

```text
Owner/facilitator: 4PfhCBNZfcGDXgBpR2HRBr2yzrC3G7ppvnMTLZ3ffuG6
Agent:             4fUe6EBjV1kmhYtMLFeJUTqPM8EeqxSDZBgJDdkjqpHz
Merchant:          Djd2f5AGpGV8AANXGEC6SAn2QiZGZpuJWXcij5y4Cdsj
Mint:              J3GmUHVhQ4CsfGfHA6kXfZtKPEjup2ineqgExaJC58BA
Delegation PDA:    9JQPTAXDBcgnvYCnyurak653nCNBLj2bF9mmNbBDPqSX
Merchant ATA:      S3NtVkKWLbX7XDecDXsL4Bw3QnvStzceQGQy3D7EkNC
```

## Local transaction signatures

```text
Create mint:
u8x3v76Y5gDEJiy31oQtt9EERJyAQcDWbfhgdyWjF31DVqByxVzYsjEG1ybdFxAarY3VqiyyW3ma7DBLsPFKiyY

Fund owner token account:
2nWtHMFu4WFPrta9XJJokojzZEq6zXKaW8ENH6gAybhZZRa1oJzA4kMBBd1QaiwksLF7qqmZqerkjAmqAFvLXpLP

Create merchant token account:
58aNcMTZK26LqGovnmgDCNRrKQxM8tSuirwXV6N1HwowVdjzagC6y9Qo3FSDmvh2XcS5MttezZWG26DmBvdm5J7d

Initialize subscription authority:
4QKQFeZso2K4VvdQe7T7Ra6MPbv36dPRtxo4BH3Qv23h1zPsbu8Ay2vWoQU9naqexVUW58Eahx9eCfaPfqU5WoXX

Create fixed delegation:
nrRV3BSVPrkSoB7xE7gCqEjhnQHTk7QqPBn9DpKUiWwRXtr68Jd2AwU7KZUtqDqYKr9kmTfQCsCJiqsVBL7PvV7

x402 delegated settlement:
5vejtsLtJHQX6qnHMSuncLhzf6JGCU87mfYBA4wxDoePMDU6BwcoCTLQwBXqsB3V3uuhgVFkBryncjz8WcVR3XKm
```

These signatures belong to an ephemeral local Surfpool ledger and are evidence of the recorded run, not public Explorer links. The proof is reproducible with `pnpm phase1:local`.

## Public devnet note

`pnpm phase1:devnet` is ready to create equivalent public signatures. Two attempts against Solana's public devnet faucet failed before any project transaction was submitted: first JSON-RPC `-32603`, then HTTP `429 Too Many Requests`. No product or compatibility failure occurred. Rerun when faucet capacity is available; mainnet remains intentionally disabled.
