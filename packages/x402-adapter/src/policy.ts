import { parsePaymentRequired } from "@x402/core/schemas";
import type {
  Network,
  PaymentRequired,
  PaymentRequirements,
} from "@x402/core/types";

export type PaymentPolicyErrorCode =
  | "MALFORMED_PAYMENT_REQUIRED"
  | "UNSUPPORTED_X402_VERSION"
  | "RESOURCE_ORIGIN_NOT_ALLOWED"
  | "EXACT_SCHEME_REQUIRED"
  | "NETWORK_NOT_ALLOWED"
  | "ASSET_NOT_ALLOWED"
  | "RECIPIENT_NOT_ALLOWED"
  | "FEE_PAYER_NOT_ALLOWED"
  | "INVALID_AMOUNT"
  | "AMOUNT_EXCEEDS_REQUEST_LIMIT"
  | "TIMEOUT_NOT_ALLOWED";

export class PaymentPolicyError extends Error {
  constructor(
    readonly code: PaymentPolicyErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PaymentPolicyError";
  }
}

export interface BudgetRailPaymentPolicy {
  network: Network;
  asset: string;
  payTo: string;
  maxAmount: bigint;
  maxTimeoutSeconds: number;
  allowedResourceOrigins: readonly string[];
  allowedFeePayers: readonly string[];
}

function fail(code: PaymentPolicyErrorCode, message: string): never {
  throw new PaymentPolicyError(code, message);
}

function parseAmount(value: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    return fail("INVALID_AMOUNT", "Payment amount must be base-10 base units");
  }

  const amount = BigInt(value);
  if (amount <= 0n) {
    return fail("INVALID_AMOUNT", "Payment amount must be greater than zero");
  }

  return amount;
}

function parseRequired(raw: unknown): PaymentRequired {
  const result = parsePaymentRequired(raw);
  if (!result.success) {
    return fail(
      "MALFORMED_PAYMENT_REQUIRED",
      "Response is not a valid x402 PaymentRequired object"
    );
  }

  if (result.data.x402Version !== 2) {
    return fail("UNSUPPORTED_X402_VERSION", "BudgetRail requires x402 v2");
  }

  const accepts = result.data.accepts.map((requirement) => {
    if (!/^[^:]+:.+$/.test(requirement.network)) {
      return fail(
        "MALFORMED_PAYMENT_REQUIRED",
        "Payment network must be a CAIP-2 identifier"
      );
    }

    return {
      ...requirement,
      network: requirement.network as Network,
      extra: requirement.extra ?? {},
    };
  });

  return {
    ...result.data,
    accepts,
    extensions: result.data.extensions ?? undefined,
  };
}

/**
 * Selects one requirement only after narrowing every security-sensitive field.
 * The agent never asks an LLM to choose the recipient, mint, network, or amount.
 */
export function selectBudgetRailRequirement(
  raw: unknown,
  policy: BudgetRailPaymentPolicy
): PaymentRequirements {
  const paymentRequired = parseRequired(raw);

  let resourceOrigin: string;
  try {
    resourceOrigin = new URL(paymentRequired.resource.url).origin;
  } catch {
    return fail(
      "MALFORMED_PAYMENT_REQUIRED",
      "The protected resource URL is invalid"
    );
  }

  if (!policy.allowedResourceOrigins.includes(resourceOrigin)) {
    return fail(
      "RESOURCE_ORIGIN_NOT_ALLOWED",
      `Resource origin ${resourceOrigin} is not allow-listed`
    );
  }

  const exact = paymentRequired.accepts.filter(
    (requirement) => requirement.scheme === "exact"
  );
  if (exact.length === 0) {
    return fail("EXACT_SCHEME_REQUIRED", "No exact-payment option was offered");
  }

  const onNetwork = exact.filter(
    (requirement) => requirement.network === policy.network
  );
  if (onNetwork.length === 0) {
    return fail(
      "NETWORK_NOT_ALLOWED",
      "No approved Solana network was offered"
    );
  }

  const forAsset = onNetwork.filter(
    (requirement) => requirement.asset === policy.asset
  );
  if (forAsset.length === 0) {
    return fail("ASSET_NOT_ALLOWED", "No approved token mint was offered");
  }

  const forRecipient = forAsset.filter(
    (requirement) => requirement.payTo === policy.payTo
  );
  if (forRecipient.length === 0) {
    return fail(
      "RECIPIENT_NOT_ALLOWED",
      "No approved merchant recipient was offered"
    );
  }

  const forFacilitator = forRecipient.filter((requirement) => {
    const feePayer = requirement.extra.feePayer;
    return (
      typeof feePayer === "string" && policy.allowedFeePayers.includes(feePayer)
    );
  });
  if (forFacilitator.length === 0) {
    return fail(
      "FEE_PAYER_NOT_ALLOWED",
      "No approved facilitator fee payer was offered"
    );
  }

  for (const requirement of forFacilitator) {
    const amount = parseAmount(requirement.amount);
    if (amount > policy.maxAmount) continue;
    if (
      requirement.maxTimeoutSeconds <= 0 ||
      requirement.maxTimeoutSeconds > policy.maxTimeoutSeconds
    ) {
      continue;
    }
    return requirement;
  }

  const hasAffordable = forFacilitator.some(
    (requirement) => parseAmount(requirement.amount) <= policy.maxAmount
  );
  if (!hasAffordable) {
    return fail(
      "AMOUNT_EXCEEDS_REQUEST_LIMIT",
      "Every offered payment exceeds the per-request limit"
    );
  }

  return fail(
    "TIMEOUT_NOT_ALLOWED",
    "Every offered payment has an unsafe settlement timeout"
  );
}
