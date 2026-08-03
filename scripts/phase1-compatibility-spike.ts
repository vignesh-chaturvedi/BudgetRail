import { generateKeyPairSigner } from "@solana/kit";
import {
  parseSubscriptionsInstruction,
  SUBSCRIPTIONS_PROGRAM_ADDRESS,
  SubscriptionsInstruction,
} from "@solana/subscriptions";
import type { PaymentRequired } from "@x402/core/types";
import {
  BUDGETRAIL_FACILITATOR_OPTIONS,
  SOLANA_DEVNET_CAIP2,
  buildDelegatedPaymentInstruction,
  selectBudgetRailRequirement,
} from "../packages/x402-adapter/src";

async function main() {
  const delegator = await generateKeyPairSigner();
  const delegatee = await generateKeyPairSigner();
  const merchant = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();
  const facilitator = await generateKeyPairSigner();

  const paymentRequired: PaymentRequired = {
    x402Version: 2,
    resource: {
      url: "https://merchant.budgetrail.test/api/research",
      description: "Signed research brief",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: mint.address,
        amount: "100000",
        payTo: merchant.address,
        maxTimeoutSeconds: 60,
        extra: { feePayer: facilitator.address },
      },
    ],
  };

  const requirement = selectBudgetRailRequirement(paymentRequired, {
    network: SOLANA_DEVNET_CAIP2,
    asset: mint.address,
    payTo: merchant.address,
    maxAmount: 100_000n,
    maxTimeoutSeconds: 120,
    allowedResourceOrigins: ["https://merchant.budgetrail.test"],
    allowedFeePayers: [facilitator.address],
  });

  const transfer = await buildDelegatedPaymentInstruction({
    requirement,
    delegator: delegator.address,
    delegatee,
    delegationNonce: 1n,
  });
  const parsed = parseSubscriptionsInstruction(transfer.instruction);

  if (parsed.instructionType !== SubscriptionsInstruction.TransferFixed) {
    throw new Error("Compatibility spike did not produce transferFixed");
  }

  console.log(
    JSON.stringify(
      {
        status: "compatible",
        x402: {
          version: paymentRequired.x402Version,
          scheme: requirement.scheme,
          network: requirement.network,
          amount: requirement.amount,
        },
        delegatedTransfer: {
          program: SUBSCRIPTIONS_PROGRAM_ADDRESS,
          instruction: "transferFixed",
          amount: parsed.data.transferData.amount.toString(),
          delegationPda: transfer.delegationPda,
          receiverAta: transfer.receiverAta,
        },
        facilitator: BUDGETRAIL_FACILITATOR_OPTIONS,
      },
      null,
      2
    )
  );
}

void main();
