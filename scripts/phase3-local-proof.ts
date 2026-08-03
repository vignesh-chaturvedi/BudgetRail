import {
  Phase3DemoRuntime,
  merchantResultToResponse,
} from "../app/lib/phase3/demo-runtime";
import { PAYMENT_SIGNATURE_HEADER } from "../packages/x402-adapter/src";

async function main() {
  const runtime = await Phase3DemoRuntime.create();
  const resourceUrl = "https://merchant.budgetrail.test/api/merchant/research";
  let paidHeader: string | undefined;

  try {
    const fetchFn: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);
      paidHeader = headers.get(PAYMENT_SIGNATURE_HEADER) ?? paidHeader;
      const result = await runtime.merchant.handleRequest({
        resourceUrl: url,
        paymentSignature: headers.get(PAYMENT_SIGNATURE_HEADER),
      });
      return merchantResultToResponse(result);
    };

    const result = await runtime.runPurchase({ resourceUrl, fetchFn });
    if (!paidHeader) throw new Error("The agent did not retry with payment");

    const replay = await runtime.merchant.handleRequest({
      resourceUrl,
      paymentSignature: paidHeader,
    });
    if (replay.status !== 409) {
      throw new Error("The merchant did not reject the replayed payment");
    }

    console.log(
      JSON.stringify(
        {
          status: "phase-3-autonomous-payment-proof-complete",
          ...result,
          replay: {
            status: replay.status,
            error:
              "error" in replay.body ? String(replay.body.error) : "unknown",
          },
        },
        null,
        2
      )
    );
  } finally {
    runtime.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
