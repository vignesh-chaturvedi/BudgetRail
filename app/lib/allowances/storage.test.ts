import { address } from "@solana/kit";
import { describe, expect, it } from "vitest";
import type { AllowanceRecord } from "./model";
import {
  allowanceRecordsForWallet,
  markAllowanceRevoked,
  parseAllowanceRecords,
  upsertAllowanceRecord,
} from "./storage";

const OWNER = address("11111111111111111111111111111111");
const AGENT = address("Stake11111111111111111111111111111111111111");
const MINT = address("So11111111111111111111111111111111111111112");
const ALLOWANCE = address("Vote111111111111111111111111111111111111111");

const record: AllowanceRecord = {
  version: 1,
  cluster: "devnet",
  address: ALLOWANCE,
  owner: OWNER,
  delegatee: AGENT,
  mint: MINT,
  nonce: "1",
  capBaseUnits: "2000000",
  expiryTs: "2000",
  createdAt: "2026-08-03T00:00:00.000Z",
  createSignature: "create-signature",
};

describe("allowance creation records", () => {
  it("drops malformed or untrusted local records", () => {
    const parsed = parseAllowanceRecords(
      JSON.stringify([record, { ...record, owner: "malformed" }, null])
    );
    expect(parsed).toEqual([record]);
  });

  it("upserts by cluster and allowance address", () => {
    const changed = { ...record, capBaseUnits: "3000000" };
    expect(upsertAllowanceRecord([record], changed)).toEqual([changed]);
  });

  it("records revocation and filters records by wallet and cluster", () => {
    const revoked = markAllowanceRevoked([record], {
      cluster: "devnet",
      address: ALLOWANCE,
      revokedAt: "2026-08-04T00:00:00.000Z",
      revokeSignature: "revoke-signature",
    });

    expect(
      allowanceRecordsForWallet(revoked, "devnet", OWNER)[0]
    ).toMatchObject({
      revokedAt: "2026-08-04T00:00:00.000Z",
      revokeSignature: "revoke-signature",
    });
    expect(allowanceRecordsForWallet(revoked, "mainnet", OWNER)).toEqual([]);
  });
});
