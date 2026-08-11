import { beforeEach, describe, expect, it } from "vitest";
import {
  BLOCKED_RPC_METHODS,
  EXCLUDED_SCAN_METHODS,
  MAX_INFLIGHT_LEDGER_CALLS,
  MAX_LEDGER_RPC_BATCH,
  READ_ONLY_RPC_METHODS,
  SOLANA_EXPLORER_ORIGIN,
  acquireLedgerSlot,
  ledgerCorsHeaders,
  planLedgerRpcRequest,
  resetLedgerInflightForTest,
  resolveLedgerCorsOrigin,
} from "./rpc-proxy";

function call(method: string, params: unknown[] = [], id: unknown = 1) {
  return { jsonrpc: "2.0", id, method, params };
}

function errorFor(body: unknown) {
  return (body as { error: { code: number; message: string } }).error;
}

describe("judge ledger method policy", () => {
  it("forwards the read calls Solana Explorer issues for a transaction view", () => {
    const plan = planLedgerRpcRequest([
      call("getEpochInfo"),
      call("getTransaction", ["3xY"]),
      call("getSignatureStatuses", [["3xY"]]),
    ]);

    expect(plan.outcome).toBe("forward");
    if (plan.outcome !== "forward") return;
    expect(plan.rejectedResponses).toEqual([]);
    expect(plan.isBatch).toBe(true);
    expect(plan.methods).toEqual([
      "getEpochInfo",
      "getTransaction",
      "getSignatureStatuses",
    ]);
  });

  it("forwards a single call unwrapped", () => {
    const plan = planLedgerRpcRequest(call("getAccountInfo", ["11111"]));

    expect(plan.outcome).toBe("forward");
    if (plan.outcome !== "forward") return;
    expect(plan.isBatch).toBe(false);
    expect(plan.allowedCalls).toHaveLength(1);
    expect(plan.allowedCalls[0]).toMatchObject({ method: "getAccountInfo" });
  });

  it.each([...BLOCKED_RPC_METHODS])("refuses %s", (method) => {
    const plan = planLedgerRpcRequest(call(method));

    expect(plan.outcome).toBe("reject-all");
    if (plan.outcome !== "reject-all") return;
    expect(errorFor(plan.body).code).toBe(-32601);
    expect(errorFor(plan.body).message).toContain("read-only");
  });

  it("refuses Surfpool cheat codes that could forge ledger state", () => {
    for (const method of [
      "surfnet_setAccount",
      "surfnet_setTokenAccount",
      "surfnet_cloneProgramAccount",
      "surfnet_timeTravel",
    ]) {
      expect(planLedgerRpcRequest(call(method)).outcome).toBe("reject-all");
    }
  });

  it("answers a refusal against the caller's own id, as a validator does", () => {
    const plan = planLedgerRpcRequest(call("getAsset", [], "req-7"));

    expect(plan.outcome).toBe("reject-all");
    if (plan.outcome !== "reject-all") return;
    expect(plan.body).toMatchObject({ jsonrpc: "2.0", id: "req-7" });
  });

  it("produces no response for a refused notification", () => {
    const plan = planLedgerRpcRequest({ jsonrpc: "2.0", method: "getAsset" });

    expect(plan.outcome).toBe("reject-all");
    if (plan.outcome !== "reject-all") return;
    expect(plan.body).toBeNull();
  });

  it("keeps the allowed half of a mixed batch and refuses only the rest", () => {
    const plan = planLedgerRpcRequest([
      call("getEpochInfo", [], "a"),
      call("requestAirdrop", ["11111", 1], "b"),
      call("getSlot", [], "c"),
    ]);

    expect(plan.outcome).toBe("forward");
    if (plan.outcome !== "forward") return;
    expect(plan.allowedCalls).toHaveLength(2);
    expect(plan.rejectedResponses).toHaveLength(1);
    expect(plan.rejectedResponses[0]).toMatchObject({ id: "b" });
    expect(errorFor(plan.rejectedResponses[0]).message).toContain(
      "requestAirdrop"
    );
  });

  it("bounds batch size", () => {
    const oversized = Array.from({ length: MAX_LEDGER_RPC_BATCH + 1 }, () =>
      call("getSlot")
    );
    const plan = planLedgerRpcRequest(oversized);

    expect(plan.outcome).toBe("protocol-error");
    if (plan.outcome !== "protocol-error") return;
    expect(plan.status).toBe(400);
  });

  it.each([[[]], [null], ["getSlot"], [{ id: 1 }], [[{ method: 7 }]]])(
    "rejects malformed payload %j",
    (payload) => {
      expect(planLedgerRpcRequest(payload).outcome).toBe("protocol-error");
    }
  );

  it("exposes no write method in the allowlist", () => {
    for (const method of BLOCKED_RPC_METHODS) {
      expect(READ_ONLY_RPC_METHODS.has(method)).toBe(false);
    }
    for (const method of READ_ONLY_RPC_METHODS) {
      expect(method.startsWith("surfnet_")).toBe(false);
    }
  });

  it.each([...EXCLUDED_SCAN_METHODS])(
    "withholds the full-ledger scan %s, which can stall the rail",
    (method) => {
      expect(READ_ONLY_RPC_METHODS.has(method)).toBe(false);

      const plan = planLedgerRpcRequest(call(method));
      expect(plan.outcome).toBe("reject-all");
      if (plan.outcome !== "reject-all") return;
      expect(errorFor(plan.body).message).toContain("Full-ledger scans");
    }
  );
});

