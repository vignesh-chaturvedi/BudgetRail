import { describe, expect, it } from "vitest";
import { AllowanceActionError, classifyAllowanceError } from "./errors";

describe("allowance errors", () => {
  it.each([
    ["User rejected the request", "wallet-rejected"],
    ["InsufficientFundsForRent", "insufficient-sol"],
    ["429 Too Many Requests", "rpc-timeout"],
    ["AccountNotFound", "already-revoked"],
    ["Unsupported cluster: mainnet", "wrong-cluster"],
  ] as const)("classifies %s", (message, code) => {
    expect(classifyAllowanceError(new Error(message)).code).toBe(code);
  });

  it("uses the deepest causal error", () => {
    const outer = new Error("Transaction failed", {
      cause: new Error("User rejected the request"),
    });
    expect(classifyAllowanceError(outer).code).toBe("wallet-rejected");
  });

  it("preserves typed insufficient-USDC errors", () => {
    expect(
      classifyAllowanceError(
        new AllowanceActionError("insufficient-usdc", "Fund devnet USDC.")
      )
    ).toMatchObject({ code: "insufficient-usdc", retryable: true });
  });
});
