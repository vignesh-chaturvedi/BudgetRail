import {
  evaluateReleaseReadiness,
  publicReadiness,
} from "../../lib/release/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = evaluateReleaseReadiness();
  return Response.json(publicReadiness(readiness), {
    status: readiness.ready ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
