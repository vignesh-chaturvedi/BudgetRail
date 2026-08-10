import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  createKeyPairSignerFromBytes,
  generateKeyPairSigner,
} from "@solana/kit";
import { findFixedDelegationPda } from "@solana/subscriptions";
import { Surfnet } from "@solana/surfpool";
import { Keypair } from "@solana/web3.js";
import type { PaymentRequired } from "@x402/core/types";
import { toFacilitatorSvmSigner } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/facilitator";
import {
  BUDGETRAIL_FACILITATOR_OPTIONS,
  BudgetRailMerchant,
  PaymentPolicyError,
  SOLANA_DEVNET_CAIP2,
  buildDelegatedPaymentPayload,
  runAutonomousPaymentLoop,
  selectBudgetRailRequirement,
  type AgentPaymentEvent,
  type BudgetRailFacilitator,
  type MerchantResult,
} from "../../../packages/x402-adapter/src";
import {
  createAgentRegistryClient,
  registerBudgetRailIdentity,
  type RegisteredAgentIdentity,
} from "../../../packages/agent-registry/src";
import { safeErrorMessage } from "../../../packages/security/src";
import { createSubscriptionsClient } from "../subscriptions-client";

const REMOTE_DEVNET_RPC = "https://api.devnet.solana.com";
const TOKEN_DECIMALS = 6;
const ALLOWANCE_AMOUNT = 2_000_000n;
const PAYMENT_AMOUNT = 100_000n;
const OVER_BUDGET_AMOUNT = 3_000_000n;
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

export type DemoActivity = {
  id: string;
  at: string;
  kind:
    | "allowance-created"
    | "identity-registered"
    | "wallet-linked"
    | "payment-settled"
    | "over-budget-denied"
    | "expired-payment-denied"
    | "payment-denied"
    | "allowance-revoked";
  decision: "control" | "allowed" | "denied";
  title: string;
  detail: string;
  signature?: string;
};

export type Phase4DemoState = {
  execution: "isolated-surfpool-devnet-fork";
  cluster: "devnet";
  rpcUrl: string;
  railStatus: "active" | "revoked";
  identity: RegisteredAgentIdentity;
  participants: {
    owner: string;
    agent: string;
    merchant: string;
    allowance: string;
    mint: string;
  };
  budget: {
    capBaseUnits: string;
    spentBaseUnits: string;
    remainingBaseUnits: string;
    symbol: "USDC";
  };
  activities: DemoActivity[];
};

type ProgramDenialProof = {
  verification: "rejected";
  remainingBefore: string;
  remainingAfter: string;
  merchantBefore: string;
  merchantAfter: string;
};

export class Phase3DemoRuntime {
  readonly merchant: BudgetRailMerchant;

  private constructor(
    private readonly surfnet: Surfnet,
    private readonly legacyOwner: Keypair,
    private readonly legacyAgent: Keypair,
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
    private readonly seedSignature: string,
    private readonly expiryTs: bigint,
    private readonly facilitator: BudgetRailFacilitator,
    merchant: BudgetRailMerchant
  ) {
    this.merchant = merchant;
    this.activities.push({
      id: `allowance-created:${seedSignature}`,
      at: new Date().toISOString(),
      kind: "allowance-created",
      decision: "control",
      title: "2.00 USDC rail created",
      detail:
        "Owner granted the registered operational wallet a fixed, expiring allowance.",
      signature: seedSignature,
    });
  }

  private identity?: RegisteredAgentIdentity;
  private identityPromise?: Promise<RegisteredAgentIdentity>;
  private overBudgetProgramProof?: Promise<ProgramDenialProof>;
  private readonly activities: DemoActivity[] = [];
  private lastKnownRemaining = ALLOWANCE_AMOUNT;

