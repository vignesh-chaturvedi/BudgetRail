"use client";

import { useMemo } from "react";
import { useCluster } from "../cluster-context";
import { WalletButton } from "../wallet-button";
import { useWallet } from "../../lib/wallet/context";
import { useFixedAllowances } from "../../lib/hooks/use-fixed-allowances";
import { useAllowanceRecords } from "../../lib/hooks/use-allowance-records";
import { useNow } from "../../lib/hooks/use-now";
import { allowanceRecordsForWallet } from "../../lib/allowances/storage";
import {
  formatUsdcAmount,
  toAllowanceView,
  type AllowanceView,
} from "../../lib/allowances/model";
import { CreateAllowancePanel } from "./create-allowance-panel";
import { AllowanceCard } from "./allowance-card";
import { OperatorConsole } from "../phase4/operator-console";

export function AllowanceDashboard() {
  const { cluster } = useCluster();
  const { status, wallet } = useWallet();
  const fixed = useFixedAllowances();
  const { records } = useAllowanceRecords();
  const nowTs = useNow();
  const owner = wallet?.account.address;

  const ownerRecords = useMemo(
    () => (owner ? allowanceRecordsForWallet(records, cluster, owner) : []),
    [cluster, owner, records]
  );
  const recordByAddress = useMemo(
    () => new Map(ownerRecords.map((record) => [record.address, record])),
    [ownerRecords]
  );
  const views = useMemo(() => {
    const onChain = (fixed.data ?? []).map((delegation) =>
      toAllowanceView({
        delegation,
        record: recordByAddress.get(delegation.address),
        nowTs,
      })
    );
    const onChainAddresses = new Set(
      onChain.map((allowance) => allowance.address)
    );
    const localOnly = ownerRecords
      .filter((record) => !onChainAddresses.has(record.address))
      .map((record) => toAllowanceView({ record, nowTs }));

    return [...onChain, ...localOnly].sort(compareAllowances);
  }, [fixed.data, nowTs, ownerRecords, recordByAddress]);

  const summary = summarize(views);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:px-8">
      <section className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
            Phase 4 verifiable operator rail
          </span>
          <span className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-xs text-muted">
            {cluster}
          </span>
        </div>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
          Give agents a budget,
          <span className="block text-muted">not your wallet.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
          Create capped, expiring USDC authority for one agent wallet. Inspect
          what remains and revoke access instantly through Solana’s native
          Subscriptions Program.
        </p>
      </section>

      {status !== "connected" ? (
        <section className="mt-12 rounded-xl border border-border bg-card p-8 sm:p-12">
          <div className="max-w-lg">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              Owner access required
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Connect the wallet that owns the USDC.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              BudgetRail never receives your keys. Your wallet reviews and signs
              every setup, allowance, and revocation transaction.
            </p>
            <div className="mt-6">
              <WalletButton />
            </div>
          </div>
        </section>
      ) : (
        <>
          <section
            aria-label="Allowance summary"
            className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4"
          >
            <SummaryMetric
              label="Active rails"
              value={summary.active.toString()}
            />
            <SummaryMetric
              label="Total cap"
              value={`${formatUsdcAmount(summary.cap)} USDC`}
            />
            <SummaryMetric
              label="Remaining"
              value={`${formatUsdcAmount(summary.remaining)} USDC`}
              accent
            />
            <SummaryMetric label="Next expiry" value={summary.nextExpiry} />
          </section>

          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
            <CreateAllowancePanel />

            <section aria-labelledby="allowances-title">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                    On-chain state
                  </p>
                  <h2
                    id="allowances-title"
                    className="mt-2 text-xl font-semibold tracking-tight"
                  >
                    Agent allowances
                  </h2>
                </div>
                {fixed.isValidating && fixed.data && (
                  <span className="text-xs text-muted" role="status">
                    Updating…
                  </span>
                )}
              </div>

              <div className="mt-5 space-y-4">
                {fixed.isLoading && views.length === 0 ? (
                  <AllowanceSkeletons />
                ) : fixed.error ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5">
                    <p className="text-sm font-semibold">
                      Couldn’t load your allowances
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      The RPC may be delayed. Your on-chain state is unchanged.
                    </p>
                    <button
                      type="button"
                      onClick={() => fixed.mutate()}
                      className="mt-4 min-h-10 rounded-lg border border-border bg-card px-3 text-xs font-semibold transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    >
                      Retry
                    </button>
                  </div>
                ) : views.length > 0 ? (
                  views.map((allowance) => (
                    <AllowanceCard
                      key={allowance.address}
                      allowance={allowance}
                      record={recordByAddress.get(allowance.address)}
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                    <p className="text-sm font-semibold">
                      No agent allowances yet
                    </p>
                    <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted">
                      Create the first rail to give an agent bounded USDC
                      access. It will appear here after confirmation.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}

      <OperatorConsole />
    </main>
  );
}

function SummaryMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-card p-5">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-2 font-mono text-xl font-semibold tabular-nums ${
          accent ? "text-success" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function AllowanceSkeletons() {
  return (
    <div className="space-y-4" aria-label="Loading allowances" role="status">
      {[0, 1].map((item) => (
        <div
          key={item}
          className="h-72 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

function summarize(allowances: AllowanceView[]) {
  const live = allowances.filter(
    (allowance) =>
      allowance.status !== "revoked" && allowance.status !== "syncing"
  );
  const active = live.filter(
    (allowance) => allowance.status === "active"
  ).length;
  const cap = live.reduce(
    (total, allowance) => total + allowance.capBaseUnits,
    0n
  );
  const remaining = live.reduce(
    (total, allowance) => total + allowance.remainingBaseUnits,
    0n
  );
  const futureExpiries = live
    .filter((allowance) => allowance.status === "active")
    .map((allowance) => allowance.expiryTs)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return {
    active,
    cap,
    remaining,
    nextExpiry: futureExpiries[0]
      ? new Date(Number(futureExpiries[0]) * 1000).toLocaleDateString()
      : "—",
  };
}

function compareAllowances(a: AllowanceView, b: AllowanceView) {
  const order = { active: 0, syncing: 1, depleted: 2, expired: 3, revoked: 4 };
  const statusDifference = order[a.status] - order[b.status];
  if (statusDifference !== 0) return statusDifference;
  return a.expiryTs < b.expiryTs ? -1 : a.expiryTs > b.expiryTs ? 1 : 0;
}
