import { resetPhase4DemoRuntime } from "../../../lib/phase3/demo-runtime";
import { safeErrorMessage } from "../../../../packages/security/src";
import { rejectCrossOriginMutation } from "../../../lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;

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
