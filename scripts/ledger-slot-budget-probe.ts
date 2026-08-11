/**
 * Measures how long a Surfpool rail keeps answering ledger state.
 *
 * Surfpool 1.4 stops serving state reads after roughly 1,050 produced slots,
 * and it fails partially: `getHealth` keeps returning `ok` while `getSlot`
 * hangs, so nothing outside the ledger looks wrong. `BUDGETRAIL_SLOT_TIME_MS`
 * is tuned against that budget, so re-run this after any Surfpool upgrade
 * before trusting the configured value.
 *
 *   pnpm ledger:budget                      # the deployed configuration
 *   SOAK_OFFLINE=1 pnpm ledger:budget       # no devnet fork
 *   SOAK_SLOT_TIME_MS=0 pnpm ledger:budget  # Surfpool's own default tick
 *
 * A healthy result is `getSlot` still answering after ten minutes.
 */
import { Surfnet } from "@solana/surfpool";
import {
  resolveBlockProductionMode,
  resolveDevnetForkRpcUrl,
  resolveSlotTimeMs,
} from "../app/lib/ledger/rail-config";

const PROBE_INTERVAL_MS = 5_000;
const PROBE_TIMEOUT_MS = 8_000;
const MAX_PROBES = 240;

async function rpc(url: string, method: string) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const body = (await response.json()) as { result?: unknown };
    return { ms: Date.now() - startedAt, result: body.result };
  } catch {
    return { ms: Date.now() - startedAt, result: undefined };
  }
}

async function main() {
  const offline = process.env.SOAK_OFFLINE === "1";
  const slotTimeMs =
    process.env.SOAK_SLOT_TIME_MS === "0"
      ? undefined
      : Number(process.env.SOAK_SLOT_TIME_MS) || resolveSlotTimeMs();
  const remoteRpcUrl = resolveDevnetForkRpcUrl();
  const blockProductionMode = resolveBlockProductionMode();

  console.log(
    `offline=${offline} slotTimeMs=${slotTimeMs ?? "surfpool-default"} ` +
      `mode=${blockProductionMode} remote=${offline ? "none" : new URL(remoteRpcUrl).hostname}`
  );

  const surfnet = Surfnet.startWithConfig({
    offline,
    ...(offline ? {} : { remoteRpcUrl }),
    ...(slotTimeMs ? { slotTimeMs } : {}),
    blockProductionMode,
  });

  const startedAt = Date.now();
  let firstSlot: number | undefined;

  try {
    for (let probe = 0; probe < MAX_PROBES; probe += 1) {
      const slot = await rpc(surfnet.rpcUrl, "getSlot");
      const health = await rpc(surfnet.rpcUrl, "getHealth");
      const elapsed = Math.round((Date.now() - startedAt) / 1000);

      if (slot.result === undefined) {
        const produced =
          firstSlot === undefined ? "unknown" : `~${Number(firstSlot)}+`;
        console.log(
          `t+${elapsed}s  getSlot=STALLED (${slot.ms}ms)  getHealth=${JSON.stringify(health.result)}`
        );
        console.log(
          `\nRail stopped answering state reads after ${elapsed}s (first slot ${produced}).`
        );
        console.log(
          "Raise BUDGETRAIL_SLOT_TIME_MS to stretch the slot budget."
        );
        return;
      }

      firstSlot ??= slot.result as number;
      const produced = (slot.result as number) - firstSlot;
      console.log(
        `t+${elapsed}s  slot=${slot.result} (+${produced} produced, ${slot.ms}ms)`
      );

      await new Promise((resolve) => setTimeout(resolve, PROBE_INTERVAL_MS));
    }

    console.log("\nRail still answering at the end of the probe window.");
  } finally {
    surfnet.stop();
  }
}

void main();
