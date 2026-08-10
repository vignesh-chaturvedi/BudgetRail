# BudgetRail Phase 7 mainnet evidence

> Run `BR-MN-20260810-001` — **PASS / SWEPT**  
> Independently verified through finalized slot `438357104` on 2026-08-10.

BudgetRail completed one bounded real-money proof on Solana mainnet. A disposable
agent spent exactly 0.10 USDC from a 0.20 USDC fixed delegation, a 0.30 USDC
attempt was rejected without settlement, revocation stopped the formerly valid
payment, and every disposable balance and token account was then swept or
closed. This is evidence for the primitive, not a production deployment or an
unlock of hosted mainnet writes.

## Fixed scope

| Control                | Value                                          |
| ---------------------- | ---------------------------------------------- |
| Network                | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`      |
| Full genesis hash      | `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` |
| Subscriptions Program  | `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44` |
| Canonical mainnet USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Fixed allowance        | 200,000 base units / 0.20 USDC                 |
| Valid payment          | 100,000 base units / 0.10 USDC                 |
| Rejected request       | 300,000 base units / 0.30 USDC                 |
| Expiry                 | 900 seconds                                    |
| Phase 6 baseline       | `a953cc545e4bd234676358b34c19faec424d6499`     |
| Canary commit          | `1fd527ed03d03903f8bb70590e3109f1594ede23`     |
| RPC provider           | Helius; authenticated URL excluded             |

## Public addresses

| Role                      | Address                                        |
| ------------------------- | ---------------------------------------------- |
| Owner                     | `ADUBPMbwYg6XWDnoL9ne2P5VLmJPPVbNQAyeBLWYp7py` |
| Agent                     | `9LBYPaTxcrCUh9A6dJHm2dzfCCK6B5j5Djniip1hE4tR` |
| Facilitator               | `Af986b3EUZ6GUVgcKes1XJDcUnb6Jy25ZqVNGpCekTe1` |
| Merchant                  | `CBvQyFf4SWVjENxyTapLckQZF6NsX2QqGaZrAxKmEaA6` |
| Fixed delegation          | `46mA7dDvaV7p5CfZTBoLWg14ZkXej7ZXzk811wDVbUVz` |
| Confirmed recovery wallet | `5bghjkxL5qdFC8DeaVFRgZEd1zD1M4RTxPekSomQGFgr` |

## Finalized transaction evidence

| Stage                 | Transaction                                                                                                                                                       |      Slot | Result                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | -------------------------------------- |
| Setup                 | [5VNastav…JmBoMv91](https://explorer.solana.com/tx/5VNastavjf7yTA6Ziriky4zcsFW8TxHcqMSmLGxxrHmEdgzEnPYYxPUhAY2jGJwFHPGN9Ynk7qSDAdzbJmBoMv91?cluster=mainnet-beta) | 438354929 | Authority and merchant account created |
| Delegation            | [3JmKg2tm…gDzUd9GM](https://explorer.solana.com/tx/3JmKg2tmF4wEgqaWPzCCDwRDbFBu8YCpCdgPhyStdAK3sex8BGsSgPvAxMKAW7U8kgjCqoPuTiRen3jDgDzUd9GM?cluster=mainnet-beta) | 438354964 | 0.20 USDC fixed delegation created     |
| Payment               | [2rLj5Laj…Uyar8Qis](https://explorer.solana.com/tx/2rLj5LajHdsZzG7tdtmMrWE2vLDzbt9npGBMGJ2DdEktkUsNxRsc1Hm9dAZ3VjoQmFRZJmyPRshs1W2oUyar8Qis?cluster=mainnet-beta) | 438355000 | Exactly 0.10 USDC settled              |
| Revoke                | [5qe2EWva…Cj8HTTks](https://explorer.solana.com/tx/5qe2EWvaaEb5991DC3oScw2RpHu6dWe3AeMRPXVY4Kocf7g8nFTj2azrRFYVuPvJrFi8NrMfBEhFHQJwCj8HTTks?cluster=mainnet-beta) | 438355289 | Delegation closed                      |
| Close authority       | [2pgEz4qj…mqzmkK2p](https://explorer.solana.com/tx/2pgEz4qjDeU1jjEY8pNtfQVrkPzxeB7e8SY4yE2xMAYCWnKamDAAwisjXkzuKGfzYWeWVxUvsz7igbxRmqzmkK2p?cluster=mainnet-beta) | 438355587 | Subscription Authority closed          |
| Clear token delegate  | [4Hr426NC…URbZK7xc](https://explorer.solana.com/tx/4Hr426NCiABxM3nbFP4qRwJsT6MnA6Mi8ME9Se8KxdYjouBLJS9tpbkV3926jAzVgXw8ToMWTyj45NxNURbZK7xc?cluster=mainnet-beta) | 438355939 | Stale SPL delegate explicitly cleared  |
| Sweep owner USDC      | [4ZrY6WY6…a9s9V6pN](https://explorer.solana.com/tx/4ZrY6WY6vfLztRzh1nTx2DzXQsEcjnFw8Vu2p4JV9gs4ZqtAMCjSSdcRKXJR5pPEsDVtoduLMkmxt7uUa9s9V6pN?cluster=mainnet-beta) | 438356274 | Remaining owner USDC recovered         |
| Sweep merchant USDC   | [2AHeSj2Y…qTHeeaSh](https://explorer.solana.com/tx/2AHeSj2Y3iLirGMuSgSa1V9x4JPVenUtE7tQYx6mD6onrvNGLuNrBVVBhxfiHp1tCFjwu1ASQVp7gbhwqTHeeaSh?cluster=mainnet-beta) | 438356308 | Merchant proceeds recovered            |
| Close owner ATA       | [3yiDWkzV…HQboPKvg](https://explorer.solana.com/tx/3yiDWkzVPiXTG8E1jooNmycQXQtuAfVv4aJ61EXFTAzbBAYiXgbwiBxCA86CGqSSwf5GbWbapMX2fubDHQboPKvg?cluster=mainnet-beta) | 438356345 | Token account closed; rent returned    |
| Close merchant ATA    | [5oyqMHen…2ZCdjYoH](https://explorer.solana.com/tx/5oyqMHenxBdkWPnpwoWfLvoYkwFaWGU3RQo1wg6xCpJEaThj9hNuqah1UFNzUyBXeKQ76y9uC1sEhPa32ZCdjYoH?cluster=mainnet-beta) | 438356382 | Token account closed; rent returned    |
| Sweep facilitator SOL | [5sXrmW2q…J2MNkkCx](https://explorer.solana.com/tx/5sXrmW2q2RKbYpe9eFWXKH6z6iQq41c9XpkrUm3z7Sqk6WasZkCBZ1JoFk2PGVmPAhnES28d7D7aywKfJ2MNkkCx?cluster=mainnet-beta) | 438357104 | Exact post-fee SOL balance recovered   |

The two expected denials have no transaction signature: both were rejected
before broadcast, then checked against unchanged finalized balances.

## Invariants

| Snapshot             | Owner USDC | Merchant USDC | Facilitator SOL lamports |
| -------------------- | ---------: | ------------: | -----------------------: |
| Before               |    200,000 |             0 |               20,000,000 |
| After payment        |    100,000 |       100,000 |               14,109,679 |
| After negative tests |    100,000 |       100,000 |               16,292,079 |
| After sweep          |          0 |             0 |                        0 |

| Assertion                                                                 | Result |
| ------------------------------------------------------------------------- | ------ |
| Payment moved exactly 100,000 base units                                  | PASS   |
| Remaining fixed authority changed from 200,000 to 100,000                 | PASS   |
| Deterministic policy rejected 300,000 with `AMOUNT_EXCEEDS_REQUEST_LIMIT` | PASS   |
| Native simulation rejected the over-budget transfer                       | PASS   |
| Over-budget rejection left token balances unchanged                       | PASS   |
| Finalized revoke closed the delegation account                            | PASS   |
| Native simulation rejected 100,000 after revoke                           | PASS   |
| Post-revoke rejection left token balances unchanged                       | PASS   |
| Subscription Authority was closed                                         | PASS   |
| SPL token delegate was cleared                                            | PASS   |
| Owner and merchant token accounts were closed                             | PASS   |
| Owner, agent, facilitator, and merchant ended with zero SOL and USDC      | PASS   |

## Mainnet discovery and fail-closed recovery

The first revoke simulation returned Subscriptions Program custom error `#113`
(`NOT_ENOUGH_ACCOUNT_KEYS`). Setup, delegation, and the intended 0.10 USDC
payment had already finalized, so the external journal preserved the exact live
state and the CLI did not replay the run.

