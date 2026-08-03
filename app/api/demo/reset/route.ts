import { resetPhase4DemoRuntime } from "../../../lib/phase3/demo-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const demo = await resetPhase4DemoRuntime();
    return Response.json(await demo.getPhase4State(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error: "DEMO_RESET_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "A fresh judge rail could not be seeded.",
      },
      { status: 503 }
    );
  }
}
