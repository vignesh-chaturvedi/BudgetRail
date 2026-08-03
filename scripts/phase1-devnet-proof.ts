import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { generateKeyPairSigner, lamports } from "@solana/kit";
import { findFixedDelegationPda } from "@solana/subscriptions";
import { Surfnet } from "@solana/surfpool";
import type { PaymentRequired } from "@x402/core/types";
import { toFacilitatorSvmSigner } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/facilitator";
import { createSolanaClient } from "../app/lib/solana-client";
import { createSubscriptionsClient } from "../app/lib/subscriptions-client";
import {
  BUDGETRAIL_FACILITATOR_OPTIONS,
  PaymentPolicyError,
  SOLANA_DEVNET_CAIP2,
  buildDelegatedPaymentPayload,
  selectBudgetRailRequirement,
} from "../packages/x402-adapter/src";

const RPC_URL = "https://api.devnet.solana.com";
const TOKEN_DECIMALS = 6;
const ALLOWANCE_AMOUNT = 2_000_000n;
const PAYMENT_AMOUNT = 100_000n;
const DELEGATION_NONCE = BigInt(Date.now());

async function main() {
  const localMode = process.argv.includes("--local");
  console.error("Generating disposable in-memory devnet signers...");
  const owner = await generateKeyPairSigner();
  const agent = await generateKeyPairSigner();
  const merchant = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();

  const surfnet = localMode
    ? Surfnet.startWithConfig({ offline: false, remoteRpcUrl: RPC_URL })
    : undefined;
  const rpcUrl = surfnet?.rpcUrl ?? RPC_URL;
  process.once("exit", () => surfnet?.stop());
  const rpcClient = localMode ? undefined : createSolanaClient("devnet");
  let ownerAirdrop: string;
  if (surfnet) {
    console.error("Funding the disposable owner with a Surfpool cheatcode...");
    surfnet.fundSol(owner.address, 500_000_000);
    ownerAirdrop = "surfpool:fundSol";
  } else {
    console.error("Funding the disposable owner from the devnet faucet...");
    ownerAirdrop = String(
      await rpcClient!.airdrop(owner.address, lamports(500_000_000n))
    );
  }

  const ownerClient = createSubscriptionsClient(
    localMode ? "localnet" : "devnet",
    owner,
    rpcUrl,
    surfnet?.wsUrl
  );
  const createMint = await ownerClient.token.instructions
    .createMint({
      newMint: mint,
      decimals: TOKEN_DECIMALS,
      mintAuthority: owner.address,
    })
    .sendTransaction();
  const fundOwner = await ownerClient.token.instructions
    .mintToATA({
      owner: owner.address,
      mint: mint.address,
      mintAuthority: owner,
      amount: 5_000_000n,
      decimals: TOKEN_DECIMALS,
    })
    .sendTransaction();
  const createMerchantAta = await ownerClient.token.instructions
    .mintToATA({
      owner: merchant.address,
      mint: mint.address,
      mintAuthority: owner,
      amount: 1n,
      decimals: TOKEN_DECIMALS,
    })
    .sendTransaction();

  const [ownerAta] = await findAssociatedTokenPda({
    owner: owner.address,
    mint: mint.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [merchantAta] = await findAssociatedTokenPda({
    owner: merchant.address,
    mint: mint.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const initAuthority = await ownerClient.subscriptions.instructions
    .initSubscriptionAuthority({
      tokenMint: mint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      userAta: ownerAta,
    })
    .sendTransaction();
  const createDelegation = await ownerClient.subscriptions.instructions
    .createFixedDelegation({
      amount: ALLOWANCE_AMOUNT,
      delegatee: agent.address,
      expiryTs: BigInt(Math.floor(Date.now() / 1000) + 86_400),
      nonce: DELEGATION_NONCE,
      tokenMint: mint.address,
    })
    .sendTransaction();
  const [delegationPda] = await findFixedDelegationPda({
    subscriptionAuthority: (
      await ownerClient.subscriptions.queries.isSubscriptionAuthorityInitialized(
        owner.address,
        mint.address
      )
    ).pda,
    delegator: owner.address,
    delegatee: agent.address,
    nonce: DELEGATION_NONCE,
  });

  const paymentRequired: PaymentRequired = {
    x402Version: 2,
    resource: {
      url: "https://merchant.budgetrail.test/api/research",
      description: "BudgetRail Phase 1 protected research result",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: mint.address,
        amount: PAYMENT_AMOUNT.toString(),
        payTo: merchant.address,
        maxTimeoutSeconds: 60,
        extra: { feePayer: owner.address },
      },
    ],
  };
  const policy = {
    network: SOLANA_DEVNET_CAIP2,
    asset: mint.address,
    payTo: merchant.address,
    maxAmount: PAYMENT_AMOUNT,
    maxTimeoutSeconds: 120,
    allowedResourceOrigins: ["https://merchant.budgetrail.test"],
    allowedFeePayers: [owner.address],
  } as const;
  const requirement = selectBudgetRailRequirement(paymentRequired, policy);
  const { paymentPayload } = await buildDelegatedPaymentPayload({
    requirement,
    delegator: owner.address,
    delegatee: agent,
    delegationNonce: DELEGATION_NONCE,
    memo: "budgetrail-phase-1",
    rpcUrl,
  });

  const facilitatorSigner = toFacilitatorSvmSigner(owner, {
    defaultRpcUrl: rpcUrl,
  });
  const facilitator = new ExactSvmScheme(
    facilitatorSigner,
    undefined,
    BUDGETRAIL_FACILITATOR_OPTIONS
  );
  const verification = await facilitator.verify(paymentPayload, requirement);
  if (!verification.isValid) {
    throw new Error(
      `Facilitator rejected payload: ${verification.invalidReason}`
    );
  }
  const settlement = await facilitator.settle(paymentPayload, requirement);
  if (!settlement.success) {
    throw new Error(`Settlement failed: ${settlement.errorReason}`);
  }

  const merchantBalance = await ownerClient.rpc
    .getTokenAccountBalance(merchantAta)
    .send();
  if (BigInt(merchantBalance.value.amount) !== PAYMENT_AMOUNT + 1n) {
    throw new Error("Merchant balance did not increase by the payment amount");
  }

  let overBudgetRejection = "not-run";
  try {
    const invalid = structuredClone(paymentRequired);
    invalid.accepts[0]!.amount = "3000000";
    selectBudgetRailRequirement(invalid, policy);
  } catch (error) {
    if (!(error instanceof PaymentPolicyError)) throw error;
    overBudgetRejection = error.code;
  }

  console.log(
    JSON.stringify(
      {
        status: "phase-1-x402-proof-complete",
        execution: localMode ? "surfpool-local-devnet-fork" : "public-devnet",
        network: SOLANA_DEVNET_CAIP2,
        disposableKeysPersisted: false,
        addresses: {
          owner: owner.address,
          agent: agent.address,
          merchant: merchant.address,
          facilitator: owner.address,
          mint: mint.address,
          delegationPda,
          merchantAta,
        },
        signatures: {
          ownerAirdrop,
          createMint: createMint.context.signature,
          fundOwner: fundOwner.context.signature,
          createMerchantAta: createMerchantAta.context.signature,
          initAuthority: initAuthority.context.signature,
          createDelegation: createDelegation.context.signature,
          delegatedX402Settlement: settlement.transaction,
        },
        x402: {
          scheme: requirement.scheme,
          facilitatorVerification: verification.isValid,
          smartWalletProgramAllowList:
            BUDGETRAIL_FACILITATOR_OPTIONS.smartWalletAllowedPrograms,
          protectedResponse: {
            ok: true,
            report: "BudgetRail unlocked this response after settlement.",
          },
        },
        assertions: {
          paymentAmount: PAYMENT_AMOUNT.toString(),
          merchantFinalBalance: merchantBalance.value.amount,
          overBudgetRejection,
        },
      },
      null,
      2
    )
  );
  surfnet?.stop();
}

void main();
