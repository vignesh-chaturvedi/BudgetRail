import { peekPhase3DemoRuntime } from "../phase3/demo-runtime";

export const LEDGER_LIVENESS_TIMEOUT_MS = 4_000;

export type LedgerLiveness = {
  /** `idle` means no rail has been seeded yet, which is a healthy cold start. */
  status: "idle" | "live" | "stalled";
  slot?: number;
  detail: string;
};

/**
 * Confirms the rail still answers a state read.
 *
 * Surfpool's failure mode is partial: it keeps serving `getHealth` and
 * `getVersion` long after `getSlot` and `getAccountInfo` have stopped
 * responding, so a probe that only asks whether the process is up reports a
 * frozen console as healthy. This asks the one question that distinguishes
 * them.
 */
export async function probeLedgerLiveness(): Promise<LedgerLiveness> {
  const runtimePromise = peekPhase3DemoRuntime();
  if (!runtimePromise) {
    return {
      status: "idle",
      detail: "No judge rail has been seeded yet.",
    };
  }

  try {
    const demo = await runtimePromise;
    const response = await fetch(demo.ledgerRpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot" }),
      signal: AbortSignal.timeout(LEDGER_LIVENESS_TIMEOUT_MS),
    });

    const body = (await response.json()) as { result?: number };
    if (typeof body.result !== "number") {
      return {
        status: "stalled",
        detail: "The judge ledger answered without a slot.",
      };
    }

    return {
      status: "live",
      slot: body.result,
      detail: "The judge ledger is answering state reads.",
    };
  } catch {
    return {
      status: "stalled",
      detail:
        "The judge ledger stopped answering state reads. Recycle the container or reset the rail.",
    };
  }
}
