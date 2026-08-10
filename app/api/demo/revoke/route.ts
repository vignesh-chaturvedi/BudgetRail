import { getPhase3DemoRuntime } from "../../../lib/phase3/demo-runtime";
import { safeErrorMessage } from "../../../../packages/security/src";
import { rejectCrossOriginMutation } from "../../../lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;

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
