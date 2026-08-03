import { getPhase3DemoRuntime } from "../../../lib/phase3/demo-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const demo = await getPhase3DemoRuntime();
    return Response.json(await demo.getPhase4State(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error: "DEMO_STATE_UNAVAILABLE",
        message:
          error instanceof Error
            ? error.message
            : "The judge console could not load its Solana state.",
      },
      { status: 503 }
    );
  }
}
