export function rejectCrossOriginMutation(
  request: Request,
  configuredPublicUrl = process.env.BUDGETRAIL_PUBLIC_URL
) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return forbidden();

  const origin = request.headers.get("origin");
  if (!origin) return;

  try {
    const expectedOrigin = configuredPublicUrl
      ? new URL(configuredPublicUrl).origin
      : new URL(request.url).origin;
    if (new URL(origin).origin !== expectedOrigin) {
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
