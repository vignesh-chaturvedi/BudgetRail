import { describe, expect, it } from "vitest";
import { Surfnet } from "@solana/surfpool";

describe("Surfpool test harness", () => {
  it("starts an isolated Solana RPC and shuts it down", async () => {
    const surfnet = Surfnet.start();
    try {
      const response = await fetch(surfnet.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getHealth",
        }),
      });
      const payload = (await response.json()) as { result?: string };
      expect(payload.result).toBe("ok");
    } finally {
      surfnet.stop();
    }
  });
});
