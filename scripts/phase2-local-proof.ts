import { generateKeyPairSigner } from "@solana/kit";
import { Surfnet } from "@solana/surfpool";
import {
  createFixedAllowance,
  revokeFixedAllowance,
} from "../app/lib/allowances/actions";
import { createSubscriptionsClient } from "../app/lib/subscriptions-client";

async function main() {
  const surfnet = Surfnet.startWithConfig({
    offline: false,
    remoteRpcUrl: "https://api.devnet.solana.com",
  });

  try {
    const owner = await generateKeyPairSigner();
    const agent = await generateKeyPairSigner();
    const mint = await generateKeyPairSigner();

    surfnet.fundSol(owner.address, 500_000_000);

    const client = createSubscriptionsClient(
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
    const inspected = afterCreate.find(
      (delegation) =>
        delegation.kind === "fixed" && delegation.address === created.address
    );

    if (!inspected || inspected.kind !== "fixed") {
      throw new Error("Created allowance was not returned by the chain query");
    }

    const revoked = await revokeFixedAllowance({
      client,
      cluster: "localnet",
      delegationAddress: created.address,
    });
    const afterRevoke =
      await client.subscriptions.queries.delegationsByDelegator(owner.address);
    const secondRevoke = await revokeFixedAllowance({
      client,
      cluster: "localnet",
      delegationAddress: created.address,
    });

    const result = {
      network: "isolated Surfpool fork of Solana devnet",
      owner: owner.address,
      agent: agent.address,
      mint: mint.address,
      allowance: created.address,
      createSignature: created.createSignature,
      inspected: {
        amountBaseUnits: inspected.data.amount.toString(),
        expiryTs: inspected.data.expiryTs.toString(),
        mint: inspected.data.mint,
      },
      revokeSignature: revoked.revokeSignature,
      activeFixedAllowancesAfterRevoke: afterRevoke.filter(
        (delegation) => delegation.kind === "fixed"
      ).length,
      secondRevokeWasIdempotent: secondRevoke.alreadyRevoked,
    };

    if (
      result.inspected.amountBaseUnits !== "2000000" ||
      result.activeFixedAllowancesAfterRevoke !== 0 ||
      !result.secondRevokeWasIdempotent
    ) {
      throw new Error("Phase 2 proof assertions failed");
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    surfnet.stop();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
