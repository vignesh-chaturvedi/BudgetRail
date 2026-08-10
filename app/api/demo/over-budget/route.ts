import { getPhase3DemoRuntime } from "../../../lib/phase3/demo-runtime";
import { safeErrorMessage } from "../../../../packages/security/src";
import { rejectCrossOriginMutation } from "../../../lib/security/request";
import { enforceRateLimit } from "../../../lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const rateLimited = enforceRateLimit(request, {
    action: "demo-over-budget",
    limit: 12,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  try {
    const demo = await getPhase3DemoRuntime();
    await demo.proveOverBudgetGuardrail();
    return Response.json(await demo.getPhase4State(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error: "OVER_BUDGET_PROOF_FAILED",
        message: safeErrorMessage(
          error,
          "The 3.00 USDC guardrail proof could not complete."
        ),
      },
      { status: 503 }
    );
  }
}
