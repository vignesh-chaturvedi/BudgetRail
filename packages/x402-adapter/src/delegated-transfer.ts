import { address, type Address, type TransactionSigner } from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  findFixedDelegationPda,
  findSubscriptionAuthorityPda,
  getTransferFixedInstruction,
} from "@solana/subscriptions";
import type { PaymentRequirements } from "@x402/core/types";

export interface BuildDelegatedPaymentInput {
  requirement: PaymentRequirements;
  delegator: Address;
  delegatee: TransactionSigner;
  delegationNonce: bigint;
}

/**
 * Converts a validated x402 requirement into the native Subscriptions
 * Program transfer instruction. The facilitator can verify the resulting
 * TransferChecked CPI through x402's smart-wallet simulation path.
 */
export async function buildDelegatedPaymentInstruction({
  requirement,
  delegator,
  delegatee,
  delegationNonce,
}: BuildDelegatedPaymentInput) {
  if (requirement.scheme !== "exact") {
    throw new Error("Delegated payment construction requires the exact scheme");
  }

  const tokenMint = address(requirement.asset);
  const receiverOwner = address(requirement.payTo);
  const amount = BigInt(requirement.amount);

  const [subscriptionAuthority] = await findSubscriptionAuthorityPda({
    user: delegator,
    tokenMint,
  });
  const [delegationPda] = await findFixedDelegationPda({
    subscriptionAuthority,
    delegator,
    delegatee: delegatee.address,
    nonce: delegationNonce,
  });
  const [delegatorAta] = await findAssociatedTokenPda({
    owner: delegator,
    mint: tokenMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [receiverAta] = await findAssociatedTokenPda({
    owner: receiverOwner,
    mint: tokenMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const instruction = getTransferFixedInstruction({
    delegationPda,
    subscriptionAuthority,
    delegatorAta,
    receiverAta,
    tokenMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
    delegatee,
    transferData: {
      amount,
      delegator,
      mint: tokenMint,
    },
  });

  return {
    instruction,
    amount,
    tokenMint,
    receiverOwner,
    receiverAta,
    delegatorAta,
    subscriptionAuthority,
    delegationPda,
  };
}
