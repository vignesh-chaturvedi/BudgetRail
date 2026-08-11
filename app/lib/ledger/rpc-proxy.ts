/**
 * Read-only JSON-RPC exposure for the judge rail's isolated Surfpool ledger.
 *
 * The demo ledger lives inside the container on an ephemeral loopback port, so
 * a reviewer's browser can never reach it directly. Explorer links are only
 * meaningful if the ledger answers on the public HTTPS origin, and that
 * endpoint must stay strictly read-only: Surfpool exposes `surfnet_*` cheat
 * codes that could otherwise be used to forge the very state the demo claims
 * to prove.
 */

export const LEDGER_RPC_PATH = "/api/ledger/rpc";

export const MAX_LEDGER_RPC_BODY_BYTES = 64 * 1024;
export const MAX_LEDGER_RPC_BATCH = 12;
export const LEDGER_RPC_UPSTREAM_TIMEOUT_MS = 10_000;

export const SOLANA_EXPLORER_ORIGIN = "https://explorer.solana.com";

/**
 * Every Solana JSON-RPC HTTP method that only reads ledger state. Solana
 * Explorer draws its cluster header, account views, and transaction views
 * exclusively from this set.
 */
export const READ_ONLY_RPC_METHODS: ReadonlySet<string> = new Set([
  "getAccountInfo",
  "getBalance",
  "getBlock",
  "getBlockCommitment",
  "getBlockHeight",
  "getBlockProduction",
  "getBlockTime",
  "getBlocks",
  "getBlocksWithLimit",
  "getClusterNodes",
  "getEpochInfo",
  "getEpochSchedule",
  "getFeeForMessage",
  "getFirstAvailableBlock",
  "getGenesisHash",
  "getHealth",
  "getHighestSnapshotSlot",
  "getIdentity",
  "getInflationGovernor",
  "getInflationRate",
  "getInflationReward",
  "getLatestBlockhash",
  "getLeaderSchedule",
  "getMaxRetransmitSlot",
  "getMaxShredInsertSlot",
  "getMinimumBalanceForRentExemption",
  "getMultipleAccounts",
  "getRecentPerformanceSamples",
  "getRecentPrioritizationFees",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getSlot",
  "getSlotLeader",
  "getSlotLeaders",
  "getStakeMinimumDelegation",
  "getSupply",
  "getTokenAccountBalance",
  "getTokenAccountsByDelegate",
  "getTokenAccountsByOwner",
  "getTokenSupply",
  "getTransaction",
  "getTransactionCount",
  "getVersion",
  "getVoteAccounts",
  "isBlockhashValid",
  "minimumLedgerSlot",
]);

/**
 * Named here so the exclusion is a reviewable decision rather than an
 * accident of allowlist drafting. Anything absent from
 * {@link READ_ONLY_RPC_METHODS} is rejected regardless; this list documents the
 * methods that exist upstream and are deliberately withheld.
 */
export const BLOCKED_RPC_METHODS: ReadonlySet<string> = new Set([
  "requestAirdrop",
  "sendTransaction",
  "simulateTransaction",
]);

/**
 * Read-only, but withheld anyway: these enumerate the whole account set, which
 * a devnet fork cannot answer cheaply. `getLargestAccounts` was observed to
 * hang the embedded Surfpool ledger outright — Solana Explorer issues it when
 * it prefetches its own home page, which is enough to take the judge rail down
 * mid-review. None of them are needed to verify a signature or an account, so
 * the demo trades the capability for a rail that cannot be stalled.
 */
export const EXCLUDED_SCAN_METHODS: ReadonlySet<string> = new Set([
  "getLargestAccounts",
  "getProgramAccounts",
  "getTokenLargestAccounts",
]);

/**
 * Upstream calls allowed to be in flight at once. The judge rail is a single
 * process-local ledger, so a burst must queue-and-shed rather than pile onto
 * Surfpool until it stops answering.
 */
export const MAX_INFLIGHT_LEDGER_CALLS = 6;

type JsonRpcCall = { method: string; id?: unknown };

export type LedgerRpcPlan =
  /** Malformed or oversized envelope — a transport-level failure. */
  | { outcome: "protocol-error"; status: number; code: number; message: string }
  /** Nothing survived the allowlist; answer without touching the ledger. */
  | { outcome: "reject-all"; body: unknown; methods: string[] }
  /**
   * Forward the allowed calls and merge in the refusals. Surfpool answers one
   * call per request — it rejects a JSON-RPC array outright — so the calls stay
   * separate here and the route issues them individually.
   */
  | {
      outcome: "forward";
      allowedCalls: unknown[];
      rejectedResponses: unknown[];
      isBatch: boolean;
      methods: string[];
    };

function protocolError(
  status: number,
  code: number,
  message: string
): LedgerRpcPlan {
  return { outcome: "protocol-error", status, code, message };
}

