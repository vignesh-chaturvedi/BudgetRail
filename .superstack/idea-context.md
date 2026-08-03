# Idea Context

> Copied from the grant-planning workspace on 2026-08-03. Treat this as the product brief.

## Chosen Idea

| Field           | Value                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Slug            | budgetrail                                                                                                            |
| Name            | BudgetRail                                                                                                            |
| One-liner       | Capped, expiring and instantly revocable USDC allowances for autonomous x402 payments on Solana                       |
| Why crypto      | Onchain allowance enforcement and receipts let agents spend autonomously without receiving unrestricted wallet access |
| Target deadline | 2026-08-17 (Asia/Kolkata)                                                                                             |

### MVP Checklist

- [ ] Create and inspect a capped USDC allowance
- [ ] Register the demo agent and complete one paid x402 request
- [ ] Reject an over-limit payment onchain
- [ ] Revoke the allowance and prove the next payment fails
- [ ] Display remaining budget and explorer-linked receipts

## Landscape

| Field              | Value                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Crowdedness        | crowded broad market; low direct semantic overlap                                                                                |
| Crowdedness score  | 260 projects in the closest result's cluster                                                                                     |
| Closest similarity | 5.33%                                                                                                                            |
| Moat type          | enforceable policy primitive + developer integration                                                                             |
| Differentiation    | Combines USDC caps, expiry, instant revocation, registered-agent identity and real x402 payments in one deterministic proof loop |

## Positioning

Lead with verifiable financial-control infrastructure and deterministic onchain failure proofs. AI agents are the concrete user and demo, not a generic AI wrapper.
