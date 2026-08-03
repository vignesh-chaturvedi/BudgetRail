import {
  Phase3DemoRuntime,
  merchantResultToResponse,
} from "../app/lib/phase3/demo-runtime";
import { PAYMENT_SIGNATURE_HEADER } from "../packages/x402-adapter/src";

async function main() {
  const runtime = await Phase3DemoRuntime.create();
  const resourceUrl = "https://merchant.budgetrail.test/api/merchant/research";

  try {
    const seeded = await runtime.getPhase4State();
    const fetchFn: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);
      return merchantResultToResponse(
        await runtime.merchant.handleRequest({
          resourceUrl: url,
          paymentSignature: headers.get(PAYMENT_SIGNATURE_HEADER),
        })
      );
    };

    const purchase = await runtime.runPurchase({ resourceUrl, fetchFn });
    const afterPurchase = await runtime.getPhase4State();
    const revoked = await runtime.revokeAllowance();

    let postRevokeError = "";
    try {
      await runtime.runPurchase({ resourceUrl, fetchFn });
    } catch (error) {
      postRevokeError =
        error instanceof Error ? error.message : "post-revoke payment denied";
    }
    const final = await runtime.getPhase4State();

    if (
      seeded.identity.operationalWallet !== seeded.participants.agent ||
      seeded.budget.remainingBaseUnits !== "2000000" ||
      afterPurchase.budget.remainingBaseUnits !== "1900000" ||
      revoked.railStatus !== "revoked" ||
      !postRevokeError ||
      !final.activities.some((activity) => activity.kind === "payment-denied")
    ) {
      throw new Error("Phase 4 proof assertions failed");
    }

    console.log(
      JSON.stringify(
        {
          status: "phase-4-operator-story-proof-complete",
          execution: final.execution,
          identity: seeded.identity,
          participants: seeded.participants,
          budget: {
            beforeBaseUnits: seeded.budget.remainingBaseUnits,
            paidBaseUnits: purchase.allowance.paidBaseUnits,
            afterBaseUnits: afterPurchase.budget.remainingBaseUnits,
            unusedAtRevocationBaseUnits: revoked.budget.remainingBaseUnits,
          },
          railStatus: final.railStatus,
          postRevokeError,
          activities: final.activities,
        },
        null,
        2
      )
    );
  } finally {
    runtime.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
