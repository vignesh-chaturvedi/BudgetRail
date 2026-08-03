import type { Address } from "@solana/kit";
import {
  findFixedDelegationPda,
  findSubscriptionAuthorityPda,
} from "@solana/subscriptions";
import type { ClusterMoniker } from "../solana-client";
import type { SubscriptionsClient } from "../subscriptions-client";
import { getAtaAddress } from "../subscriptions/pdas";
import { TOKEN_PROGRAM_ADDRESS } from "../subscriptions/constants";
import { AllowanceActionError } from "./errors";
import {
  createDelegationNonce,
  isSupportedAllowanceCluster,
  type AllowanceDraft,
  type AllowanceRecord,
  type SupportedAllowanceCluster,
} from "./model";

export const MINIMUM_SETUP_LAMPORTS = 10_000_000n;

export type CreateAllowanceResult = {
  address: Address;
  setupSignature?: string;
  createSignature: string;
  record: AllowanceRecord;
};

export type RevokeAllowanceResult = {
  alreadyRevoked: boolean;
  revokeSignature?: string;
};

export type CreateAllowanceStage =
  "checking" | "setup" | "creating" | "confirmed";

export async function createFixedAllowance({
  client,
  cluster,
  owner,
  mint,
  draft,
  now = new Date(),
  nonce = createDelegationNonce(now.getTime()),
  onStage,
}: {
  client: SubscriptionsClient;
  cluster: ClusterMoniker;
  owner: Address;
  mint: Address;
  draft: AllowanceDraft;
  now?: Date;
  nonce?: bigint;
  onStage?: (stage: CreateAllowanceStage) => void;
}): Promise<CreateAllowanceResult> {
  assertSupportedCluster(cluster);
  onStage?.("checking");

  const ownerSol = await client.rpc.getBalance(owner).send();
  if (ownerSol.value < MINIMUM_SETUP_LAMPORTS) {
    throw new Error("Insufficient funds for rent and transaction fees.");
  }

  const userAta = await getAtaAddress(owner, mint);
  const [ataAccount, authorityState] = await Promise.all([
    client.rpc.getAccountInfo(userAta, { encoding: "base64" }).send(),
    client.subscriptions.queries.isSubscriptionAuthorityInitialized(
      owner,
      mint
    ),
  ]);

  const balance = ataAccount.value
    ? BigInt(
        (await client.rpc.getTokenAccountBalance(userAta).send()).value.amount
      )
    : 0n;
  if (balance < draft.capBaseUnits) {
    throw new AllowanceActionError(
      "insufficient-usdc",
      `This wallet has ${balance} USDC base units but the allowance needs ${draft.capBaseUnits}. Fund it with devnet USDC and retry.`
    );
  }

  let setupSignature: string | undefined;
  if (!ataAccount.value || !authorityState.initialized) {
    onStage?.("setup");
    const setupInstructions = [];
    if (!ataAccount.value) {
      setupInstructions.push(
        await client.associatedToken.instructions.createAssociatedTokenIdempotent(
          {
            owner,
            mint,
            tokenProgram: TOKEN_PROGRAM_ADDRESS,
          }
        )
      );
    }
    if (!authorityState.initialized) {
      setupInstructions.push(
        await client.subscriptions.instructions.initSubscriptionAuthority({
          tokenMint: mint,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
          userAta,
        })
      );
    }

    const setup = await client.sendTransaction(setupInstructions);
    setupSignature = setup.context.signature;
  }

  const subscriptionAuthority = authorityState.initialized
    ? authorityState.pda
    : (
        await findSubscriptionAuthorityPda({
          tokenMint: mint,
          user: owner,
        })
      )[0];

  onStage?.("creating");
  const create = await client.subscriptions.instructions
    .createFixedDelegation({
      amount: draft.capBaseUnits,
      delegatee: draft.delegatee,
      expiryTs: draft.expiryTs,
      nonce,
      tokenMint: mint,
    })
    .sendTransaction();

  const [delegationAddress] = await findFixedDelegationPda({
    subscriptionAuthority,
    delegator: owner,
    delegatee: draft.delegatee,
    nonce,
  });
  const createSignature = create.context.signature;
  const createdAt = now.toISOString();
  onStage?.("confirmed");

  return {
    address: delegationAddress,
    setupSignature,
    createSignature,
    record: {
      version: 1,
      cluster,
      address: delegationAddress,
      owner,
      delegatee: draft.delegatee,
      mint,
      nonce: nonce.toString(),
      capBaseUnits: draft.capBaseUnits.toString(),
      expiryTs: draft.expiryTs.toString(),
      createdAt,
      createSignature,
    },
  };
}

export async function revokeFixedAllowance({
  client,
  cluster,
  delegationAddress,
}: {
  client: SubscriptionsClient;
  cluster: ClusterMoniker;
  delegationAddress: Address;
}): Promise<RevokeAllowanceResult> {
  assertSupportedCluster(cluster);

  const account = await client.rpc
    .getAccountInfo(delegationAddress, { encoding: "base64" })
    .send();
  if (!account.value) return { alreadyRevoked: true };

  const result = await client.subscriptions.instructions
    .revokeDelegation({ delegationAccount: delegationAddress })
    .sendTransaction();

  return {
    alreadyRevoked: false,
    revokeSignature: result.context.signature,
  };
}

function assertSupportedCluster(
  cluster: ClusterMoniker
): asserts cluster is SupportedAllowanceCluster {
  if (!isSupportedAllowanceCluster(cluster)) {
    throw new AllowanceActionError(
      "wrong-cluster",
      "BudgetRail Phase 2 only creates or revokes allowances on devnet and localnet."
    );
  }
}