function isJsonRpcCall(value: unknown): value is JsonRpcCall {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return typeof (value as { method?: unknown }).method === "string";
}

function refusalMessage(method: string) {
  return EXCLUDED_SCAN_METHODS.has(method)
    ? `${method} is not available. Full-ledger scans are withheld because they can stall this single isolated judge rail.`
    : `${method} is not available. The BudgetRail judge ledger is exposed read-only.`;
}

/**
 * Plans how to answer a parsed JSON-RPC body.
 *
 * A refused method is answered the way a real validator answers an unsupported
 * one: HTTP 200 carrying a `-32601` error against the caller's own id. Solana
 * Explorer probes optional enhanced methods (`getAsset`,
 * `getTransactionsForAddress`) on every account view and only falls back
 * cleanly when the refusal arrives in that shape — an HTTP error status leaves
 * its account page spinning forever. Calls are judged individually, as a
 * validator would; a refusal never reaches the ledger either way.
 */
export function planLedgerRpcRequest(payload: unknown): LedgerRpcPlan {
  const isBatch = Array.isArray(payload);
  const calls = isBatch ? payload : [payload];

  if (isBatch && calls.length === 0) {
    return protocolError(
      400,
      -32600,
      "An empty JSON-RPC batch is not a valid request."
    );
  }

  if (calls.length > MAX_LEDGER_RPC_BATCH) {
    return protocolError(
      400,
      -32600,
      `This public ledger endpoint accepts at most ${MAX_LEDGER_RPC_BATCH} calls per batch.`
    );
  }

  const allowed: JsonRpcCall[] = [];
  const rejectedResponses: unknown[] = [];
  const methods: string[] = [];

  for (const call of calls) {
    if (!isJsonRpcCall(call)) {
      return protocolError(
        400,
        -32600,
        "Each entry must be a JSON-RPC 2.0 call object."
      );
    }

    methods.push(call.method);

    if (READ_ONLY_RPC_METHODS.has(call.method)) {
      allowed.push(call);
      continue;
    }

    // A notification carries no id and expects no response.
    if (call.id !== undefined) {
      rejectedResponses.push({
        jsonrpc: "2.0",
        id: call.id,
        error: { code: -32601, message: refusalMessage(call.method) },
      });
    }
  }

  if (allowed.length === 0) {
    return {
      outcome: "reject-all",
      body: isBatch ? rejectedResponses : (rejectedResponses[0] ?? null),
      methods,
    };
  }

  return {
    outcome: "forward",
    allowedCalls: allowed,
    rejectedResponses,
    isBatch,
    methods,
  };
}

/**
 * The judge ledger is meant to be read from Solana Explorer, so this endpoint
 * is deliberately cross-origin — unlike every demo control route, which stays
 * same-origin only. The allowlist keeps that exception narrow.
 */
export function resolveLedgerCorsOrigin(
  requestOrigin: string | null,
  publicUrl = process.env.BUDGETRAIL_PUBLIC_URL
): string | undefined {
  if (!requestOrigin) return undefined;

  let origin: string;
  try {
    origin = new URL(requestOrigin).origin;
  } catch {
    return undefined;
  }

  if (origin === SOLANA_EXPLORER_ORIGIN) return origin;

  if (publicUrl) {
    try {
      if (origin === new URL(publicUrl).origin) return origin;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function ledgerCorsHeaders(allowedOrigin: string | undefined) {
  const headers: Record<string, string> = {
    "cache-control": "no-store",
    vary: "origin",
  };

  if (allowedOrigin) {
    headers["access-control-allow-origin"] = allowedOrigin;
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["access-control-allow-headers"] = "content-type, solana-client";
    headers["access-control-max-age"] = "86400";
  }

  return headers;
}

export function jsonRpcErrorBody(code: number, message: string) {
  return { jsonrpc: "2.0", id: null, error: { code, message } };
}

declare global {
  var __budgetRailLedgerInflight: number | undefined;
}

/**
 * Admission control for the shared ledger. Returns a release callback, or
 * `undefined` when the rail is already at capacity and the caller should shed
 * the request instead of queueing behind it.
 */
export function acquireLedgerSlot() {
  const inflight = globalThis.__budgetRailLedgerInflight ?? 0;
  if (inflight >= MAX_INFLIGHT_LEDGER_CALLS) return undefined;

  globalThis.__budgetRailLedgerInflight = inflight + 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    globalThis.__budgetRailLedgerInflight = Math.max(
      0,
      (globalThis.__budgetRailLedgerInflight ?? 1) - 1
    );
  };
}

export function resetLedgerInflightForTest() {
  if (process.env.NODE_ENV === "test") {
    globalThis.__budgetRailLedgerInflight = 0;
  }
}
