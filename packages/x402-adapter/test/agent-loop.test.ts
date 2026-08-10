import { generateKeyPairSigner } from "@solana/kit";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { describe, expect, it } from "vitest";
import {
  AgentPaymentError,
  PAYMENT_REQUIRED_HEADER,
  SOLANA_DEVNET_CAIP2,
  runAutonomousPaymentLoop,
} from "../src";

const resourceUrl = "https://merchant.budgetrail.test/api/research";

async function inputs() {
  const owner = await generateKeyPairSigner();
  const agent = await generateKeyPairSigner();
  const merchant = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();
  const facilitator = await generateKeyPairSigner();
  const required: PaymentRequired = {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description: "Protected result",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: mint.address,
        amount: "100000",
        payTo: merchant.address,
        maxTimeoutSeconds: 60,
        extra: { feePayer: facilitator.address },
      },
    ],
  };
  return {
    resourceUrl,
    policy: {
      network: SOLANA_DEVNET_CAIP2,
      asset: mint.address,
      payTo: merchant.address,
      maxAmount: 100_000n,
      maxTimeoutSeconds: 120,
      allowedResourceOrigins: [new URL(resourceUrl).origin],
      allowedFeePayers: [facilitator.address],
    } as const,
    delegator: owner.address,
    delegatee: agent,
    delegationNonce: 9n,
    required,
  };
}

async function expectAgentError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AgentPaymentError);
    expect((error as AgentPaymentError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("autonomous payment exceptional conditions", () => {
  it("fails closed when the merchant transport is unavailable", async () => {
    const input = await inputs();
    await expectAgentError(
      runAutonomousPaymentLoop({
        ...input,
        fetchFn: async () => {
          throw new Error("Authorization: Bearer must-not-leak");
        },
      }),
      "MERCHANT_UNAVAILABLE"
    );
  });

  it("turns a merchant 503 into an actionable unavailable error", async () => {
    const input = await inputs();
    await expectAgentError(
      runAutonomousPaymentLoop({
        ...input,
        fetchFn: async () => Response.json({}, { status: 503 }),
      }),
      "MERCHANT_UNAVAILABLE"
    );
  });

  it("fails before signing when RPC cannot provide a blockhash", async () => {
    const input = await inputs();
    const challenge = new Response(null, {
      status: 402,
      headers: {
        [PAYMENT_REQUIRED_HEADER]: encodePaymentRequiredHeader(input.required),
      },
    });
    await expectAgentError(
      runAutonomousPaymentLoop({
        ...input,
        rpcUrl: "http://127.0.0.1:1",
        fetchFn: async () => challenge.clone(),
      }),
      "RPC_UNAVAILABLE"
    );
  });
});
