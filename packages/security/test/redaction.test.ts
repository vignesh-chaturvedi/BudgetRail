import { describe, expect, it } from "vitest";
import { redactSensitiveText, safeErrorMessage } from "../src";

describe("security diagnostics", () => {
  it.each([
    ["Authorization: Bearer live-token-value", "Bearer [REDACTED]"],
    ["PRIVATE_KEY=base58-secret", "PRIVATE_KEY=[REDACTED]"],
    [
      "RPC failed https://rpc.example/?api-key=live-value",
      "api-key=[REDACTED]",
    ],
    ["github token ghp_supersecretvalue", "[REDACTED_TOKEN]"],
  ])("redacts a credential from %s", (input, expected) => {
    const redacted = redactSensitiveText(input);
    expect(redacted).toContain(expected);
    expect(redacted).not.toContain("live-token-value");
    expect(redacted).not.toContain("base58-secret");
    expect(redacted).not.toContain("live-value");
    expect(redacted).not.toContain("supersecretvalue");
  });

  it("redacts a Solana JSON keypair byte array", () => {
    const keypair = `[${Array.from({ length: 64 }, (_, index) => index).join(",")}]`;
    expect(redactSensitiveText(`signer=${keypair}`)).toBe(
      "signer=[REDACTED_SOLANA_KEYPAIR]"
    );
  });

  it("preserves an actionable non-sensitive message", () => {
    expect(
      safeErrorMessage(
        new Error("The delegation is closed"),
        "The operation failed"
      )
    ).toBe("The delegation is closed");
  });

  it("bounds public diagnostic length", () => {
    expect(
      safeErrorMessage(new Error("x".repeat(500)), "fallback")
    ).toHaveLength(240);
  });
});
