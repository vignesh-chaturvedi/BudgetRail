import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type { PaymentRequired, SettleResponse } from "@x402/core/types";
import type { Address, TransactionSigner } from "@solana/kit";
import {
  buildDelegatedPaymentPayload,
  type BuildDelegatedPaymentPayloadInput,
} from "./payload";
import {
  selectBudgetRailRequirement,
  type BudgetRailPaymentPolicy,
} from "./policy";
import {
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  type ProtectedResearchArtifact,
} from "./merchant";

export type AgentPaymentStage =
  | "bootstrapping"
  | "requesting"
  | "challenged"
  | "validating"
  | "signing"
  | "retrying"
  | "settling"
  | "unlocked";

export type AgentPaymentEvent = {
  stage: AgentPaymentStage;
  message: string;
  at: string;
};

export type AgentPaymentResult = {
  artifact: ProtectedResearchArtifact;
  settlement: SettleResponse;
  requirement: ReturnType<typeof selectBudgetRailRequirement>;
  events: AgentPaymentEvent[];
};

export class AgentPaymentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "AgentPaymentError";
  }
}

export async function runAutonomousPaymentLoop({
  resourceUrl,
  fetchFn = fetch,
  policy,
  delegator,
  delegatee,
  delegationNonce,
  rpcUrl,
  memo,
  onEvent,
  now = () => new Date(),
}: {
  resourceUrl: string;
  fetchFn?: typeof fetch;
  policy: BudgetRailPaymentPolicy;
  delegator: Address;
  delegatee: TransactionSigner;
  delegationNonce: bigint;
  rpcUrl?: string;
  memo?: BuildDelegatedPaymentPayloadInput["memo"];
  onEvent?: (event: AgentPaymentEvent) => void;
  now?: () => Date;
}): Promise<AgentPaymentResult> {
  const events: AgentPaymentEvent[] = [];
  const emit = (stage: AgentPaymentStage, message: string) => {
    const event = { stage, message, at: now().toISOString() };
    events.push(event);
    onEvent?.(event);
  };

  emit("requesting", "Requesting the protected spend-safety brief.");
  let challengeResponse: Response;
  try {
    challengeResponse = await fetchFn(resourceUrl, {
      method: "GET",
      cache: "no-store",
    });
  } catch {
    throw new AgentPaymentError(
      "MERCHANT_UNAVAILABLE",
      "The merchant could not be reached. No payment was prepared."
    );
  }
  if (challengeResponse.status >= 500) {
    throw new AgentPaymentError(
      "MERCHANT_UNAVAILABLE",
      `The merchant is temporarily unavailable (HTTP ${challengeResponse.status}).`,
      challengeResponse.status
    );
  }
  if (challengeResponse.status !== 402) {
    throw new AgentPaymentError(
      "CHALLENGE_EXPECTED",
      `Expected HTTP 402, received ${challengeResponse.status}.`,
      challengeResponse.status
    );
  }

  const challengeHeader = challengeResponse.headers.get(
    PAYMENT_REQUIRED_HEADER
  );
  if (!challengeHeader) {
    throw new AgentPaymentError(
      "CHALLENGE_HEADER_MISSING",
      "The merchant returned 402 without PAYMENT-REQUIRED."
    );
  }
  let paymentRequired: PaymentRequired;
  try {
    paymentRequired = decodePaymentRequiredHeader(challengeHeader);
  } catch {
    throw new AgentPaymentError(
      "CHALLENGE_MALFORMED",
      "The merchant challenge is not valid x402 data."
    );
  }
  emit("challenged", "Received a one-time x402 payment challenge.");

  emit(
    "validating",
    "Checking origin, network, mint, recipient, amount, fee payer, and timeout."
  );
  const requirement = selectBudgetRailRequirement(paymentRequired, policy);

  emit(
    "signing",
    "Constructing the fixed-delegation payment deterministically."
  );
  let paymentPayload: Awaited<
    ReturnType<typeof buildDelegatedPaymentPayload>
  >["paymentPayload"];
  try {
    ({ paymentPayload } = await buildDelegatedPaymentPayload({
      requirement,
      delegator,
      delegatee,
      delegationNonce,
      rpcUrl,
      memo,
    }));
  } catch {
    throw new AgentPaymentError(
      "RPC_UNAVAILABLE",
      "Solana RPC could not prepare a fresh transaction. Nothing was submitted."
    );
  }

  emit("retrying", "Retrying the same resource with PAYMENT-SIGNATURE.");
  emit(
    "settling",
    "Merchant is verifying the payment and submitting it to Solana."
  );
  let paidResponse: Response;
  try {
    paidResponse = await fetchFn(resourceUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        [PAYMENT_SIGNATURE_HEADER]:
          encodePaymentSignatureHeader(paymentPayload),
      },
    });
  } catch {
    throw new AgentPaymentError(
      "PAYMENT_OUTCOME_UNKNOWN",
      "The paid retry lost contact with the merchant. Do not resubmit automatically; reconcile the signed payment first."
    );
  }
  if (!paidResponse.ok) {
    const failure = await readJson(paidResponse);
    throw new AgentPaymentError(
      typeof failure.error === "string" ? failure.error : "PAYMENT_FAILED",
      typeof failure.message === "string"
        ? failure.message
        : `Merchant rejected the paid retry with ${paidResponse.status}.`,
      paidResponse.status
    );
  }

  const settlementHeader = paidResponse.headers.get(PAYMENT_RESPONSE_HEADER);
  if (!settlementHeader) {
    throw new AgentPaymentError(
      "SETTLEMENT_RECEIPT_MISSING",
      "The merchant unlocked the resource without a PAYMENT-RESPONSE receipt."
    );
  }
  let settlement: SettleResponse;
  try {
    settlement = decodePaymentResponseHeader(settlementHeader);
  } catch {
    throw new AgentPaymentError(
      "SETTLEMENT_RECEIPT_INVALID",
      "The merchant returned an invalid settlement receipt."
    );
  }
  if (!settlement.success) {
    throw new AgentPaymentError(
      "SETTLEMENT_FAILED",
      settlement.errorMessage ?? settlement.errorReason ?? "Settlement failed."
    );
  }

  let artifact: ProtectedResearchArtifact;
  try {
    artifact = (await paidResponse.json()) as ProtectedResearchArtifact;
  } catch {
    throw new AgentPaymentError(
      "PROTECTED_ARTIFACT_INVALID",
      "The merchant response was not valid JSON."
    );
  }
  if (artifact.kind !== "budgetrail.spend-safety-brief") {
    throw new AgentPaymentError(
      "PROTECTED_ARTIFACT_INVALID",
      "The merchant did not return the expected protected artifact."
    );
  }
  emit("unlocked", "Protected research unlocked after confirmed payment.");

  return { artifact, settlement, requirement, events };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