  static async create() {
    const surfnet = Surfnet.startWithConfig({
      offline: false,
      remoteRpcUrl: REMOTE_DEVNET_RPC,
    });

    try {
      const legacyOwner = Keypair.generate();
      const legacyAgent = Keypair.generate();
      const owner = await createKeyPairSignerFromBytes(legacyOwner.secretKey);
      const agent = await createKeyPairSignerFromBytes(legacyAgent.secretKey);
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
      const expiryTs = BigInt(Math.floor(Date.now() / 1000) + 86_400);
      const seeded = await client.subscriptions.instructions
        .createFixedDelegation({
          amount: ALLOWANCE_AMOUNT,
          delegatee: agent.address,
          expiryTs,
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

      const runtime = new Phase3DemoRuntime(
        surfnet,
        legacyOwner,
        legacyAgent,
        owner,
        agent,
        merchantSigner,
        facilitatorSigner,
        mint,
        delegationAddress,
        merchantAta,
        client,
        seeded.context.signature,
        expiryTs,
        facilitator,
        merchant
      );
      await runtime.prepareOverBudgetProgramProof();
      return runtime;
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
    try {
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
        memo: `budgetrail-phase-4-${Date.now()}`,
        onEvent,
      });
      const after = await this.remainingAllowance();
      this.lastKnownRemaining = after;
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

      this.activities.unshift({
        id: `payment-settled:${result.settlement.transaction}`,
        at: new Date().toISOString(),
        kind: "payment-settled",
        decision: "allowed",
        title: "0.10 USDC payment allowed",
        detail:
          "Policy matched the merchant, mint, network, amount, fee payer, and live allowance.",
        signature: result.settlement.transaction,
      });

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
    } catch (error) {
      this.activities.unshift({
        id: `payment-denied:${Date.now()}`,
        at: new Date().toISOString(),
        kind: "payment-denied",
        decision: "denied",
        title: "Payment denied",
        detail: safeErrorMessage(
          error,
          "The payment failed closed before the resource was unlocked."
        ),
      });
      throw error;
    }
  }

  async ensureIdentity(): Promise<RegisteredAgentIdentity> {
    if (this.identity) return this.identity;
    this.identityPromise ??= (async () => {
      const registry = await createAgentRegistryClient({
        rpcUrl: this.surfnet.rpcUrl,
        owner: this.legacyOwner,
      });
      const identity = await registerBudgetRailIdentity({
        registry,
        owner: this.legacyOwner.publicKey,
        operationalWallet: this.legacyAgent,
      });
      this.identity = identity;
      const now = new Date().toISOString();
      this.activities.unshift(
        {
          id: `wallet-linked:${identity.walletLinkSignature}`,
          at: now,
          kind: "wallet-linked",
          decision: "control",
          title: "Operational wallet linked",
          detail:
            "The registry identity now resolves to the exact delegate that signs x402 payments.",
          signature: identity.walletLinkSignature,
        },
        {
          id: `identity-registered:${identity.registrationSignature}`,
          at: now,
          kind: "identity-registered",
          decision: "control",
          title: "Agent identity registered",
          detail:
            "BudgetRail Agent received a verifiable ERC-8004 identity on the Solana Agent Registry.",
          signature: identity.registrationSignature,
        }
      );
      return identity;
    })().catch((error) => {
      this.identityPromise = undefined;
      throw error;
    });
    return this.identityPromise;
  }

  async proveOverBudgetGuardrail({
    freshProgramSimulation = false,
  }: { freshProgramSimulation?: boolean } = {}) {
    const existing = this.activities.find(
      (activity) => activity.kind === "over-budget-denied"
    );
    if (existing) return existing;

    const paymentRequired = this.probePaymentRequired(OVER_BUDGET_AMOUNT);
    let policyCode = "";
    try {
      selectBudgetRailRequirement(paymentRequired, {
        ...this.paymentPolicy(),
        maxAmount: PAYMENT_AMOUNT,
      });
    } catch (error) {
      if (!(error instanceof PaymentPolicyError)) throw error;
      policyCode = error.code;
    }
    if (policyCode !== "AMOUNT_EXCEEDS_REQUEST_LIMIT") {
      throw new Error(
        "The production policy did not reject the 3.00 USDC probe"
      );
    }

    const currentRemainingBefore = await this.remainingAllowance();
    const currentMerchantBefore = await this.merchantBalance();
    const proof = freshProgramSimulation
      ? await this.verifyProgramDenial(
          paymentRequired,
          "budgetrail-phase-5-over-budget"
        )
      : await this.prepareOverBudgetProgramProof();
    const currentRemainingAfter = await this.remainingAllowance();
    const currentMerchantAfter = await this.merchantBalance();
    const activity: DemoActivity = {
      id: `over-budget-denied:${Date.now()}`,
      at: new Date().toISOString(),
      kind: "over-budget-denied",
      decision: "denied",
      title: "3.00 USDC over-budget probe denied",
      detail:
        "Production policy blocked the request before signing; restricted Solana simulation independently confirmed the native 2.00 USDC rail would reject it with balances unchanged.",
    };
    if (
      proof.remainingBefore !== proof.remainingAfter ||
      proof.merchantBefore !== proof.merchantAfter ||
      currentRemainingBefore !== currentRemainingAfter ||
      currentMerchantBefore !== currentMerchantAfter
    ) {
      throw new Error(
        "The rejected over-budget probe changed on-chain balances"
      );
    }
    this.activities.unshift(activity);
    return activity;
  }

  async proveExpiredGuardrail() {
    this.surfnet.timeTravelToTimestamp(Number(this.expiryTs + 1n) * 1_000);
    const proof = await this.verifyProgramDenial(
      this.probePaymentRequired(PAYMENT_AMOUNT),
      "budgetrail-phase-5-expired"
    );
    if (
      proof.remainingBefore !== proof.remainingAfter ||
      proof.merchantBefore !== proof.merchantAfter
    ) {
      throw new Error("The rejected expired probe changed on-chain balances");
    }
    const activity: DemoActivity = {
      id: `expired-payment-denied:${Date.now()}`,
      at: new Date().toISOString(),
      kind: "expired-payment-denied",
      decision: "denied",
      title: "Expired allowance payment denied",
      detail:
        "Surfpool advanced past the delegation expiry; restricted Solana simulation rejected the payment with balances unchanged.",
    };
    this.activities.unshift(activity);
    return { activity, ...proof };
  }

  async getPhase4State(): Promise<Phase4DemoState> {
    const identity = await this.ensureIdentity();
    const account = await this.client.rpc
      .getAccountInfo(this.delegationAddress, { encoding: "base64" })
      .send();
    const remaining = account.value
      ? await this.remainingAllowance()
      : this.lastKnownRemaining;

    return {
      execution: "isolated-surfpool-devnet-fork",
      cluster: "devnet",
      rpcUrl: this.surfnet.rpcUrl,
      railStatus: account.value ? "active" : "revoked",
      identity,
      participants: {
        owner: this.owner.address,
        agent: this.agent.address,
        merchant: this.merchantSigner.address,
        allowance: this.delegationAddress,
        mint: this.mint.address,
      },
      budget: {
        capBaseUnits: ALLOWANCE_AMOUNT.toString(),
        spentBaseUnits: (ALLOWANCE_AMOUNT - remaining).toString(),
        remainingBaseUnits: remaining.toString(),
        symbol: "USDC",
      },
      activities: [...this.activities],
    };
  }

  async revokeAllowance(): Promise<Phase4DemoState> {
    const account = await this.client.rpc
      .getAccountInfo(this.delegationAddress, { encoding: "base64" })
      .send();
    if (account.value) {
      const result = await this.client.subscriptions.instructions
        .revokeDelegation({ delegationAccount: this.delegationAddress })
        .sendTransaction();
      this.activities.unshift({
        id: `allowance-revoked:${result.context.signature}`,
        at: new Date().toISOString(),
        kind: "allowance-revoked",
        decision: "control",
        title: "Agent access revoked",
        detail:
          "The owner closed the delegation account; further agent payments now fail closed.",
        signature: result.context.signature,
      });
    }
    return this.getPhase4State();
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
      throw new Error(
        "The delegation is closed; agent payment authority is no longer available"
      );
    }
    return delegation.data.amount;
  }

