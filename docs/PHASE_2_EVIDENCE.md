# Phase 2 evidence — allowance control plane

Recorded on 2026-08-03.

## Exit gate

**Passed:** create → inspect → revoke works with disposable wallets and a fresh six-decimal mint on an isolated Surfpool fork of Solana devnet.

The proof uses the real native Subscriptions Program fetched from devnet, while all accounts, balances, and transactions remain isolated and disposable. It verifies that:

1. the owner creates a fixed 2 USDC allowance for one agent;
2. the chain query returns the correct amount, expiry, mint, and delegation PDA;
3. revocation removes the fixed allowance from the owner's active delegations;
4. repeating revocation is safe and reports `alreadyRevoked` rather than failing.

## Reproduce

```bash
pnpm phase2:local
```

## Recorded output

```json
{
  "network": "isolated Surfpool fork of Solana devnet",
  "owner": "FLzq8moYbSHigJYESmykTaqmnh9N8uhWU5JBftSU7ob4",
  "agent": "N9uiSwCBipPuy5mAMLPnNEFWEHe59ScwHjuJorXqtst",
  "mint": "DbBg4dkTfFT9Kwup19CBwntB86DJ75sPojXf3fuMsJHC",
  "allowance": "GT5ku5wXkQMiRFKR5H53eYzWX22himvtCUMoQDEds9bh",
  "createSignature": "Qw9HLNyKTDTHEVoJwU5T1zWWg9YQsJogwV6cyYTSJ9bwLhTLXfppFZTzLKCPD5Vf37aBvzcH7KKaUemKvncTvXa",
  "inspected": {
    "amountBaseUnits": "2000000",
    "expiryTs": "2000000000",
    "mint": "DbBg4dkTfFT9Kwup19CBwntB86DJ75sPojXf3fuMsJHC"
  },
  "revokeSignature": "4kGSujzp9gGBEhcimdrfdDWJmbP3WFzDnTsGDV87yCijprS6sxkMfBXyoz7tMMaJSHX1rvjAXxAUY9xhJqgxCirZ",
  "activeFixedAllowancesAfterRevoke": 0,
  "secondRevokeWasIdempotent": true
}
```

These signatures belong to the isolated Surfpool ledger and are reproducibility evidence, not public Explorer transactions.

## Automated coverage

- 26 deterministic tests cover six-decimal amount parsing/formatting, expiry validation, cap/spent/remaining derivation, lifecycle states, local metadata validation, and actionable error classification.
- The Surfpool integration test independently executes the full create → query → revoke → query → repeat-revoke path.
- TypeScript, ESLint, Prettier, and the production Next.js build are required checks.

## Browser review

The disconnected owner journey was inspected at 375 px, 768 px, and 1280 px widths. The reviewed page had no browser console warnings or errors. Transaction forms and connected allowance cards are backed by the same tested pure model and native action functions.
