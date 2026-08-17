# BudgetRail submission checklist

Fill the link placeholders only after deploying the pushed Phase 6 commit.

## Required links

- [x] Live HTTPS demo: `https://budgetrail.onrender.com`
- [x] Public repository: `https://github.com/vignesh-chaturvedi/BudgetRail` — MIT, open source, so no reviewer access grant is required
- [ ] Colosseum project: `PENDING`
- [ ] AI subscription receipt / grant proof folder: `PENDING`
- [ ] Final grant update: `PENDING`

## Hosted demo evidence

The hosted judge rail is an isolated Surfpool fork, not public devnet, so these
signatures do not exist on `explorer.solana.com`'s devnet cluster and must never
be recorded as if they do. They are verified instead against the deployment's
own read-only ledger view, which is what every Explorer link in the console
already points at:

```
https://explorer.solana.com/tx/<SIGNATURE>?cluster=custom&customUrl=https://YOUR-ORIGIN/api/ledger/rpc
```

Capture these from one clean run and paste the full Explorer URLs. Open them in
a fresh tab to confirm they resolve for someone who is not you.

Captured from a single clean run on the live deployment, rail `5ejF7Rns…RXATqr`:

- [x] Agent Registry registration: [`2xBbJPiQ…m3FEDDwj`](https://explorer.solana.com/tx/2xBbJPiQW6MmYBSLdUQ6huxib8ha3z49sy1AVjWK4W36ayKQGDqchJ78uZNh4SCfX1iqEgkrJPp8zfnVm3FEDDwj?cluster=custom&customUrl=https%3A%2F%2Fbudgetrail.onrender.com%2Fapi%2Fledger%2Frpc)
- [x] Operational-wallet link: [`7Y2SgiPb…VBSaZfGN`](https://explorer.solana.com/tx/7Y2SgiPbWdLEgZfZpVsEBrmuWtzSpiMjh87rvYFirahdvqDGKjn3tbYhmLNrqzhka1Vkjx1t6znaLHfVBSaZfGN?cluster=custom&customUrl=https%3A%2F%2Fbudgetrail.onrender.com%2Fapi%2Fledger%2Frpc)
- [x] Successful 0.10 USDC payment: [`tRzT6dde…gj6xjRen`](https://explorer.solana.com/tx/tRzT6ddewNsDNMWV2uYTJrv2Cai61TgMQM8dHoHuYzUpfahJjzsE2BqXWa6FKdeYmvnwDJ9VpF7UpGxgj6xjRen?cluster=custom&customUrl=https%3A%2F%2Fbudgetrail.onrender.com%2Fapi%2Fledger%2Frpc)
- [x] Owner revocation: [`2cqouSJc…Ewp3vHTN`](https://explorer.solana.com/tx/2cqouSJcCsMXFVJt3e37Fq5acWWHAoAaWxaAX1MNJfenCc5BhyHLKnv38J8QhaKvKXTqoCmNsdArJ9JvEwp3vHTN?cluster=custom&customUrl=https%3A%2F%2Fbudgetrail.onrender.com%2Fapi%2Fledger%2Frpc)
- [x] Budget arithmetic: cap `2.000000`, spent `0.100000`, remaining `1.900000` — the over-budget attempt left it unchanged.
- [x] Over-budget and post-revoke rejection evidence: both recorded as `denied` in the live activity view. The post-revoke attempt reports _“The delegation is closed; agent payment authority is no longer available.”_ Denied transactions intentionally have no settlement signature.
- [x] Allowance account reads as closed after revocation, confirming the authority was removed on-chain rather than disabled in the app.

A rail is disposable and is replaced by Reset or a container restart, so these
links are only valid for the life of the rail that produced them. Record them
from the same run you demonstrate, and re-capture them if the container is
redeployed before review. The permanent, independently verifiable public-chain
evidence is the mainnet canary below.

## Mainnet canary evidence

- [x] Reviewed report: [`PHASE_7_MAINNET_EVIDENCE.md`](./PHASE_7_MAINNET_EVIDENCE.md)
- [x] Judge-friendly HTML: [`PHASE_7_MAINNET_REPORT.html`](./PHASE_7_MAINNET_REPORT.html)
- [x] Successful 0.10 USDC payment: [`2rLj5Laj…Uyar8Qis`](https://explorer.solana.com/tx/2rLj5LajHdsZzG7tdtmMrWE2vLDzbt9npGBMGJ2DdEktkUsNxRsc1Hm9dAZ3VjoQmFRZJmyPRshs1W2oUyar8Qis?cluster=mainnet-beta)
- [x] Finalized revocation: [`5qe2EWva…Cj8HTTks`](https://explorer.solana.com/tx/5qe2EWvaaEb5991DC3oScw2RpHu6dWe3AeMRPXVY4Kocf7g8nFTj2azrRFYVuPvJrFi8NrMfBEhFHQJwCj8HTTks?cluster=mainnet-beta)
- [x] SPL token delegate cleared: [`4Hr426NC…URbZK7xc`](https://explorer.solana.com/tx/4Hr426NCiABxM3nbFP4qRwJsT6MnA6Mi8ME9Se8KxdYjouBLJS9tpbkV3926jAzVgXw8ToMWTyj45NxNURbZK7xc?cluster=mainnet-beta)
- [x] Terminal cleanup verified through slot `438357104`; every disposable SOL/USDC balance is zero.
- [x] Over-budget and post-revoke attempts were rejected before broadcast and left finalized balances unchanged.

## Clean-browser acceptance

Verified against `https://budgetrail.onrender.com`.

- [x] `/api/health` returns `200`
- [x] `/api/readiness` reports `ready`, `grant-demo`, `devnet`, `mainnetWritesLocked: true`, `ledger.status: live`, and all eight controls passing
- [x] `/.well-known/agent.json` uses the live origin
- [x] `GET /api/ledger/rpc` describes the read-only policy; `sendTransaction`, `requestAirdrop`, `simulateTransaction`, `surfnet_setAccount`, `surfnet_timeTravel`, `surfnet_resetNetwork`, `getLargestAccounts`, and `getProgramAccounts` are all refused with a validator-shaped `-32601`
- [x] CORS is granted only to Solana Explorer and this origin; a look-alike origin is refused `403`, and an oversized batch is refused `400`
- [x] Identity → Pay → Challenge cap → Revoke → Prove completes
- [x] Explorer/evidence links open without authentication or local files
- [x] All four evidence signatures resolve through the public ledger endpoint and decode as Subscriptions, Agent Registry, and Compute Budget instructions
- [x] 375 px, 768 px, and 1280 px layouts have no horizontal overflow and no elements past the viewport
- [x] Browser console has no warnings or errors
- [x] Repository setup works from a fresh public clone: `git clone` → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm test` → `pnpm build`, all passing

## Suggested final update

> BudgetRail is complete: a verified Solana agent receives a native fixed USDC delegation, completes an x402-protected payment, rejects a request above its cap, and loses all remaining authority when the owner revokes it. The fixed Phase 7 canary repeated the critical loop with 0.20 real mainnet USDC: exactly 0.10 settled, unsafe attempts changed no balances, revocation finalized, and all temporary funds and accounts were recovered. The hosted demo remains deliberately devnet-only and mainnet writes stay locked.
