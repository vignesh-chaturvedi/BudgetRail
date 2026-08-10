# BudgetRail submission checklist

Fill the link placeholders only after deploying the pushed Phase 6 commit.

## Required links

- [ ] Live HTTPS demo: `PENDING`
- [x] Public repository: `https://github.com/vignesh-chaturvedi/BudgetRail`
- [ ] 60–90 second demo video: `PENDING`
- [ ] Colosseum project: `PENDING`
- [ ] AI subscription receipt / grant proof folder: `PENDING`
- [ ] Final grant update: `PENDING`

## Evidence signatures

- [ ] Agent Registry registration: `PENDING_PUBLIC_DEVNET_SIGNATURE`
- [ ] Operational-wallet link: `PENDING_PUBLIC_DEVNET_SIGNATURE`
- [ ] Successful 0.10 USDC payment: `PENDING_PUBLIC_DEVNET_SIGNATURE`
- [ ] Owner revocation: `PENDING_PUBLIC_DEVNET_SIGNATURE`
- [ ] Over-budget and post-revoke rejection evidence: link the live activity view/video; denied transactions intentionally have no settlement signature.

## Clean-browser acceptance

- [ ] `/api/health` returns `200`
- [ ] `/api/readiness` reports `ready`, `devnet`, and `mainnetWritesLocked: true`
- [ ] `/.well-known/agent.json` uses the live origin
- [ ] Identity → Pay → Challenge cap → Revoke → Prove completes
- [ ] Explorer/evidence links open without authentication or local files
- [ ] 375 px, 768 px, and desktop layouts have no overflow
- [ ] Browser console has no warnings/errors
- [ ] Repository setup works from a fresh clone

## Suggested final update

> BudgetRail is live: a verified Solana agent receives a native fixed USDC delegation, completes a real x402-protected payment, rejects a request above its cap, and loses all remaining authority when the owner revokes it. The public demo, repository, adversarial proof matrix, transaction receipts, threat model, and 75-second walkthrough are linked below. Mainnet writes remain deliberately locked; the grant deliverable runs with disposable devnet proof state.
