import { address } from "@solana/kit";
import { describe, expect, it } from "vitest";
import type { FixedDelegation } from "./model";
import {
  createDelegationNonce,
  formatUsdcAmount,
  getAllowanceStatus,
  parseUsdcAmount,
  toAllowanceView,
  validateAllowanceDraft,
  type AllowanceRecord,
} from "./model";

const OWNER = address("11111111111111111111111111111111");
const AGENT = address("Stake11111111111111111111111111111111111111");
const MINT = address("So11111111111111111111111111111111111111112");
const ALLOWANCE = address("Vote111111111111111111111111111111111111111");

describe("USDC amount precision", () => {
  it.each([
    ["2", 2_000_000n],
    ["0.1", 100_000n],
    ["1.000001", 1_000_001n],
    ["18446744073709.551615", 18_446_744_073_709_551_615n],
  ])("parses %s without floating point math", (input, expected) => {
    expect(parseUsdcAmount(input)).toBe(expected);
    expect(formatUsdcAmount(expected)).toBe(input);
  });

  it.each(["", "0", "-1", "1e3", "1.0000001", "01", "1,000"])(
    "rejects unsafe amount %s",
    (input) => expect(() => parseUsdcAmount(input)).toThrow()
  );
});

describe("allowance state", () => {
  it("prioritizes revoked, then expiry, then depletion", () => {
    expect(
      getAllowanceStatus({
        remainingBaseUnits: 10n,
        expiryTs: 2_000n,
        nowTs: 1_000n,
        revoked: true,
      })
    ).toBe("revoked");
    expect(
      getAllowanceStatus({
        remainingBaseUnits: 10n,
        expiryTs: 999n,
        nowTs: 1_000n,
      })
    ).toBe("expired");
    expect(
      getAllowanceStatus({
        remainingBaseUnits: 0n,
        expiryTs: 2_000n,
        nowTs: 1_000n,
      })
    ).toBe("depleted");
    expect(
      getAllowanceStatus({
        remainingBaseUnits: 1n,
        expiryTs: 2_000n,
        nowTs: 1_000n,
      })
    ).toBe("active");
  });

  it("derives spent amount from the recorded cap and on-chain remainder", () => {
    const delegation: FixedDelegation = {
      kind: "fixed",
      address: ALLOWANCE,
      data: {
        header: {
          discriminator: 2,
          version: 1,
          bump: 255,
          delegator: OWNER,
          delegatee: AGENT,
          payer: OWNER,
          initId: 7n,
        },
        subscriptionAuthority: OWNER,
        mint: MINT,
        amount: 1_500_000n,
        expiryTs: 2_000n,
      },
    };
    const record: AllowanceRecord = {
      version: 1,
      cluster: "devnet",
      address: ALLOWANCE,
      owner: OWNER,
      delegatee: AGENT,
      mint: MINT,
      nonce: "42",
      capBaseUnits: "2000000",
      expiryTs: "2000",
      createdAt: "2026-08-03T00:00:00.000Z",
      createSignature: "create-signature",
    };

    expect(
      toAllowanceView({ delegation, record, nowTs: 1_000n })
    ).toMatchObject({
      capBaseUnits: 2_000_000n,
      spentBaseUnits: 500_000n,
      remainingBaseUnits: 1_500_000n,
      status: "active",
      capSource: "creation-record",
    });
  });

  it("keeps a local record syncing until RPC returns its account", () => {
    const record: AllowanceRecord = {
      version: 1,
      cluster: "devnet",
      address: ALLOWANCE,
      owner: OWNER,
      delegatee: AGENT,
      mint: MINT,
      nonce: "42",
      capBaseUnits: "2000000",
      expiryTs: "2000",
      createdAt: "2026-08-03T00:00:00.000Z",
      createSignature: "create-signature",
    };

    expect(toAllowanceView({ record, nowTs: 1_000n })).toMatchObject({
      remainingBaseUnits: 2_000_000n,
      spentBaseUnits: 0n,
      status: "syncing",
    });
  });
});

describe("allowance form", () => {
  it("returns all field errors without discarding user input", () => {
    const result = validateAllowanceDraft(
      { delegatee: "not-an-address", amount: "2.0000001", expiry: "bad" },
      1_000n
    );
    expect(result.draft).toBeUndefined();
    expect(Object.keys(result.errors)).toEqual([
      "delegatee",
      "amount",
      "expiry",
    ]);
  });

  it("creates collision-resistant monotonic nonces", () => {
    expect(createDelegationNonce(1_000, 0.123)).toBe(1_000_123n);
    expect(createDelegationNonce(1_001, 0)).toBeGreaterThan(
      createDelegationNonce(1_000, 0.999)
    );
  });
});
