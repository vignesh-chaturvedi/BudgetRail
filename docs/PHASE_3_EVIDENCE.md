# Phase 3 evidence — autonomous x402 payment loop

Recorded on 2026-08-03.

## Exit gate

**Passed:** a deterministic agent requested a protected resource, received an x402 v2 challenge, validated every transaction-critical field, paid exactly 0.10 USDC through a fixed native delegation, retried the same resource, and unlocked a structured spend-safety brief.

The proof runs on an isolated Surfpool fork of Solana devnet with disposable in-memory signers. It also verifies that:

1. the allowance falls from 2.00 to 1.90 USDC;
2. the merchant receives exactly 100,000 six-decimal base units;
3. fulfillment includes the x402 `PAYMENT-RESPONSE` settlement receipt;
4. replaying the same challenge and signed payload returns HTTP 409;
5. the facilitator settles only once.

## Reproduce

```bash
pnpm phase3:local
```

To inspect the streamed browser flow:

```bash
pnpm dev
```

Open `http://localhost:3000` and select **Run autonomous purchase**.

## Recorded output

```json
{
  "status": "phase-3-autonomous-payment-proof-complete",
  "execution": "isolated-surfpool-devnet-fork",
  "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  "addresses": {
    "owner": "DhnoADKRX6HSH3r7skM594yTpi5gsmFevL3MsHCxkYWF",
    "agent": "AaTPSkr263D6W9eVMNw8cab5YVAstRHh73WFxK1SwU2f",
    "merchant": "2X4FdUTtxzMEcsKYDrJXjtuZRioDo7M12rMMBhFwyeiJ",
    "facilitator": "4vZ7WQU4eetA51DLezFb4vCroiZGuAvy8QEDquDBZBCK",
    "mint": "DcaMz4W2hkhaGVWtbTRAe2mQTKCaM31SEvm2AAkjXykK",
    "delegation": "AwdLNMHDnVAKncYPSBiSm7dGiJy1hcugS9RDDx89edR7"
  },
  "allowance": {
    "capBaseUnits": "2000000",
    "beforeBaseUnits": "2000000",
    "paidBaseUnits": "100000",
    "afterBaseUnits": "1900000"
  },
  "transaction": "4HYhPJL6YNHtPRMX4ZrXCcoTcPdZEnV2nY19P6NqPaHbvzqeoFWe7RhMepUoDmnMKuJ8dkzbgjEo8jdq6EHW8xS1",
  "artifact": {
    "kind": "budgetrail.spend-safety-brief",
    "title": "Autonomous payment safety brief",
    "findings": [
      "Requirements were immutable",
      "Settlement was replay-safe",
      "Fulfillment is evidence-bound"
    ]
  },
  "replay": {
    "status": 409,
    "error": "PAYMENT_REPLAYED"
  }
}
```

The signature belongs to the isolated Surfpool ledger and is reproducibility evidence, not a public Explorer transaction.

## Security properties

- The agent, not an LLM, selects the requirement and constructs the transaction.
- Origin, scheme, network, mint, recipient, fee payer, amount, and timeout are allow-listed before signing.
- The merchant compares the signed requirements byte-for-byte at the data-model level with its stored one-time challenge.
- Challenge reservation happens before facilitator I/O, preventing concurrent double settlement.
- A transport failure after settlement starts leaves the challenge consumed because the on-chain outcome may be unknown.
- Protected data is released only after facilitator verification and successful settlement.

## Browser surface

The dashboard streams request, challenge, validation, signing, retry, settlement, and unlock stages from the real server-side run. It exposes idle, progressive loading, success, and retryable failure states, and labels local signatures accurately.

The completed flow was inspected at 375 px, 768 px, and 1280 px. There was no horizontal overflow, no button below 40 px in either dimension, no unlabeled button, and no browser console warning or error.

## Automated coverage

- 43 deterministic tests cover allowance modeling, persistence, error mapping, instruction construction, strict payment policy, one-time merchant challenges, concurrent reservation, stale challenges, facilitator recovery, and replay rejection.
- Two Surfpool tests exercise the local RPC and native allowance control plane.
- The standalone Phase 3 proof independently executes the full paid HTTP loop against a real facilitator and native delegation.
- All 45 tests, TypeScript, ESLint, Prettier, and the production Next.js build pass.
