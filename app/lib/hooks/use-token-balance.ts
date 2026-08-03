"use client";

import useSWR from "swr";
import type { Address } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useWallet } from "../wallet/context";
import { getAtaAddress } from "../subscriptions/pdas";
import { useSubscriptionsClient } from "./use-subscriptions-client";

export function useTokenBalance(mint?: Address) {
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const client = useSubscriptionsClient();
  const owner = wallet?.account.address;

  return useSWR(
    client && owner && mint
      ? (["token-balance", cluster, owner, mint] as const)
      : null,
    async () => {
      const ata = await getAtaAddress(owner!, mint!);
      const account = await client!.rpc
        .getAccountInfo(ata, { encoding: "base64" })
        .send();
      if (!account.value) return { amount: 0n, ata, exists: false };

      const balance = await client!.rpc.getTokenAccountBalance(ata).send();
      return { amount: BigInt(balance.value.amount), ata, exists: true };
    },
    {
      revalidateOnFocus: true,
      refreshInterval: 30_000,
      shouldRetryOnError: true,
      errorRetryCount: 3,
    }
  );
}
