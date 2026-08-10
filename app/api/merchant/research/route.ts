import {
  getPhase3DemoRuntime,
  merchantResultToResponse,
} from "../../../lib/phase3/demo-runtime";
import { PAYMENT_SIGNATURE_HEADER } from "../../../../packages/x402-adapter/src";
import { safeErrorMessage } from "../../../../packages/security/src";
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
    const resourceUrl = new URL(
      "/api/merchant/research",
      request.url
    ).toString();
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
