import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { generateKeyPairSigner } from "@solana/kit";
import { findFixedDelegationPda } from "@solana/subscriptions";
import { Surfnet } from "@solana/surfpool";
import { toFacilitatorSvmSigner } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/facilitator";
import {
  BUDGETRAIL_FACILITATOR_OPTIONS,
  BudgetRailMerchant,
  SOLANA_DEVNET_CAIP2,
  runAutonomousPaymentLoop,
  type AgentPaymentEvent,
  type MerchantResult,
} from "../../../packages/x402-adapter/src";
import { createSubscriptionsClient } from "../subscriptions-client";

const REMOTE_DEVNET_RPC = "https://api.devnet.solana.com";
const TOKEN_DECIMALS = 6;
const ALLOWANCE_AMOUNT = 2_000_000n;
const PAYMENT_AMOUNT = 100_000n;
const DELEGATION_NONCE = 3_000_000_000_000_003n;

export type Phase3DemoResult = {
  execution: "isolated-surfpool-devnet-fork";
  network: typeof SOLANA_DEVNET_CAIP2;
  addresses: {
    owner: string;
    agent: string;
    merchant: string;
    facilitator: string;
    mint: string;
    delegation: string;
  };
  allowance: {
    capBaseUnits: string;
    beforeBaseUnits: string;
    paidBaseUnits: string;
    afterBaseUnits: string;
  };
  transaction: string;
  artifact: Awaited<ReturnType<typeof runAutonomousPaymentLoop>>["artifact"];
  events: AgentPaymentEvent[];
};

export class Phase3DemoRuntime {
  readonly merchant: BudgetRailMerchant;

  private constructor(
    private readonly surfnet: Surfnet,
    private readonly owner: Awaited<ReturnType<typeof generateKeyPairSigner>>,
    private readonly agent: Awaited<ReturnType<typeof generateKeyPairSigner>>,
    private readonly merchantSigner: Awaited<
      ReturnType<typeof generateKeyPairSigner>
    >,
    private readonly facilitatorSigner: Awaited<
      ReturnType<typeof generateKeyPairSigner>
    >,
    private readonly mint: Awaited<ReturnType<typeof generateKeyPairSigner>>,
    private readonly delegationAddress: Awaited<
      ReturnType<typeof findFixedDelegationPda>
    >[0],
    private readonly merchantAta: Awaited<
      ReturnType<typeof findAssociatedTokenPda>
    >[0],
    private readonly client: ReturnType<typeof createSubscriptionsClient>,
    merchant: BudgetRailMerchant
  ) {
    this.merchant = merchant;
  }

