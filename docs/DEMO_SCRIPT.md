# BudgetRail 75-second demo script

Record at 1080p with the browser at the live HTTPS URL. Keep the Explorer links visible and do not cut across a loading state.

| Time   | Action                                                    | Narration                                                                                                                                                   |
| ------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–8s   | Show the top status and verified identity/wallet.         | “BudgetRail gives an AI agent a fixed, expiring, instantly revocable USDC rail on Solana.”                                                                  |
| 8–18s  | Show the 2.00 USDC cap and policy constraints.            | “The model never chooses payment fields. Network, mint, merchant, amount, fee payer, and timeout are deterministic.”                                        |
| 18–34s | Click **Pay 0.10 USDC** and open the receipt.             | “The merchant returns HTTP 402; the agent validates it, signs a native delegated transfer, and unlocks the resource. Remaining authority is now 1.90 USDC.” |
| 34–46s | Click **Challenge 3.00 USDC**.                            | “A request above the owner’s cap is rejected before signing, with balances unchanged.”                                                                      |
| 46–59s | Use **Revoke now**, confirm, and open the revoke receipt. | “The owner’s kill switch closes the delegation on Solana.”                                                                                                  |
| 59–70s | Click the post-revoke proof.                              | “The next payment is denied and the protected resource stays locked.”                                                                                       |
| 70–75s | Show Activity and the GitHub link.                        | “One console proves identity, payment, over-limit denial, and revocation with reproducible open-source evidence.”                                           |

Before recording, run Reset once, wait for the identity and rail to be ready, hide unrelated tabs/notifications, and verify the full flow once without recording.
