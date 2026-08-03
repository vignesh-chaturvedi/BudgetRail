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

  it.each<[string, Partial<PaymentRequirements>]>([
    ["network", { network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" }],
    ["asset", { asset: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" }],
    ["recipient", { payTo: "SysvarRent111111111111111111111111111111111" }],
  ])("rejects the wrong %s", (_, overrides) => {
    expect(() =>
      selectBudgetRailRequirement(challenge(overrides), policy)
    ).toThrow(PaymentPolicyError);
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

  it("rejects a malformed or non-positive amount", () => {
    expectPolicyError(
      () => selectBudgetRailRequirement(challenge({ amount: "0" }), policy),
      "INVALID_AMOUNT"
    );
  });
});