  static async create() {
    const surfnet = Surfnet.startWithConfig({
      offline: false,
      remoteRpcUrl: REMOTE_DEVNET_RPC,
    });

    try {
      const owner = await generateKeyPairSigner();
      const agent = await generateKeyPairSigner();
      const merchantSigner = await generateKeyPairSigner();
      const facilitatorSigner = await generateKeyPairSigner();
      const mint = await generateKeyPairSigner();

      surfnet.fundSol(owner.address, 500_000_000);
      surfnet.fundSol(facilitatorSigner.address, 500_000_000);

      const client = createSubscriptionsClient(
        "localnet",
        owner,
        surfnet.rpcUrl,
        surfnet.wsUrl
      );
      await client.token.instructions
        .createMint({
          newMint: mint,
          decimals: TOKEN_DECIMALS,
          mintAuthority: owner.address,
        })
        .sendTransaction();
      await client.token.instructions
        .mintToATA({
          owner: owner.address,
          mint: mint.address,
          mintAuthority: owner,
          amount: 5_000_000n,
          decimals: TOKEN_DECIMALS,
        })
        .sendTransaction();
      await client.token.instructions
        .mintToATA({
          owner: merchantSigner.address,
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
        owner: merchantSigner.address,
        mint: mint.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
      const authority = await client.subscriptions.instructions
        .initSubscriptionAuthority({
          tokenMint: mint.address,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
          userAta: ownerAta,
        })
        .sendTransaction();
      await client.subscriptions.instructions
        .createFixedDelegation({
          amount: ALLOWANCE_AMOUNT,
          delegatee: agent.address,
          expiryTs: BigInt(Math.floor(Date.now() / 1000) + 86_400),
          nonce: DELEGATION_NONCE,
          tokenMint: mint.address,
        })
        .sendTransaction();
      const [delegationAddress] = await findFixedDelegationPda({
        subscriptionAuthority: (
          await client.subscriptions.queries.isSubscriptionAuthorityInitialized(
            owner.address,
            mint.address
          )
        ).pda,
        delegator: owner.address,
        delegatee: agent.address,
        nonce: DELEGATION_NONCE,
      });

      if (!authority.context.signature) {
        throw new Error("Subscription authority setup was not confirmed");
      }

      const facilitator = new ExactSvmScheme(
        toFacilitatorSvmSigner(facilitatorSigner, {
          defaultRpcUrl: surfnet.rpcUrl,
        }),
        undefined,
        BUDGETRAIL_FACILITATOR_OPTIONS
      );
      const merchant = new BudgetRailMerchant(
        {
          network: SOLANA_DEVNET_CAIP2,
          asset: mint.address,
          payTo: merchantSigner.address,
          feePayer: facilitatorSigner.address,
          amount: PAYMENT_AMOUNT,
          maxTimeoutSeconds: 60,
          challengeTtlMs: 60_000,
        },
        facilitator
      );

      return new Phase3DemoRuntime(
        surfnet,
        owner,
        agent,
        merchantSigner,
        facilitatorSigner,
        mint,
        delegationAddress,
        merchantAta,
        client,
        merchant
      );
    } catch (error) {
      surfnet.stop();
      throw error;
    }
  }

  async runPurchase({
    resourceUrl,
    fetchFn,
    onEvent,
  }: {
    resourceUrl: string;
    fetchFn: typeof fetch;
    onEvent?: (event: AgentPaymentEvent) => void;
  }): Promise<Phase3DemoResult> {
    const before = await this.remainingAllowance();
    const origin = new URL(resourceUrl).origin;
    const result = await runAutonomousPaymentLoop({
      resourceUrl,
      fetchFn,
      policy: {
        network: SOLANA_DEVNET_CAIP2,
        asset: this.mint.address,
        payTo: this.merchantSigner.address,
        maxAmount: PAYMENT_AMOUNT,
        maxTimeoutSeconds: 120,
        allowedResourceOrigins: [origin],
        allowedFeePayers: [this.facilitatorSigner.address],
      },
      delegator: this.owner.address,
      delegatee: this.agent,
      delegationNonce: DELEGATION_NONCE,
      rpcUrl: this.surfnet.rpcUrl,
      memo: `budgetrail-phase-3-${Date.now()}`,
      onEvent,
    });
    const after = await this.remainingAllowance();
    const merchantBalance = await this.client.rpc
      .getTokenAccountBalance(this.merchantAta)
      .send();

    if (before - after !== PAYMENT_AMOUNT) {
      throw new Error("The allowance did not decrease by exactly 0.10 USDC");
    }
    if (BigInt(merchantBalance.value.amount) < PAYMENT_AMOUNT + 1n) {
      throw new Error(
        "The merchant did not receive the protected-resource payment"
      );
    }

    return {
      execution: "isolated-surfpool-devnet-fork",
      network: SOLANA_DEVNET_CAIP2,
      addresses: {
        owner: this.owner.address,
        agent: this.agent.address,
        merchant: this.merchantSigner.address,
        facilitator: this.facilitatorSigner.address,
        mint: this.mint.address,
        delegation: this.delegationAddress,
      },
      allowance: {
        capBaseUnits: ALLOWANCE_AMOUNT.toString(),
        beforeBaseUnits: before.toString(),
        paidBaseUnits: PAYMENT_AMOUNT.toString(),
        afterBaseUnits: after.toString(),
      },
      transaction: result.settlement.transaction,
      artifact: result.artifact,
      events: result.events,
    };
  }

  close() {
    this.surfnet.stop();
  }

  private async remainingAllowance() {
    const delegations =
      await this.client.subscriptions.queries.delegationsByDelegator(
        this.owner.address
      );
    const delegation = delegations.find(
      (candidate) =>
        candidate.kind === "fixed" &&
        candidate.address === this.delegationAddress
    );
    if (!delegation || delegation.kind !== "fixed") {
      throw new Error("The Phase 3 demo allowance is not available");
    }
    return delegation.data.amount;
  }
}

export function merchantResultToResponse(result: MerchantResult) {
  return Response.json(result.body, {
    status: result.status,
    headers: result.headers,
  });
}

declare global {
  var __budgetRailPhase3Runtime: Promise<Phase3DemoRuntime> | undefined;
}

export function getPhase3DemoRuntime() {
  globalThis.__budgetRailPhase3Runtime ??= Phase3DemoRuntime.create();
  return globalThis.__budgetRailPhase3Runtime;
}
