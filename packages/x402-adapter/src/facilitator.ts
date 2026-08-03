import { SUBSCRIPTIONS_PROGRAM_ADDRESS } from "@solana/subscriptions";
import type { ExactSvmScheme } from "@x402/svm/exact/facilitator";

type ExactSvmSchemeOptions = NonNullable<
  ConstructorParameters<typeof ExactSvmScheme>[2]
>;

/**
 * x402 v2.20 adds simulation-based verification for program-mediated SVM
 * payments. Restrict that path to Solana's Subscriptions program so the
 * facilitator accepts BudgetRail transfers without trusting arbitrary CPI.
 */
export const BUDGETRAIL_FACILITATOR_OPTIONS = {
  enableSmartWalletVerification: true,
  smartWalletMaxComputeUnits: 400_000,
  smartWalletMaxPriorityFeeMicroLamports: 50_000,
  smartWalletAllowedPrograms: [SUBSCRIPTIONS_PROGRAM_ADDRESS],
} satisfies ExactSvmSchemeOptions;
