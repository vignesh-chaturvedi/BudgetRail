import { resolveBuildSha } from "../../lib/release/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      status: "ok",
      service: "budgetrail",
      runtime: "nodejs",
      buildSha: resolveBuildSha(),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