Inspection showed that the installed SDK marks the trailing `receiver` account
as optional while the current mainnet program expects it for revoke and close.
The recovery path supplied the fixed facilitator as `receiver`, used a separately
guarded `contain` action, and finalized the revoke at slot `438355289`. No excess
payment occurred. The post-revoke probe then failed as intended with balances
unchanged.

Closing the authority did not by itself remove the SPL token account's stale
delegate field, so an explicit owner-authorized Token Program revoke cleared it.
Finally, the SOL sweep queried the fee for the exact final message and transferred
`balance - fee`; this avoided leaving an unusable rent reserve and independently
verified a zero terminal balance.

These observations are now encoded in the resumable containment, finalization,
sweep, and verification paths and covered by automated policy and fee arithmetic
tests.

## Terminal state and secret handling

Independent RPC reads verified through slot `438357104` that the delegation and
Subscription Authority no longer exist, both disposable USDC accounts are
closed, and all four disposable wallets hold zero SOL and zero USDC. The original
0.20 USDC and the remaining SOL/rent were returned to the confirmed recovery
wallet.

This reviewed report contains only public addresses, balances, signatures,
slots, and sanitized failure details. Keypair JSON, authenticated RPC URLs, API
keys, and the raw external `state.json` journal are deliberately excluded from
Git.
