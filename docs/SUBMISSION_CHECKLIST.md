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

**These signatures are deliberately not pinned here.** A rail is disposable: any
container restart, redeploy, or press of `Reset demo` replaces it, and the
previous signatures stop resolving. Pinning them would leave dead links in a
public repository within hours. Generate live ones instead — the five-step flow
takes under a minute and produces a fresh, verifiable set every time.

Verified end to end on the live deployment, one clean run:

- [x] Agent Registry registration, operational-wallet link, 0.10 USDC settlement, and owner revocation each produced a signature that resolved through `/api/ledger/rpc` and decoded as Subscriptions, Agent Registry, and Compute Budget instructions
- [x] Budget arithmetic: cap `2.000000`, spent `0.100000`, remaining `1.900000` — the over-budget attempt left it unchanged
- [x] Over-budget and post-revoke attempts both recorded as `denied` in the live activity view. The post-revoke attempt reports _“The delegation is closed; agent payment authority is no longer available.”_ Denied transactions intentionally have no settlement signature
- [x] The allowance account reads as **closed** after revocation, confirming authority was removed on-chain rather than disabled in the application

The permanent, independently verifiable public-chain evidence is the mainnet
canary below. Those transactions are on `mainnet-beta` and resolve forever.

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
