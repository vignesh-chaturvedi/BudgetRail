import {
  Phase3DemoRuntime,
  merchantResultToResponse,
} from "../app/lib/phase3/demo-runtime";
import { PAYMENT_SIGNATURE_HEADER } from "../packages/x402-adapter/src";
import { safeErrorMessage } from "../packages/security/src";

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
    const overBudget = await runtime.proveOverBudgetGuardrail({
      freshProgramSimulation: true,
    });
    const afterOverBudget = await runtime.getPhase4State();
    const expired = await runtime.proveExpiredGuardrail();
    const afterExpiry = await runtime.getPhase4State();
    const revoked = await runtime.revokeAllowance();

    let postRevokeError = "";
    try {
      await runtime.runPurchase({ resourceUrl, fetchFn });
    } catch (error) {
      postRevokeError = safeErrorMessage(
        error,
        "Post-revocation payment denied"
      );
    }
    const final = await runtime.getPhase4State();

    const activityKinds = new Set(
      final.activities.map((activity) => activity.kind)
    );
    if (
      seeded.budget.remainingBaseUnits !== "2000000" ||
      purchase.allowance.paidBaseUnits !== "100000" ||
      afterPurchase.budget.remainingBaseUnits !== "1900000" ||
      afterOverBudget.budget.remainingBaseUnits !== "1900000" ||
      expired.remainingBefore !== expired.remainingAfter ||
      expired.merchantBefore !== expired.merchantAfter ||
      afterExpiry.budget.remainingBaseUnits !== "1900000" ||
      revoked.railStatus !== "revoked" ||
      !postRevokeError ||
      !activityKinds.has("payment-settled") ||
      !activityKinds.has("over-budget-denied") ||
      !activityKinds.has("expired-payment-denied") ||
      !activityKinds.has("payment-denied")
    ) {
      throw new Error("Phase 5 adversarial proof assertions failed");
    }

    console.log(
      JSON.stringify(
        {
          status: "phase-5-adversarial-proof-complete",
          execution: final.execution,
          headlineOutcomes: {
            delegatedPayment: {
              result: "settled",
              amountBaseUnits: purchase.allowance.paidBaseUnits,
              signature: purchase.transaction,
            },
            overBudget: {
              result: "denied-before-settlement",
              requestedBaseUnits: "3000000",
              policyCode: "AMOUNT_EXCEEDS_REQUEST_LIMIT",
              programSimulation: "rejected",
              remainingBaseUnits: afterOverBudget.budget.remainingBaseUnits,
              activity: overBudget.title,
            },
            expired: {
              result: expired.verification,
              remainingBefore: expired.remainingBefore,
              remainingAfter: expired.remainingAfter,
              merchantBefore: expired.merchantBefore,
              merchantAfter: expired.merchantAfter,
            },
            postRevocation: {
              result: "denied-before-payment",
              error: postRevokeError,
              railStatus: final.railStatus,
            },
          },
          invariant: {
            capBeforeBaseUnits: seeded.budget.remainingBaseUnits,
            remainingAfterValidPaymentBaseUnits:
              afterPurchase.budget.remainingBaseUnits,
            remainingAfterDeniedProbesBaseUnits:
              afterExpiry.budget.remainingBaseUnits,
          },
          activityKinds: [...activityKinds],
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
  console.error(safeErrorMessage(error, "Phase 5 proof failed"));
  process.exitCode = 1;
});
