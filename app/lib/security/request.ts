export function rejectCrossOriginMutation(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return forbidden();

  const origin = request.headers.get("origin");
  if (!origin) return;

  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      return forbidden();
    }
  } catch {
    return forbidden();
  }
}

function forbidden() {
  return Response.json(
    {
      error: "CROSS_ORIGIN_MUTATION_BLOCKED",
      message: "BudgetRail demo controls only accept same-origin requests.",
    },
    {
      status: 403,
      headers: { "cache-control": "no-store" },
    }
  );
}
