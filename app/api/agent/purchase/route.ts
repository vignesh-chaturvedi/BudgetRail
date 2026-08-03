import {
  getPhase3DemoRuntime,
  type Phase3DemoResult,
} from "../../../lib/phase3/demo-runtime";
import type { AgentPaymentEvent } from "../../../../packages/x402-adapter/src";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StreamMessage =
  | { type: "stage"; event: AgentPaymentEvent }
  | { type: "complete"; result: Phase3DemoResult }
  | { type: "error"; error: { code: string; message: string } };

export async function POST(request: Request) {
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
        const resourceUrl = new URL(
          "/api/merchant/research",
          request.url
        ).toString();
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
              error instanceof Error
                ? error.message
                : "The autonomous payment proof failed.",
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
