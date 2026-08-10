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
    action: "demo-revoke",
    limit: 6,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  try {
    const demo = await getPhase3DemoRuntime();
    return Response.json(await demo.revokeAllowance(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error: "REVOCATION_FAILED",
        message: safeErrorMessage(
          error,
          "The kill switch transaction could not be confirmed."
        ),
      },
      { status: 503 }
    );
  }
}
