import { generateKeyPairSigner } from "@solana/kit";
import { Surfnet } from "@solana/surfpool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSubscriptionsClient } from "../subscriptions-client";
import type { SubscriptionsClient } from "../subscriptions-client";
import { createFixedAllowance, revokeFixedAllowance } from "./actions";

describe("Phase 2 allowance control plane", () => {
  const surfnet = Surfnet.startWithConfig({
    offline: false,
    remoteRpcUrl: "https://api.devnet.solana.com",
  });
  let client: SubscriptionsClient;
  let owner: Awaited<ReturnType<typeof generateKeyPairSigner>>;
  let agent: Awaited<ReturnType<typeof generateKeyPairSigner>>;
  let mint: Awaited<ReturnType<typeof generateKeyPairSigner>>;

  beforeAll(async () => {
    owner = await generateKeyPairSigner();
    agent = await generateKeyPairSigner();
    mint = await generateKeyPairSigner();
    surfnet.fundSol(owner.address, 500_000_000);
    client = createSubscriptionsClient(
      "localnet",
      owner,
      surfnet.rpcUrl,
      surfnet.wsUrl
    );

    await client.token.instructions
      .createMint({
        newMint: mint,
        decimals: 6,
        mintAuthority: owner.address,
      })
      .sendTransaction();
    await client.token.instructions
      .mintToATA({
        owner: owner.address,
        mint: mint.address,
        mintAuthority: owner,
        amount: 5_000_000n,
        decimals: 6,
      })
      .sendTransaction();
  });

  afterAll(() => surfnet.stop());

  it("creates, inspects, and revokes a fixed allowance", async () => {
    const created = await createFixedAllowance({
      client,
      cluster: "localnet",
      owner: owner.address,
      mint: mint.address,
      draft: {
        delegatee: agent.address,
        capBaseUnits: 2_000_000n,
        expiryTs: 2_000_000_000n,
      },
      now: new Date("2026-08-03T00:00:00.000Z"),
      nonce: 42n,
    });

    const afterCreate =
      await client.subscriptions.queries.delegationsByDelegator(owner.address);
    const fixed = afterCreate.find((delegation) => delegation.kind === "fixed");
    expect(fixed).toMatchObject({
      address: created.address,
      kind: "fixed",
      data: {
        amount: 2_000_000n,
        expiryTs: 2_000_000_000n,
        mint: mint.address,
      },
    });
    expect(created.createSignature).toBeTruthy();
    expect(created.record.capBaseUnits).toBe("2000000");

    const revoked = await revokeFixedAllowance({
      client,
      cluster: "localnet",
      delegationAddress: created.address,
    });
    expect(revoked.alreadyRevoked).toBe(false);
    expect(revoked.revokeSignature).toBeTruthy();

    const afterRevoke =
      await client.subscriptions.queries.delegationsByDelegator(owner.address);
    expect(
      afterRevoke.filter((delegation) => delegation.kind === "fixed")
    ).toHaveLength(0);

    await expect(
      revokeFixedAllowance({
        client,
        cluster: "localnet",
        delegationAddress: created.address,
      })
    ).resolves.toEqual({ alreadyRevoked: true });
  });
});
