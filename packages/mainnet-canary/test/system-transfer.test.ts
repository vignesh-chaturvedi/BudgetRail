import { generateKeyPairSigner } from "@solana/kit";
import { describe, expect, it } from "vitest";
import {
  calculateExactSolDrain,
  getSystemTransferInstruction,
} from "../../../scripts/mainnet-canary";

describe("canary SOL sweep instruction", () => {
  it("encodes the canonical System Program transfer discriminator and u64 lamports", async () => {
    const source = await generateKeyPairSigner();
    const destination = await generateKeyPairSigner();
    const instruction = getSystemTransferInstruction(
      source,
      destination.address,
      123_456n
    );
    const view = new DataView(
      instruction.data!.buffer,
      instruction.data!.byteOffset,
      instruction.data!.byteLength
    );

    expect(instruction.programAddress).toBe("11111111111111111111111111111111");
    expect(view.getUint32(0, true)).toBe(2);
    expect(view.getBigUint64(4, true)).toBe(123_456n);
    expect(instruction.accounts?.[0]?.address).toBe(source.address);
    expect(instruction.accounts?.[1]?.address).toBe(destination.address);
    expect(
      (instruction.accounts?.[0] as { signer?: { address: string } }).signer
        ?.address
    ).toBe(source.address);
  });

  it("rejects a zero-value transfer", async () => {
    const source = await generateKeyPairSigner();
    const destination = await generateKeyPairSigner();
    expect(() =>
      getSystemTransferInstruction(source, destination.address, 0n)
    ).toThrow("positive");
  });

  it("subtracts the exact finalized fee and rejects an undrainable balance", () => {
    expect(calculateExactSolDrain(20_000n, 5_000n)).toBe(15_000n);
    expect(() => calculateExactSolDrain(5_000n, 5_000n)).toThrow("not enough");
    expect(() => calculateExactSolDrain(4_999n, 5_000n)).toThrow("not enough");
  });
});
