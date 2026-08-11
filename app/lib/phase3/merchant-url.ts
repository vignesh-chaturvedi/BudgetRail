/**
 * Where the agent should call the x402 merchant.
 *
 * The agent and the merchant are both routes in this one process, so the
 * request between them must stay on the loopback interface. Deriving it from
 * the incoming `request.url` instead sends the container out to its own public
 * hostname, and a managed host will not hairpin that back — the connection
 * simply fails and the payment surfaces as `MERCHANT_UNAVAILABLE`. It works
 * locally only because `request.url` is already `127.0.0.1` there, which is why
 * it survived both local and container rehearsals and broke on the first real
 * deployment.
 *
 * The merchant advertises whichever origin it is called on, and the payment
 * policy pins `allowedResourceOrigins` to that same origin, so keeping the call
 * on loopback leaves the origin check self-consistent and just as strict.
 */
export const MERCHANT_RESOURCE_PATH = "/api/merchant/research";

export function resolveMerchantResourceUrl(
  env: NodeJS.ProcessEnv = process.env
) {
  const port = env.PORT?.trim() || "3000";
  return new URL(MERCHANT_RESOURCE_PATH, `http://127.0.0.1:${port}`).toString();
}
