import { resetPhase4DemoRuntime } from "../../../lib/phase3/demo-runtime";
import { safeErrorMessage } from "../../../../packages/security/src";
import { rejectCrossOriginMutation } from "../../../lib/security/request";
import { enforceRateLimit } from "../../../lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const rateLimited = enforceRateLimit(request, {
    action: "demo-reset",
    limit: 3,
    windowMs: 10 * 60_000,
  });
  if (rateLimited) return rateLimited;

  try {
    const demo = await resetPhase4DemoRuntime();
    return Response.json(await demo.getPhase4State(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error: "DEMO_RESET_FAILED",
        message: safeErrorMessage(
          error,
          "A fresh judge rail could not be seeded."
        ),
      },
      { status: 503 }
    );
  }
}
