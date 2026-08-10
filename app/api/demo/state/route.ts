import { getPhase3DemoRuntime } from "../../../lib/phase3/demo-runtime";
import { safeErrorMessage } from "../../../../packages/security/src";
import { enforceRateLimit } from "../../../lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rateLimited = enforceRateLimit(request, {
    action: "demo-state",
    limit: 60,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  try {
    const demo = await getPhase3DemoRuntime();
    return Response.json(await demo.getPhase4State(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error: "DEMO_STATE_UNAVAILABLE",
        message: safeErrorMessage(
          error,
          "The judge console could not load its Solana state."
        ),
      },
      { status: 503 }
    );
  }
}
