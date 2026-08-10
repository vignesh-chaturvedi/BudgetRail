import { beforeEach, describe, expect, it } from "vitest";
import { enforceRateLimit, resetRateLimitsForTest } from "./rate-limit";

describe("public demo rate limits", () => {
  beforeEach(() => resetRateLimitsForTest());

  it("allows requests up to the configured bound", () => {
    const request = new Request("https://budgetrail.example/api/demo/reset", {
      headers: { "x-forwarded-for": "203.0.113.10", "user-agent": "judge" },
    });

    expect(
      enforceRateLimit(request, {
        action: "reset",
        limit: 2,
        windowMs: 60_000,
        now: 1_000,
      })
    ).toBeNull();
    expect(
      enforceRateLimit(request, {
        action: "reset",
        limit: 2,
        windowMs: 60_000,
        now: 1_001,
      })
    ).toBeNull();
  });

  it("returns a bounded 429 response without echoing client data", async () => {
    const request = new Request("https://budgetrail.example/api/demo/reset", {
      headers: { "x-forwarded-for": "203.0.113.10", "user-agent": "judge" },
    });

    enforceRateLimit(request, {
      action: "reset",
      limit: 1,
      windowMs: 60_000,
      now: 1_000,
    });
    const blocked = enforceRateLimit(request, {
      action: "reset",
      limit: 1,
      windowMs: 60_000,
      now: 1_001,
    });

    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("retry-after")).toBe("60");
    expect(await blocked?.text()).not.toContain("203.0.113.10");
  });

  it("isolates counters by action", () => {
    const request = new Request("https://budgetrail.example/api/demo/state");

    enforceRateLimit(request, {
      action: "state",
      limit: 1,
      windowMs: 60_000,
      now: 1_000,
    });

    expect(
      enforceRateLimit(request, {
        action: "purchase",
        limit: 1,
        windowMs: 60_000,
        now: 1_000,
      })
    ).toBeNull();
  });
});
