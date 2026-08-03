# Phase 4 evidence — identity, receipts, and operator UX

Recorded on 2026-08-04.

## Exit gate

**Passed:** a fresh viewer can understand and verify BudgetRail's complete operator story from one screen: who owns the budget, which registered agent is acting, which operational wallet may pay, which merchant receives funds, how much authority remains, and why each action was allowed or denied.

The proof runs on an isolated Surfpool fork of Solana devnet with disposable in-memory signers. It executes the real devnet ERC-8004 Solana Agent Registry program, the native Subscriptions Program, and the x402 facilitator path without touching mainnet.

## Reproduce

```bash
pnpm phase4:local
```

To run the judge workflow:

```bash
pnpm dev
```

Open `http://localhost:3000` and follow the four labeled steps: **Identity → Pay → Revoke → Prove**.

## Proven sequence

1. Create a disposable owner, operational agent wallet, merchant, USDC mint, and fixed 2.00 USDC delegation.
2. Register BudgetRail Agent through the ERC-8004 Solana Agent Registry.
3. Bind the registry identity to the exact operational wallet delegated by the owner.
4. Read the registry record back and require both owner and wallet to match.
5. Buy one protected result for exactly 0.10 USDC through the x402 loop.
6. Confirm that remaining authority falls from 2.00 to 1.90 USDC.
7. Revoke the delegation through the two-step owner kill switch.
8. Attempt another agent payment and confirm that it fails closed before signing or unlocking the resource.

## Recorded proof summary

```json
{
  "status": "phase-4-operator-story-proof-complete",
  "execution": "isolated-surfpool-devnet-fork",
  "identity": {
    "protocol": "ERC-8004 Solana Agent Registry",
    "ownerVerified": true,
    "operationalWalletVerified": true,
    "verified": true
  },
  "budget": {
    "beforeBaseUnits": "2000000",
    "paidBaseUnits": "100000",
    "afterBaseUnits": "1900000",
    "unusedAtRevocationBaseUnits": "1900000"
  },
  "railStatus": "revoked",
  "postRevokeResult": "payment authority unavailable; resource remains locked"
}
```

The standalone command prints the disposable addresses and all registration, wallet-link, payment, and revocation signatures from that run. Those signatures belong to the isolated Surfpool ledger, so they are reproducibility evidence rather than public Explorer transactions.

## Registry integration boundary

- `8004-solana` 0.8.2 is used for the current ERC-8004 Solana Agent Registry API.
- The SDK's legacy `@solana/web3.js` key and public-key types stay inside `packages/agent-registry`.
- The rest of BudgetRail remains Kit-first.
- The registered metadata URI points to `public/.well-known/agent.json` in the public repository.
- The operational-wallet link is not trusted blindly: the adapter loads the agent from chain and compares the returned owner and wallet before marking the identity verified.

## Operator surface

The console exposes:

- full actor context with copyable addresses;
- a visible linked-wallet badge;
- cap, spent amount, unused authority, and live/revoked state;
- human-readable control, allowed, and denied decisions;
- custom-RPC Solana Explorer links for every local receipt;
- a protected result after successful settlement;
- two-step revocation feedback and a signature-free post-revoke denial;
- loading, error/retry, and reset states.

The complete workflow was inspected at 375 px, 768 px, and 1280 px. There was no horizontal overflow, no visible interactive target below 40 px in either dimension, no clickable `div`, and no browser console warning or error.

## Security properties

- Registration ownership and wallet linkage are verified from on-chain state.
- The registered wallet must equal the deterministic x402 payment signer.
- The LLM never selects transaction-critical payment fields.
- Revocation closes the delegation account and preserves a readable record of the unused authority.
- A post-revoke attempt produces no payment signature and no protected resource.
- Reset stops the prior disposable Surfpool instance before creating a fresh isolated rail.

## Automated coverage

- Registry unit tests cover successful registration, a mismatched operational wallet, and a failed registration.
- Existing deterministic and Surfpool suites continue to cover the allowance and x402 payment primitives.
- The standalone Phase 4 proof independently executes identity registration, wallet binding, settlement, revocation, and post-revocation denial.
- TypeScript, ESLint, Prettier, the production Next.js build, and the complete test suite pass at this checkpoint.