  private paymentPolicy() {
    return {
      network: SOLANA_DEVNET_CAIP2,
      asset: this.mint.address,
      payTo: this.merchantSigner.address,
      maxAmount: PAYMENT_AMOUNT,
      maxTimeoutSeconds: 120,
      allowedResourceOrigins: ["https://merchant.budgetrail.test"],
      allowedFeePayers: [this.facilitatorSigner.address],
    } as const;
  }

  private probePaymentRequired(amount: bigint): PaymentRequired {
    return {
      x402Version: 2,
      resource: {
        url: "https://merchant.budgetrail.test/api/research",
        description: "BudgetRail Phase 5 adversarial probe",
        mimeType: "application/json",
      },
      accepts: [
        {
          scheme: "exact",
          network: SOLANA_DEVNET_CAIP2,
          asset: this.mint.address,
          amount: amount.toString(),
          payTo: this.merchantSigner.address,
          maxTimeoutSeconds: 60,
          extra: { feePayer: this.facilitatorSigner.address },
        },
      ],
    };
  }

  private async verifyProgramDenial(
    paymentRequired: PaymentRequired,
    memo: string
  ) {
    const requirement = selectBudgetRailRequirement(paymentRequired, {
      ...this.paymentPolicy(),
      maxAmount: BigInt(paymentRequired.accepts[0]!.amount),
    });
    const remainingBefore = await this.remainingAllowance();
    const merchantBefore = await this.merchantBalance();
    const { paymentPayload } = await buildDelegatedPaymentPayload({
      requirement,
      delegator: this.owner.address,
      delegatee: this.agent,
      delegationNonce: DELEGATION_NONCE,
      rpcUrl: this.surfnet.rpcUrl,
      memo,
    });
    const verification = await this.facilitator.verify(
      paymentPayload,
      requirement
    );
    const remainingAfter = await this.remainingAllowance();
    const merchantAfter = await this.merchantBalance();
    if (verification.isValid) {
      throw new Error("The native delegation unexpectedly accepted the probe");
    }
    return {
      verification: "rejected" as const,
      remainingBefore: remainingBefore.toString(),
      remainingAfter: remainingAfter.toString(),
      merchantBefore: merchantBefore.toString(),
      merchantAfter: merchantAfter.toString(),
    };
  }

