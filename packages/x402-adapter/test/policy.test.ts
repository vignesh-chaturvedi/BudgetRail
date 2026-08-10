import { describe, expect, it } from "vitest";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import {
  PaymentPolicyError,
  SOLANA_DEVNET_CAIP2,
  selectBudgetRailRequirement,
  type BudgetRailPaymentPolicy,
} from "../src";

const mint = "So11111111111111111111111111111111111111112";
const merchant = "11111111111111111111111111111111";
const facilitator = "SysvarC1ock11111111111111111111111111111111";

const policy: BudgetRailPaymentPolicy = {
  network: SOLANA_DEVNET_CAIP2,
  asset: mint,
  payTo: merchant,
  maxAmount: 100_000n,
  maxTimeoutSeconds: 120,
  allowedResourceOrigins: ["https://merchant.budgetrail.test"],
  allowedFeePayers: [facilitator],
};

function challenge(
  overrides: Partial<PaymentRequired["accepts"][number]> = {}
): PaymentRequired {
  return {
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
        asset: mint,
        amount: "100000",
        payTo: merchant,
        maxTimeoutSeconds: 60,
        extra: { feePayer: facilitator },
        ...overrides,
      },
    ],
  };
}

function expectPolicyError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(PaymentPolicyError);
    expect((error as PaymentPolicyError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("selectBudgetRailRequirement", () => {
  it("accepts an exact devnet payment matching every policy field", () => {
    expect(selectBudgetRailRequirement(challenge(), policy).amount).toBe(
      "100000"
    );
  });

  it("rejects an amount above the per-request cap", () => {
    expectPolicyError(
      () =>
        selectBudgetRailRequirement(challenge({ amount: "100001" }), policy),
      "AMOUNT_EXCEEDS_REQUEST_LIMIT"
    );
  });

  it.each<[string, Partial<PaymentRequirements>, string]>([
    [
      "network",
      { network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" },
      "NETWORK_NOT_ALLOWED",
    ],
    [
      "asset",
      { asset: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" },
      "ASSET_NOT_ALLOWED",
    ],
    [
      "recipient",
      { payTo: "SysvarRent111111111111111111111111111111111" },
      "RECIPIENT_NOT_ALLOWED",
    ],
  ])("rejects the wrong %s with a deterministic code", (_, overrides, code) => {
    expectPolicyError(
      () => selectBudgetRailRequirement(challenge(overrides), policy),
      code
    );
  });

  it("rejects a resource hosted outside the allow-list", () => {
    const invalid = challenge();
    invalid.resource.url = "https://lookalike.example/api/research";
    expectPolicyError(
      () => selectBudgetRailRequirement(invalid, policy),
      "RESOURCE_ORIGIN_NOT_ALLOWED"
    );
  });

  it("rejects an unapproved facilitator fee payer", () => {
    expectPolicyError(
      () =>
        selectBudgetRailRequirement(
          challenge({
            extra: {
              feePayer: "Vote111111111111111111111111111111111111111",
            },
          }),
          policy
        ),
      "FEE_PAYER_NOT_ALLOWED"
    );
  });

  it.each(["0", "-1", "0.1", "1e5", "+100000", " 100000"])(
    "rejects malformed or non-positive amount %s",
    (amount) => {
      expectPolicyError(
        () => selectBudgetRailRequirement(challenge({ amount }), policy),
        "INVALID_AMOUNT"
      );
    }
  );

  it("rejects an unsafe settlement timeout", () => {
    expectPolicyError(
      () =>
        selectBudgetRailRequirement(
          challenge({ maxTimeoutSeconds: policy.maxTimeoutSeconds + 1 }),
          policy
        ),
      "TIMEOUT_NOT_ALLOWED"
    );
  });

  it("rejects a non-exact payment scheme", () => {
    expectPolicyError(
      () => selectBudgetRailRequirement(challenge({ scheme: "upto" }), policy),
      "EXACT_SCHEME_REQUIRED"
    );
  });

  it("rejects a malformed PaymentRequired document", () => {
    expectPolicyError(
      () => selectBudgetRailRequirement({ accepts: [] }, policy),
      "MALFORMED_PAYMENT_REQUIRED"
    );
  });
});
