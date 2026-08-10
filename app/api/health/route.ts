export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      status: "ok",
      service: "budgetrail",
      runtime: "nodejs",
      buildSha: process.env.BUDGETRAIL_BUILD_SHA ?? "development",
    },
    { headers: { "cache-control": "no-store" } }
  );
}
