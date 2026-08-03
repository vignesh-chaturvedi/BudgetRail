import {
  getSetComputeUnitLimitInstruction,
  setTransactionMessageComputeUnitPrice,
} from "@solana-program/compute-budget";
import {
  address,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  prependTransactionMessageInstruction,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type TransactionSigner,
} from "@solana/kit";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  createRpcClient,
  MEMO_PROGRAM_ADDRESS,
  resolveBlockhash,
} from "@x402/svm";
import {
  buildDelegatedPaymentInstruction,
  type BuildDelegatedPaymentInput,
} from "./delegated-transfer";

const PAYMENT_COMPUTE_UNIT_LIMIT = 300_000;
const PAYMENT_COMPUTE_UNIT_PRICE_MICROLAMPORTS = 1;

export interface BuildDelegatedPaymentPayloadInput extends Omit<
  BuildDelegatedPaymentInput,
  "delegatee"
> {
  delegatee: TransactionSigner;
  memo?: string;
  rpcUrl?: string;
}

/**
 * Builds the x402 v2 payload that the buyer sends in PAYMENT-SIGNATURE.
 * The delegatee signs transferFixed; the facilitator fee-payer signature is
 * deliberately left empty for the facilitator to add during settlement.
 */
export async function buildDelegatedPaymentPayload({
  requirement,
  delegator,
  delegatee,
  delegationNonce,
  memo = crypto.randomUUID().replaceAll("-", ""),
  rpcUrl,
}: BuildDelegatedPaymentPayloadInput): Promise<{
  paymentPayload: PaymentPayload;
  transaction: string;
}> {
  const feePayer = requirement.extra.feePayer;
  if (typeof feePayer !== "string") {
    throw new Error("x402 SVM requirements must include extra.feePayer");
  }

  const transfer = await buildDelegatedPaymentInstruction({
    requirement,
    delegator,
    delegatee,
    delegationNonce,
  });
  const rpc = createRpcClient(requirement.network, rpcUrl);
  const lifetime = await resolveBlockhash(rpc, requirement);
  const memoInstruction = {
    programAddress: address(MEMO_PROGRAM_ADDRESS),
    accounts: [],
    data: new TextEncoder().encode(memo),
  };

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (transactionMessage) =>
      setTransactionMessageComputeUnitPrice(
        PAYMENT_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
        transactionMessage
      ),
    (transactionMessage) =>
      setTransactionMessageFeePayer(address(feePayer), transactionMessage),
    (transactionMessage) =>
      prependTransactionMessageInstruction(
        getSetComputeUnitLimitInstruction({
          units: PAYMENT_COMPUTE_UNIT_LIMIT,
        }),
        transactionMessage
      ),
    (transactionMessage) =>
      appendTransactionMessageInstructions(
        [transfer.instruction, memoInstruction],
        transactionMessage
      ),
    (transactionMessage) =>
      setTransactionMessageLifetimeUsingBlockhash(lifetime, transactionMessage)
  );
  const partiallySigned =
    await partiallySignTransactionMessageWithSigners(message);
  const transaction = getBase64EncodedWireTransaction(partiallySigned);

  return {
    transaction,
    paymentPayload: {
      x402Version: 2,
      accepted: requirement,
      payload: { transaction },
    },
  };
}

export function hasFacilitatorFeePayer(
  requirement: PaymentRequirements
): requirement is PaymentRequirements & {
  extra: { feePayer: string } & Record<string, unknown>;
} {
  return typeof requirement.extra.feePayer === "string";
}
