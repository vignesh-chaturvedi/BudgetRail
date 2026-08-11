import {
  getPhase3DemoRuntime,
  merchantResultToResponse,
} from "../../../lib/phase3/demo-runtime";
import { PAYMENT_SIGNATURE_HEADER } from "../../../../packages/x402-adapter/src";
import { safeErrorMessage } from "../../../../packages/security/src";
import { resolveMerchantResourceUrl } from "../../../lib/phase3/merchant-url";
import { enforceRateLimit } from "../../../lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rateLimited = enforceRateLimit(request, {
    action: "merchant-research",
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  try {
    const demo = await getPhase3DemoRuntime();
    // Must be the identical string the agent pins its origin policy to, so both
    // sides read it from one place rather than each re-deriving it from
    // `request.url` — those disagree as soon as a proxy, a bare IP, or Next's
    // own host normalisation is involved.
    const resourceUrl = resolveMerchantResourceUrl();
    const result = await demo.merchant.handleRequest({
      resourceUrl,
      paymentSignature: request.headers.get(PAYMENT_SIGNATURE_HEADER),
    });
    return merchantResultToResponse(result);
  } catch (error) {
    return Response.json(
      {
        error: "DEMO_RUNTIME_UNAVAILABLE",
        message: safeErrorMessage(
          error,
          "The local Solana proof runtime could not start."
        ),
      },
      { status: 503 }
    );
  }
}
