import { redactSensitiveText } from "../../../packages/security/src";

/**
 * Startup configuration for the disposable judge rail's Surfpool ledger.
 *
 * Surfpool 1.4 stops answering ledger state after roughly 1,050 produced slots.
 * The failure is partial and therefore invisible from outside: `getHealth` and
 * `getVersion` keep returning while `getSlot`, `getAccountInfo`, and the whole
 * console hang. Measured directly — an offline surfnet starts at slot 0 and
 * stops answering at slot ~1,060 — and it reproduces the same way whether the
 * ledger forks devnet or not, and on every block-production mode.
 *
 * At the default tick rate the rail produces ~13 slots per second, so it dies
 * about 90 seconds after it starts, which is shorter than any review. Slowing
 * the tick is what buys a usable rail: the budget is spent in slots, not
 * seconds, so a slower clock stretches the same 1,050 slots across hours.
 * Confirmations stay immediate because a transaction still lands in the next
 * produced block.
 *
 * `probeLedgerLiveness` covers the remainder: if a rail does exhaust itself,
 * readiness fails closed instead of serving a frozen console.
 */
export const BLOCK_PRODUCTION_MODES = [
  "clock",
  "transaction",
  "manual",
] as const;

export type BlockProductionMode = (typeof BLOCK_PRODUCTION_MODES)[number];

export const DEFAULT_BLOCK_PRODUCTION_MODE: BlockProductionMode = "transaction";

export function resolveBlockProductionMode(
  env: NodeJS.ProcessEnv = process.env
): BlockProductionMode {
  const configured = env.BUDGETRAIL_BLOCK_PRODUCTION_MODE?.trim();
  return BLOCK_PRODUCTION_MODES.includes(configured as BlockProductionMode)
    ? (configured as BlockProductionMode)
    : DEFAULT_BLOCK_PRODUCTION_MODE;
}

/**
 * Slot tick for the rail. Surfpool's ~1,050-slot budget is what actually limits
 * rail life, so this is the dial that decides how long a reviewer's session
 * lasts. The default measured out to roughly one slot every 30 seconds, which
 * puts exhaustion many hours away instead of 90 seconds.
 */
export const DEFAULT_SLOT_TIME_MS = 400;

/**
 * A tick this small exhausts the slot budget while the rail is still being
 * seeded, so the container never reaches a healthy state and the platform
 * restarts it forever with nothing in the logs to explain why. A mistyped `40`
 * still leaves a usable rail; a mistyped `4` does not, so refuse the range
 * instead of shipping a demo that cannot start.
 */
export const MIN_SLOT_TIME_MS = 100;

export function resolveSlotTimeMs(env: NodeJS.ProcessEnv = process.env) {
  const configured = Number(env.BUDGETRAIL_SLOT_TIME_MS?.trim());
  return Number.isFinite(configured) && configured >= MIN_SLOT_TIME_MS
    ? configured
    : DEFAULT_SLOT_TIME_MS;
}

/**
 * Upstream devnet endpoint the rail forks from.
 *
 * Server-only: this URL carries an API key, so it must never become a
 * `NEXT_PUBLIC_*` variable or reach a browser.
 */
export const PUBLIC_DEVNET_RPC = "https://api.devnet.solana.com";

export function resolveDevnetForkRpcUrl(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.BUDGETRAIL_DEVNET_RPC_URL?.trim();
  if (!configured) return PUBLIC_DEVNET_RPC;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    return PUBLIC_DEVNET_RPC;
  }

  const isLoopback =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !isLoopback) return PUBLIC_DEVNET_RPC;

  return configured;
}

/** Safe for logs, readiness output, and anything a visitor can see. */
export function describeDevnetForkRpc(env: NodeJS.ProcessEnv = process.env) {
  const url = resolveDevnetForkRpcUrl(env);
  if (url === PUBLIC_DEVNET_RPC) {
    return { host: "api.devnet.solana.com", dedicated: false };
  }

  try {
    return { host: new URL(url).hostname, dedicated: true };
  } catch {
    return { host: redactSensitiveText(url), dedicated: true };
  }
}