describe("judge ledger admission control", () => {
  beforeEach(() => resetLedgerInflightForTest());

  it("sheds load past the in-flight bound instead of piling onto Surfpool", () => {
    const held = Array.from({ length: MAX_INFLIGHT_LEDGER_CALLS }, () =>
      acquireLedgerSlot()
    );

    expect(held.every((release) => release !== undefined)).toBe(true);
    expect(acquireLedgerSlot()).toBeUndefined();

    held[0]?.();
    const reacquired = acquireLedgerSlot();
    expect(reacquired).toBeDefined();

    reacquired?.();
    for (const release of held.slice(1)) release?.();
    expect(acquireLedgerSlot()).toBeDefined();
  });

  it("ignores a double release so a retried handler cannot inflate capacity", () => {
    const release = acquireLedgerSlot();
    release?.();
    release?.();

    const held = Array.from({ length: MAX_INFLIGHT_LEDGER_CALLS }, () =>
      acquireLedgerSlot()
    );
    expect(held.every((entry) => entry !== undefined)).toBe(true);
    expect(acquireLedgerSlot()).toBeUndefined();
  });
});

describe("judge ledger cross-origin policy", () => {
  const publicUrl = "https://budgetrail.example";

  it("grants Solana Explorer so custom-cluster links resolve", () => {
    expect(resolveLedgerCorsOrigin(SOLANA_EXPLORER_ORIGIN, publicUrl)).toBe(
      SOLANA_EXPLORER_ORIGIN
    );
  });

  it("grants the deployment's own origin", () => {
    expect(resolveLedgerCorsOrigin(publicUrl, publicUrl)).toBe(publicUrl);
  });

  it.each([
    "https://explorer.solana.com.attacker.test",
    "https://budgetrail.example.attacker.test",
    "http://explorer.solana.com",
    "not-a-url",
  ])("refuses %s", (origin) => {
    expect(resolveLedgerCorsOrigin(origin, publicUrl)).toBeUndefined();
  });

  it("emits no allow-origin header for an unrecognised caller", () => {
    const headers = ledgerCorsHeaders(undefined);

    expect(headers["access-control-allow-origin"]).toBeUndefined();
    expect(headers["cache-control"]).toBe("no-store");
    expect(headers.vary).toBe("origin");
  });

  it("never widens the grant to a wildcard", () => {
    const headers = ledgerCorsHeaders(SOLANA_EXPLORER_ORIGIN);

    expect(headers["access-control-allow-origin"]).toBe(SOLANA_EXPLORER_ORIGIN);
    expect(headers["access-control-allow-methods"]).toBe("POST, OPTIONS");
  });
});
