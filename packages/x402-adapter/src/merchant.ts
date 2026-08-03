import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type {
  Network,
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";

export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";
export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";
export const PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE";

export interface BudgetRailFacilitator {
  verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<VerifyResponse>;
  settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse>;
}

export interface BudgetRailMerchantConfig {
  network: Network;
  asset: string;
  payTo: string;
  feePayer: string;
  amount: bigint;
  maxTimeoutSeconds: number;
  challengeTtlMs?: number;
  now?: () => Date;
  createId?: () => string;
}

export interface ProtectedResearchArtifact {
  kind: "budgetrail.spend-safety-brief";
  title: string;
  summary: string;
  generatedAt: string;
  payment: {
    amountBaseUnits: string;
    asset: string;
    network: Network;
    recipient: string;
    transaction: string;
  };
  findings: Array<{
    severity: "pass" | "info";
    title: string;
    detail: string;
  }>;
}

export type MerchantResult = {
  status: number;
  headers: Record<string, string>;
  body: Record<string, unknown> | ProtectedResearchArtifact;
};

type ChallengeState = {
  id: string;
  issuedAt: string;
  expiresAtMs: number;
  resourceUrl: string;
  requirement: PaymentRequirements;
  state: "open" | "settling" | "settled";
  paymentFingerprint?: string;
  settlement?: SettleResponse;
};

type ChallengeMetadata = {
  challengeId: string;
  issuedAt: string;
  expiresAt: string;
};

const DEFAULT_CHALLENGE_TTL_MS = 60_000;

/**
 * A transport-light x402 merchant. The Next.js route and the proof runner use
 * the same implementation, so challenge validation and replay behavior cannot
 * drift between the UI demo and integration evidence.
 */
export class BudgetRailMerchant {
  private readonly challenges = new Map<string, ChallengeState>();
  private readonly settledPayments = new Set<string>();

  constructor(
    private readonly config: BudgetRailMerchantConfig,
    private readonly facilitator: BudgetRailFacilitator
  ) {}

  async handleRequest(input: {
    resourceUrl: string;
    paymentSignature?: string | null;
  }): Promise<MerchantResult> {
    if (!input.paymentSignature) {
      return this.paymentRequired(input.resourceUrl);
    }

    let payload: PaymentPayload;
    try {
      payload = decodePaymentSignatureHeader(input.paymentSignature);
    } catch {
      return this.failure(
        400,
        "MALFORMED_PAYMENT_SIGNATURE",
        "The payment header is not valid x402 data."
      );
    }

    const metadata = readChallengeMetadata(payload.accepted.extra);
    if (!metadata) {
      return this.failure(
        402,
        "CHALLENGE_BINDING_MISSING",
        "The payment is not bound to a BudgetRail challenge."
      );
    }

    const challenge = this.challenges.get(metadata.challengeId);
    if (!challenge || challenge.resourceUrl !== input.resourceUrl) {
      return this.failure(
        402,
        "CHALLENGE_NOT_FOUND",
        "The payment challenge is unknown or belongs to another resource."
      );
    }

    if (challenge.expiresAtMs <= this.now().getTime()) {
      return this.failure(
        402,
        "CHALLENGE_EXPIRED",
        "The payment challenge expired. Request a fresh challenge and retry."
      );
    }

    if (!requirementsEqual(payload.accepted, challenge.requirement)) {
      return this.failure(
        402,
        "REQUIREMENTS_MISMATCH",
        "The signed payment does not exactly match the issued requirements."
      );
    }

    const transaction = payload.payload.transaction;
    if (typeof transaction !== "string" || transaction.length === 0) {
      return this.failure(
        400,
        "TRANSACTION_MISSING",
        "The payment payload does not contain a signed transaction."
      );
    }
    const fingerprint = await sha256(transaction);

    if (
      challenge.state !== "open" ||
      challenge.paymentFingerprint === fingerprint ||
      this.settledPayments.has(fingerprint)
    ) {
      return this.failure(
        409,
        "PAYMENT_REPLAYED",
        "This challenge or signed payment has already been consumed."
      );
    }

    // Reserve before the first await so concurrent retries cannot settle twice.
    challenge.state = "settling";
    challenge.paymentFingerprint = fingerprint;

    let verification: VerifyResponse;
    try {
      verification = await this.facilitator.verify(
        payload,
        challenge.requirement
      );
    } catch {
      challenge.state = "open";
      challenge.paymentFingerprint = undefined;
      return this.failure(
        502,
        "FACILITATOR_UNAVAILABLE",
        "The facilitator could not verify the payment. Retry this challenge."
      );
    }

    if (!verification.isValid) {
      challenge.state = "open";
      challenge.paymentFingerprint = undefined;
      return this.failure(
        402,
        "PAYMENT_INVALID",
        verification.invalidMessage ??
          verification.invalidReason ??
          "The facilitator rejected the payment."
      );
    }

    let settlement: SettleResponse;
    try {
      settlement = await this.facilitator.settle(
        payload,
        challenge.requirement
      );
    } catch {
      // Settlement outcome is unknown after a transport failure. Keep the
      // challenge consumed instead of risking a duplicate transfer.
      challenge.state = "settled";
      this.settledPayments.add(fingerprint);
      return this.failure(
        502,
        "SETTLEMENT_OUTCOME_UNKNOWN",
        "Settlement may have reached Solana. This payment will not be retried automatically."
      );
    }

    if (!settlement.success) {
      challenge.state = "settled";
      challenge.settlement = settlement;
      this.settledPayments.add(fingerprint);
      return this.failure(
        402,
        "SETTLEMENT_FAILED",
        settlement.errorMessage ??
          settlement.errorReason ??
          "The payment could not be settled."
      );
    }

    challenge.state = "settled";
    challenge.settlement = settlement;
    this.settledPayments.add(fingerprint);

    return {
      status: 200,
      headers: {
        "content-type": "application/json",
        [PAYMENT_RESPONSE_HEADER]: encodePaymentResponseHeader(settlement),
      },
      body: createProtectedArtifact(challenge, settlement, this.now()),
    };
  }

  private paymentRequired(resourceUrl: string): MerchantResult {
    const now = this.now();
    const id = this.config.createId?.() ?? crypto.randomUUID();
    const ttl = this.config.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS;
    const metadata: ChallengeMetadata = {
      challengeId: id,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl).toISOString(),
    };
    const requirement: PaymentRequirements = {
      scheme: "exact",
      network: this.config.network,
      asset: this.config.asset,
      amount: this.config.amount.toString(),
      payTo: this.config.payTo,
      maxTimeoutSeconds: this.config.maxTimeoutSeconds,
      extra: {
        feePayer: this.config.feePayer,
        budgetRail: metadata,
      },
    };
    const paymentRequired: PaymentRequired = {
      x402Version: 2,
      resource: {
        url: resourceUrl,
        description: "BudgetRail agent spend-safety brief",
        mimeType: "application/json",
      },
      accepts: [requirement],
    };

    this.challenges.set(id, {
      id,
      issuedAt: metadata.issuedAt,
      expiresAtMs: now.getTime() + ttl,
      resourceUrl,
      requirement,
      state: "open",
    });

    return {
      status: 402,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        [PAYMENT_REQUIRED_HEADER]: encodePaymentRequiredHeader(paymentRequired),
      },
      body: {
        error: "PAYMENT_REQUIRED",
        message: "Pay 0.10 USDC to unlock the spend-safety brief.",
      },
    };
  }

  private now() {
    return this.config.now?.() ?? new Date();
  }

  private failure(
    status: number,
    code: string,
    message: string
  ): MerchantResult {
    return {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
      body: { error: code, message },
    };
  }
}

