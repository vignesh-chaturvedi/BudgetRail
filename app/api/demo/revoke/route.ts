import { getPhase3DemoRuntime } from "../../../lib/phase3/demo-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const demo = await getPhase3DemoRuntime();
    return Response.json(await demo.revokeAllowance(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error: "REVOCATION_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "The kill switch transaction could not be confirmed.",
      },
      { status: 503 }
    );
  }
}
