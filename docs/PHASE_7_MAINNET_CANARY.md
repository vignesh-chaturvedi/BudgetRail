# BudgetRail Phase 7 mainnet canary

This runbook proves BudgetRail's core payment rail with a deliberately tiny amount of real mainnet USDC. It does not unlock mainnet writes in the hosted application and is not a production deployment.

## Fixed scope

| Control                     | Pinned value                                              |
| --------------------------- | --------------------------------------------------------- |
| Network                     | Solana mainnet, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Full genesis hash           | `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`            |
| Subscriptions Program       | `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`            |
| Canonical USDC              | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`            |
| Owner funding               | exactly 0.20 USDC                                         |
| Valid payment               | exactly 0.10 USDC                                         |
| Rejected request            | 0.30 USDC                                                 |
| Delegation expiry           | 15 minutes                                                |
| Minimum facilitator funding | 0.01 SOL                                                  |
| Maximum combined canary SOL | 0.05 SOL                                                  |

The full genesis hash identifies the RPC cluster. The shorter value in the CAIP-2 network identifier is intentional and must not be replaced with the full hash.

## Safety model

- Four new disposable keypairs are generated for owner, agent, facilitator, and merchant. Devnet or personal wallets are never used as canary signers.
- Keypairs and authenticated RPC URLs stay outside the repository with owner-only filesystem permissions.
- The public Solana RPC is accepted only by the read-only `inspect` action. Preflight and write actions require a private mainnet provider.
- `run`, `contain`, `finalize`, and `sweep` require both `--execute` and the exact acknowledgement `BUDGETRAIL_MAINNET_CANARY_0.20_USDC`.
- Preflight requires a clean committed Git tree, the exact owner USDC balance, bounded SOL, fresh accounts, the pinned program, and canonical mint.
- Every submitted transaction must reach `finalized`; signatures and finalized slots are written immediately to external evidence.
- The canary revokes the delegation, proves a formerly valid payment now fails, closes the Subscription Authority, and verifies that the token delegate is cleared.
- If the run aborts after delegation creation, the CLI attempts an emergency revoke before returning the error; durable evidence then supports guarded, resumable `contain` and `finalize` actions.
- The recovery sweep is a distinct, explicitly approved action that also closes the disposable USDC accounts and returns their rent.

## External storage

The default run ID is UTC-date based, for example `BR-MN-20260810-001`.

```text
~/.config/budgetrail/mainnet-canary/<run-id>/
  owner.json
  agent.json
  facilitator.json
  merchant.json
  runtime.env              # created manually; never committed

../BudgetRail-mainnet-evidence/<run-id>/
  state.json               # machine-readable journal
  report.md                # sanitized public report source
```

Both directories must remain outside `BudgetRail/`. The final sanitized report may be copied into the repository only after secret scanning and manual review.

## Commands

Run all commands from the repository root. Never put an RPC URL or private key on the command line.

```bash
# Read-only and safe with the public endpoint.
BUDGETRAIL_MAINNET_RPC_URL=https://api.mainnet-beta.solana.com \
BUDGETRAIL_MAINNET_RPC_PROVIDER=Solana-public-readonly \
BUDGETRAIL_CANARY_ALLOW_PUBLIC_READONLY=true \
pnpm phase7:canary inspect

# Creates protected disposable key files outside the repository.
BUDGETRAIL_CANARY_RUN_ID=BR-MN-20260810-001 \
pnpm phase7:canary keys
```

Create the protected external `runtime.env` yourself and insert the private RPC endpoint locally:

```bash
export BUDGETRAIL_CANARY_RUN_ID=BR-MN-20260810-001
export BUDGETRAIL_MAINNET_RPC_PROVIDER=Helius
export BUDGETRAIL_MAINNET_RPC_URL='https://mainnet.helius-rpc.com/?api-key=REPLACE_LOCALLY'
```

Then load the variables in the current shell and run the non-writing preflight:

```bash
pnpm phase7:canary addresses
pnpm phase7:canary preflight
```

Only after preflight passes and the exact transaction plan is approved:

```bash
export BUDGETRAIL_CANARY_ACK=BUDGETRAIL_MAINNET_CANARY_0.20_USDC
pnpm phase7:canary run --execute
pnpm phase7:canary verify
```

If the journal records an active delegation after a failed revoke, do not replay
`run`. Inspect the recorded signatures, then use the same protected signers and
explicit guard to resume cleanup:

```bash
pnpm phase7:canary contain --execute
pnpm phase7:canary finalize --execute
pnpm phase7:canary verify
```

After independently confirming the intended recovery address:

```bash
export BUDGETRAIL_CANARY_RECOVERY_ADDRESS='<CONFIRMED_MAINNET_WALLET>'
pnpm phase7:canary sweep --execute
pnpm phase7:canary report
```

## Expected transaction sequence

1. `setup`: create the merchant USDC account if needed and initialize the owner's Subscription Authority.
2. `delegation`: create a fixed 0.20 USDC delegation to the disposable agent.
3. `payment`: settle exactly 0.10 USDC through the restricted x402 facilitator.
4. No transaction: reject 0.30 USDC in deterministic policy and native simulation; token balances remain unchanged.
5. `revoke`: close the fixed delegation.
6. No transaction: reject the formerly valid 0.10 USDC payment after revocation; balances remain unchanged.
7. `closeAuthority`: close the Subscription Authority.
8. `clearTokenDelegate`, when required: explicitly remove any stale SPL token delegate with the disposable owner signer.
9. Sweep transactions: return the remaining owner and merchant USDC, close both disposable token accounts to recover rent, and return the exact post-fee SOL balance to the confirmed recovery wallet.

The exact number of sweep transactions depends on which balances remain. Negative tests intentionally have no transaction signature because rejection occurs before settlement.

## Pass criteria

The result is successful only when all of the following are true:

- every positive transaction is finalized and linked in the evidence report;
- the owner decreases and merchant increases by exactly 100,000 base units;
- the fixed delegation decreases from 200,000 to 100,000 base units;
- both over-budget enforcement layers reject 300,000 base units without changing balances;
- the finalized revoke closes the delegation;
- native simulation rejects 100,000 base units after revocation without changing balances;
- the Subscription Authority is closed and the owner's token delegate is empty;
- independent verification reproduces the terminal state;
- the sweep closes both disposable USDC accounts and leaves all four disposable wallets with zero USDC and zero SOL.

## Failure response

Do not rerun `run` with the same run ID after any transaction was submitted. First inspect `state.json` and every recorded Explorer link. If an active delegation remains, use `contain --execute` with the original disposable owner and facilitator signers, then `finalize --execute`. The current mainnet program requires the pinned facilitator `receiver` trailing account on revoke and authority-close instructions even though the installed SDK marks it optional. Preserve the evidence even when aborted. Sweep only after the terminal account state is known and the explicit SPL token-delegate check passes.

## Repository evidence after completion

Run `BR-MN-20260810-001` completed this procedure successfully. Its reviewed public record is [`PHASE_7_MAINNET_EVIDENCE.md`](./PHASE_7_MAINNET_EVIDENCE.md) with a companion [`PHASE_7_MAINNET_REPORT.html`](./PHASE_7_MAINNET_REPORT.html). Never copy `state.json`, keypair files, `runtime.env`, RPC URLs, or API keys into Git.