function readChallengeMetadata(
  extra: Record<string, unknown>
): ChallengeMetadata | undefined {
  const value = extra.budgetRail;
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  if (
    typeof record.challengeId !== "string" ||
    typeof record.issuedAt !== "string" ||
    typeof record.expiresAt !== "string"
  ) {
    return;
  }
  return {
    challengeId: record.challengeId,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
  };
}

function requirementsEqual(
  left: PaymentRequirements,
  right: PaymentRequirements
) {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function createProtectedArtifact(
  challenge: ChallengeState,
  settlement: SettleResponse,
  now: Date
): ProtectedResearchArtifact {
  return {
    kind: "budgetrail.spend-safety-brief",
    title: "Autonomous payment safety brief",
    summary:
      "The agent paid only after independently validating the merchant, token, network, recipient, amount, fee payer, and timeout.",
    generatedAt: now.toISOString(),
    payment: {
      amountBaseUnits: challenge.requirement.amount,
      asset: challenge.requirement.asset,
      network: challenge.requirement.network,
      recipient: challenge.requirement.payTo,
      transaction: settlement.transaction,
    },
    findings: [
      {
        severity: "pass",
        title: "Requirements were immutable",
        detail:
          "The signed requirement exactly matched the one-time merchant challenge.",
      },
      {
        severity: "pass",
        title: "Settlement was replay-safe",
        detail:
          "The challenge and signed transaction were consumed before the protected result was released.",
      },
      {
        severity: "info",
        title: "Fulfillment is evidence-bound",
        detail: `Challenge ${challenge.id} was issued at ${challenge.issuedAt} and fulfilled by ${settlement.transaction}.`,
      },
    ],
  };
}