  private merchantBalance() {
    return this.client.rpc
      .getTokenAccountBalance(this.merchantAta)
      .send()
      .then((balance) => BigInt(balance.value.amount));
  }

  private prepareOverBudgetProgramProof() {
    this.overBudgetProgramProof ??= this.verifyProgramDenial(
      this.probePaymentRequired(OVER_BUDGET_AMOUNT),
      "budgetrail-phase-6-over-budget-preflight"
    ).catch((error) => {
      this.overBudgetProgramProof = undefined;
      throw error;
    });
    return this.overBudgetProgramProof;
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
  var __budgetRailDemoReset: Promise<Phase3DemoRuntime> | undefined;
}

export function getPhase3DemoRuntime() {
  globalThis.__budgetRailPhase3Runtime ??= Phase3DemoRuntime.create();
  return globalThis.__budgetRailPhase3Runtime;
}

export function resetPhase4DemoRuntime() {
  globalThis.__budgetRailDemoReset ??= (async () => {
    const current = globalThis.__budgetRailPhase3Runtime;
    if (current) {
      const runtime = await current.catch(() => undefined);
      runtime?.close();
    }
    const next = Phase3DemoRuntime.create();
    globalThis.__budgetRailPhase3Runtime = next;
    return next;
  })().finally(() => {
    globalThis.__budgetRailDemoReset = undefined;
  });
  return globalThis.__budgetRailDemoReset;
}
