"use client";

import useSWR from "swr";
import type { Delegation } from "@solana/subscriptions";
import { useCluster } from "../../components/cluster-context";
import { useWallet } from "../wallet/context";
import { useSubscriptionsClient } from "./use-subscriptions-client";

type FixedDelegation = Extract<Delegation, { kind: "fixed" }>;

export function useFixedAllowances() {
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const client = useSubscriptionsClient();
  const owner = wallet?.account.address;

  return useSWR(
    client && owner ? (["fixed-allowances", cluster, owner] as const) : null,
    async () => {
      const delegations =
        await client!.subscriptions.queries.delegationsByDelegator(owner!);
      return delegations.filter(
        (delegation): delegation is FixedDelegation =>
          delegation.kind === "fixed"
      );
    },
    {
      revalidateOnFocus: true,
      refreshInterval: 30_000,
      shouldRetryOnError: true,
      errorRetryCount: 3,
    }
  );
}
