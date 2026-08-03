import { describe, expect, it, vi } from "vitest";
import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import {
  BudgetRailMerchant,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  SOLANA_DEVNET_CAIP2,
  type BudgetRailFacilitator,
} from "../src";

const resourceUrl = "https://merchant.budgetrail.test/api/research";
const mint = "So11111111111111111111111111111111111111112";
const merchantAddress = "11111111111111111111111111111111";
const facilitatorAddress = "SysvarC1ock11111111111111111111111111111111";

function createFacilitator(overrides?: {
  verify?: VerifyResponse;
  settle?: SettleResponse;
}): BudgetRailFacilitator {
  return {
    verify: vi.fn().mockResolvedValue(overrides?.verify ?? { isValid: true }),
    settle: vi.fn().mockResolvedValue(
      overrides?.settle ?? {
        success: true,
        transaction: "merchant-test-signature",
        network: SOLANA_DEVNET_CAIP2,
      }
    ),
  };
}

function createMerchant(
  facilitator = createFacilitator(),
  now = new Date("2026-08-03T12:00:00.000Z")
) {
  return new BudgetRailMerchant(
    {
      network: SOLANA_DEVNET_CAIP2,
      asset: mint,
      payTo: merchantAddress,
      feePayer: facilitatorAddress,
      amount: 100_000n,
      maxTimeoutSeconds: 60,
      challengeTtlMs: 60_000,
      now: () => now,
      createId: () => "challenge-1",
    },
    facilitator
  );
}

async function issueChallenge(merchant: BudgetRailMerchant) {
  const result = await merchant.handleRequest({ resourceUrl });
  const header = result.headers[PAYMENT_REQUIRED_HEADER];
  if (!header) throw new Error("Missing challenge header");
  const required = decodePaymentRequiredHeader(header);
  return { result, requirement: required.accepts[0]! };
}

function paymentHeader(
  requirement: PaymentRequirements,
  transaction = "signed-transaction"
) {
  const payload: PaymentPayload = {
    x402Version: 2,
    accepted: requirement,
    payload: { transaction },
  };
  return encodePaymentSignatureHeader(payload);
}

describe("BudgetRailMerchant", () => {
  it("issues a one-time 0.10 USDC x402 challenge", async () => {
    const { result, requirement } = await issueChallenge(createMerchant());

    expect(result.status).toBe(402);
    expect(requirement).toMatchObject({
      scheme: "exact",
      network: SOLANA_DEVNET_CAIP2,
      asset: mint,
      amount: "100000",
      payTo: merchantAddress,
      maxTimeoutSeconds: 60,
    });
    expect(requirement.extra.budgetRail).toMatchObject({
      challengeId: "challenge-1",
    });
  });

  it("settles once and returns a useful protected artifact", async () => {
    const facilitator = createFacilitator();
    const merchant = createMerchant(facilitator);
    const { requirement } = await issueChallenge(merchant);
    const result = await merchant.handleRequest({
      resourceUrl,
      paymentSignature: paymentHeader(requirement),
    });

    expect(result.status).toBe(200);
    expect(result.headers[PAYMENT_RESPONSE_HEADER]).toBeTruthy();
    expect(result.body).toMatchObject({
      kind: "budgetrail.spend-safety-brief",
      payment: { amountBaseUnits: "100000" },
    });
    expect(result.body.findings).toHaveLength(3);
    expect(facilitator.verify).toHaveBeenCalledOnce();
    expect(facilitator.settle).toHaveBeenCalledOnce();
  });

  it("rejects the same challenge and transaction after fulfillment", async () => {
    const facilitator = createFacilitator();
    const merchant = createMerchant(facilitator);
    const { requirement } = await issueChallenge(merchant);
    const header = paymentHeader(requirement);

    expect(
      (await merchant.handleRequest({ resourceUrl, paymentSignature: header }))
        .status
    ).toBe(200);
    const replay = await merchant.handleRequest({
      resourceUrl,
      paymentSignature: header,
    });

    expect(replay.status).toBe(409);
    expect(replay.body).toMatchObject({ error: "PAYMENT_REPLAYED" });
    expect(facilitator.settle).toHaveBeenCalledOnce();
  });

  it("reserves the challenge before awaiting verification", async () => {
    let releaseVerification: (() => void) | undefined;
    const facilitator = createFacilitator();
    facilitator.verify = vi.fn().mockImplementation(
      () =>
        new Promise<VerifyResponse>((resolve) => {
          releaseVerification = () => resolve({ isValid: true });
        })
    );
    const merchant = createMerchant(facilitator);
    const { requirement } = await issueChallenge(merchant);
    const header = paymentHeader(requirement);

    const first = merchant.handleRequest({
      resourceUrl,
      paymentSignature: header,
    });
    await vi.waitFor(() => expect(facilitator.verify).toHaveBeenCalledOnce());
    const concurrent = await merchant.handleRequest({
      resourceUrl,
      paymentSignature: header,
    });
    releaseVerification?.();

    expect(concurrent.status).toBe(409);
    expect((await first).status).toBe(200);
    expect(facilitator.settle).toHaveBeenCalledOnce();
  });

  it("rejects a payment whose requirements were mutated", async () => {
    const merchant = createMerchant();
    const { requirement } = await issueChallenge(merchant);
    const mutated = { ...requirement, amount: "100001" };
    const result = await merchant.handleRequest({
      resourceUrl,
      paymentSignature: paymentHeader(mutated),
    });

    expect(result.status).toBe(402);
    expect(result.body).toMatchObject({ error: "REQUIREMENTS_MISMATCH" });
  });

  it("rejects stale challenges before facilitator verification", async () => {
    let current = new Date("2026-08-03T12:00:00.000Z");
    const facilitator = createFacilitator();
    const merchant = new BudgetRailMerchant(
      {
        network: SOLANA_DEVNET_CAIP2,
        asset: mint,
        payTo: merchantAddress,
        feePayer: facilitatorAddress,
        amount: 100_000n,
        maxTimeoutSeconds: 60,
        challengeTtlMs: 1_000,
        now: () => current,
        createId: () => "stale-challenge",
      },
      facilitator
    );
    const { requirement } = await issueChallenge(merchant);
    current = new Date("2026-08-03T12:00:02.000Z");
    const result = await merchant.handleRequest({
      resourceUrl,
      paymentSignature: paymentHeader(requirement),
    });

    expect(result.status).toBe(402);
    expect(result.body).toMatchObject({ error: "CHALLENGE_EXPIRED" });
    expect(facilitator.verify).not.toHaveBeenCalled();
  });

  it("returns a retryable response when verification transport fails", async () => {
    const facilitator = createFacilitator();
    facilitator.verify = vi
      .fn()
      .mockRejectedValueOnce(new Error("RPC unavailable"))
      .mockResolvedValueOnce({ isValid: true });
    const merchant = createMerchant(facilitator);
    const { requirement } = await issueChallenge(merchant);

    const first = await merchant.handleRequest({
      resourceUrl,
      paymentSignature: paymentHeader(requirement),
    });
    const retry = await merchant.handleRequest({
      resourceUrl,
      paymentSignature: paymentHeader(requirement, "fresh-transaction"),
    });

    expect(first.status).toBe(502);
    expect(first.body).toMatchObject({ error: "FACILITATOR_UNAVAILABLE" });
    expect(retry.status).toBe(200);
  });
});
