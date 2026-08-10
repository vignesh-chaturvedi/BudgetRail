import { describe, expect, it } from "vitest";
import { rejectCrossOriginMutation } from "./request";

describe("demo mutation origin guard", () => {
  it("allows same-origin browser requests", () => {
    expect(
      rejectCrossOriginMutation(
        new Request("https://budgetrail.example/api/demo/reset", {
          method: "POST",
          headers: {
            origin: "https://budgetrail.example",
            "sec-fetch-site": "same-origin",
          },
        })
      )
    ).toBeUndefined();
  });

  it("allows non-browser proof clients without an Origin header", () => {
    expect(
      rejectCrossOriginMutation(
        new Request("https://budgetrail.example/api/demo/reset", {
          method: "POST",
        })
      )
    ).toBeUndefined();
  });

  it("uses the configured public origin behind an internal container proxy", () => {
    expect(
      rejectCrossOriginMutation(
        new Request("http://0.0.0.0:3000/api/demo/reset", {
          method: "POST",
          headers: {
            origin: "https://budgetrail.example",
            "sec-fetch-site": "same-origin",
          },
        }),
        "https://budgetrail.example"
      )
    ).toBeUndefined();
  });

  it.each<[Record<string, string>]>([
    [
      {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
    ],
    [{ origin: "not-a-url" }],
  ])("blocks a cross-origin mutation", async (headers) => {
    const response = rejectCrossOriginMutation(
      new Request("https://budgetrail.example/api/demo/reset", {
        method: "POST",
        headers,
      })
    );
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      error: "CROSS_ORIGIN_MUTATION_BLOCKED",
    });
  });

  it("fails closed when the configured public URL is malformed", async () => {
    const response = rejectCrossOriginMutation(
      new Request("http://0.0.0.0:3000/api/demo/reset", {
        method: "POST",
        headers: { origin: "https://budgetrail.example" },
      }),
      "not-a-url"
    );

    expect(response?.status).toBe(403);
  });
});
