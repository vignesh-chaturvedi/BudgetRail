# BudgetRail submission checklist

Fill the link placeholders only after deploying the pushed Phase 6 commit.

## Required links

- [ ] Live HTTPS demo: `PENDING`
- [x] Repository: `https://github.com/vignesh-chaturvedi/BudgetRail`
- [ ] Reviewer access: the repository is private, so `abhwshek@gmail.com` must be granted read access before submitting
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

- [ ] Agent Registry registration: `PENDING_LIVE_RUN`
- [ ] Operational-wallet link: `PENDING_LIVE_RUN`
- [ ] Successful 0.10 USDC payment: `PENDING_LIVE_RUN`
- [ ] Owner revocation: `PENDING_LIVE_RUN`
- [ ] Allowance address renders as a `Fixed Delegation` with its cap, delegatee, and expiry: `PENDING_LIVE_RUN`
- [ ] Over-budget and post-revoke rejection evidence: link the live activity view; denied transactions intentionally have no settlement signature.

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

- [ ] `/api/health` returns `200`
- [ ] `/api/readiness` reports `ready`, `devnet`, and `mainnetWritesLocked: true`
- [ ] `/.well-known/agent.json` uses the live origin
- [ ] `GET /api/ledger/rpc` describes the read-only policy; `sendTransaction`, `requestAirdrop`, `surfnet_*`, and `getLargestAccounts` are all refused
- [ ] Identity → Pay → Challenge cap → Revoke → Prove completes
- [ ] Explorer/evidence links open without authentication or local files
- [ ] A signature link decodes in Solana Explorer as a Subscriptions instruction, and the allowance address renders as a `Fixed Delegation` with its cap, delegatee, and expiry (open in a fresh tab)
- [ ] 375 px, 768 px, and desktop layouts have no overflow
- [ ] Browser console has no warnings/errors
- [ ] Repository setup works from a fresh clone

## Suggested final update

> BudgetRail is complete: a verified Solana agent receives a native fixed USDC delegation, completes an x402-protected payment, rejects a request above its cap, and loses all remaining authority when the owner revokes it. The fixed Phase 7 canary repeated the critical loop with 0.20 real mainnet USDC: exactly 0.10 settled, unsafe attempts changed no balances, revocation finalized, and all temporary funds and accounts were recovered. The hosted demo remains deliberately devnet-only and mainnet writes stay locked.
