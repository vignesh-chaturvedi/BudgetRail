import { describe, expect, it } from "vitest";
import { generateKeyPairSigner } from "@solana/kit";
import {
  parseSubscriptionsInstruction,
  SUBSCRIPTIONS_PROGRAM_ADDRESS,
  SubscriptionsInstruction,
} from "@solana/subscriptions";
import type { PaymentRequirements } from "@x402/core/types";
import {
  BUDGETRAIL_FACILITATOR_OPTIONS,
  SOLANA_DEVNET_CAIP2,
  buildDelegatedPaymentInstruction,
} from "../src";

describe("delegated x402 transfer compatibility", () => {
  it("maps an x402 exact requirement to transferFixed", async () => {
    const delegator = await generateKeyPairSigner();
    const delegatee = await generateKeyPairSigner();
    const merchant = await generateKeyPairSigner();
    const mint = await generateKeyPairSigner();
    const requirement: PaymentRequirements = {
      scheme: "exact",
      network: SOLANA_DEVNET_CAIP2,
      asset: mint.address,
      amount: "100000",
      payTo: merchant.address,
      maxTimeoutSeconds: 60,
      extra: {},
    };

    const result = await buildDelegatedPaymentInstruction({
      requirement,
      delegator: delegator.address,
      delegatee,
      delegationNonce: 7n,
    });
    const parsed = parseSubscriptionsInstruction(result.instruction);

    expect(result.instruction.programAddress).toBe(
      SUBSCRIPTIONS_PROGRAM_ADDRESS
    );
    expect(parsed.instructionType).toBe(SubscriptionsInstruction.TransferFixed);
    if (parsed.instructionType !== SubscriptionsInstruction.TransferFixed) {
      throw new Error("Expected a TransferFixed instruction");
    }
    expect(parsed.data.transferData.amount).toBe(100_000n);
    expect(parsed.data.transferData.delegator).toBe(delegator.address);
    expect(parsed.data.transferData.mint).toBe(mint.address);
  });

  it("allow-lists only the subscriptions program for simulation verification", () => {
    expect(BUDGETRAIL_FACILITATOR_OPTIONS).toEqual({
      enableSmartWalletVerification: true,
      smartWalletMaxComputeUnits: 400_000,
      smartWalletMaxPriorityFeeMicroLamports: 50_000,
      smartWalletAllowedPrograms: [SUBSCRIPTIONS_PROGRAM_ADDRESS],
    });
  });
});
