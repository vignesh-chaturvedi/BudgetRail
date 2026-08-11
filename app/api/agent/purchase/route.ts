import {
  getPhase3DemoRuntime,
  type Phase3DemoResult,
} from "../../../lib/phase3/demo-runtime";
import type { AgentPaymentEvent } from "../../../../packages/x402-adapter/src";
import { safeErrorMessage } from "../../../../packages/security/src";
import { resolveMerchantResourceUrl } from "../../../lib/phase3/merchant-url";
import { rejectCrossOriginMutation } from "../../../lib/security/request";
import { enforceRateLimit } from "../../../lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StreamMessage =
  | { type: "stage"; event: AgentPaymentEvent }
  | { type: "complete"; result: Phase3DemoResult }
  | { type: "error"; error: { code: string; message: string } };

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const rateLimited = enforceRateLimit(request, {
    action: "agent-purchase",
    limit: 8,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (message: StreamMessage) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      };

      try {
        send({
          type: "stage",
          event: {
            stage: "bootstrapping",
            message: "Starting an isolated Surfpool devnet proof rail.",
            at: new Date().toISOString(),
          },
        });
        const demo = await getPhase3DemoRuntime();
        const resourceUrl = resolveMerchantResourceUrl();
        const result = await demo.runPurchase({
          resourceUrl,
          fetchFn: fetch,
          onEvent: (event) => send({ type: "stage", event }),
        });
        send({ type: "complete", result });
      } catch (error) {
        send({
          type: "error",
          error: {
            code:
              error && typeof error === "object" && "code" in error
                ? String(error.code)
                : "PHASE_3_DEMO_FAILED",
            message:
              safeErrorMessage(
                error,
                "The autonomous payment proof failed."
              ),
          },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
