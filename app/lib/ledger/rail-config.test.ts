import { describe, expect, it } from "vitest";
import {
  DEFAULT_BLOCK_PRODUCTION_MODE,
  PUBLIC_DEVNET_RPC,
  describeDevnetForkRpc,
  resolveBlockProductionMode,
  resolveDevnetForkRpcUrl,
  resolveSlotTimeMs,
} from "./rail-config";

const KEYED_RPC = "https://devnet.example-rpc.com/?api-key=super-secret-value";

function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...overrides };
}

describe("judge rail block production", () => {
  it("defaults to transaction mode, which keeps an idle rail from exhausting Surfpool", () => {
    expect(resolveBlockProductionMode(env())).toBe("transaction");
    expect(DEFAULT_BLOCK_PRODUCTION_MODE).toBe("transaction");
  });

  it.each(["clock", "transaction", "manual"])("honours %s", (mode) => {
    expect(
      resolveBlockProductionMode(
        env({ BUDGETRAIL_BLOCK_PRODUCTION_MODE: mode })
      )
    ).toBe(mode);
  });

  it("falls back rather than passing an unknown mode to Surfpool", () => {
    expect(
      resolveBlockProductionMode(
        env({ BUDGETRAIL_BLOCK_PRODUCTION_MODE: "tx" })
      )
    ).toBe("transaction");
  });
});

describe("judge rail slot budget", () => {
  it("defaults to a slow tick, because Surfpool's ~1,050-slot budget is spent in slots", () => {
    expect(resolveSlotTimeMs(env())).toBe(400);
  });

  it("honours an explicit tick", () => {
    expect(resolveSlotTimeMs(env({ BUDGETRAIL_SLOT_TIME_MS: "1000" }))).toBe(
      1000
    );
  });

  it.each(["0", "-1", "fast", ""])(
    "falls back rather than starting a rail with tick %j",
    (value) => {
      expect(resolveSlotTimeMs(env({ BUDGETRAIL_SLOT_TIME_MS: value }))).toBe(
        400
      );
    }
  );

  it.each(["1", "4", "99"])(
    "refuses tick %j, which exhausts the budget before a rail finishes seeding",
    (value) => {
      expect(resolveSlotTimeMs(env({ BUDGETRAIL_SLOT_TIME_MS: value }))).toBe(
        400
      );
    }
  );

  it("accepts the floor itself", () => {
    expect(resolveSlotTimeMs(env({ BUDGETRAIL_SLOT_TIME_MS: "100" }))).toBe(
      100
    );
  });
});

describe("judge rail fork endpoint", () => {
  it("uses the public endpoint when nothing is configured", () => {
    expect(resolveDevnetForkRpcUrl(env())).toBe(PUBLIC_DEVNET_RPC);
    expect(
      resolveDevnetForkRpcUrl(env({ BUDGETRAIL_DEVNET_RPC_URL: "  " }))
    ).toBe(PUBLIC_DEVNET_RPC);
  });

  it("accepts a dedicated HTTPS endpoint", () => {
    expect(
      resolveDevnetForkRpcUrl(env({ BUDGETRAIL_DEVNET_RPC_URL: KEYED_RPC }))
    ).toBe(KEYED_RPC);
  });

  it.each([
    "http://devnet.example-rpc.com",
    "not-a-url",
    "ftp://devnet.example-rpc.com",
  ])("refuses to fork from %s", (value) => {
    expect(
      resolveDevnetForkRpcUrl(env({ BUDGETRAIL_DEVNET_RPC_URL: value }))
    ).toBe(PUBLIC_DEVNET_RPC);
  });

  it("allows a loopback endpoint for local testing", () => {
    expect(
      resolveDevnetForkRpcUrl(
        env({ BUDGETRAIL_DEVNET_RPC_URL: "http://127.0.0.1:8899" })
      )
    ).toBe("http://127.0.0.1:8899");
  });

  it("describes a keyed endpoint by host only, never leaking the key", () => {
    const described = describeDevnetForkRpc(
      env({ BUDGETRAIL_DEVNET_RPC_URL: KEYED_RPC })
    );

    expect(described).toEqual({
      host: "devnet.example-rpc.com",
      dedicated: true,
    });
    expect(JSON.stringify(described)).not.toContain("super-secret-value");
  });

  it("reports the public endpoint as not dedicated", () => {
    expect(describeDevnetForkRpc(env())).toEqual({
      host: "api.devnet.solana.com",
      dedicated: false,
    });
  });
});
