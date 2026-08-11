import { describe, expect, it } from "vitest";
import {
  MERCHANT_RESOURCE_PATH,
  resolveMerchantResourceUrl,
} from "./merchant-url";

function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...overrides };
}

describe("agent-to-merchant resource url", () => {
  it("stays on loopback so a managed host never has to hairpin the request", () => {
    expect(resolveMerchantResourceUrl(env({ PORT: "3000" }))).toBe(
      `http://127.0.0.1:3000${MERCHANT_RESOURCE_PATH}`
    );
  });

  it("follows the port the platform assigns", () => {
    expect(resolveMerchantResourceUrl(env({ PORT: "10000" }))).toBe(
      `http://127.0.0.1:10000${MERCHANT_RESOURCE_PATH}`
    );
  });

  it.each(["", "   "])("falls back to 3000 when PORT is %j", (port) => {
    expect(resolveMerchantResourceUrl(env({ PORT: port }))).toBe(
      `http://127.0.0.1:3000${MERCHANT_RESOURCE_PATH}`
    );
  });

  it("falls back to 3000 when PORT is unset", () => {
    expect(resolveMerchantResourceUrl(env())).toBe(
      `http://127.0.0.1:3000${MERCHANT_RESOURCE_PATH}`
    );
  });

  it("never points at a public hostname", () => {
    const url = new URL(resolveMerchantResourceUrl(env({ PORT: "8080" })));
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.protocol).toBe("http:");
  });
});
