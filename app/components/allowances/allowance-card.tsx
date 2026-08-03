"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { useCluster } from "../cluster-context";
import { useSubscriptionsClient } from "../../lib/hooks/use-subscriptions-client";
import { useAllowanceRecords } from "../../lib/hooks/use-allowance-records";
import { revokeFixedAllowance } from "../../lib/allowances/actions";
import { classifyAllowanceError } from "../../lib/allowances/errors";
import {
  formatUsdcAmount,
  isSupportedAllowanceCluster,
  type AllowanceRecord,
  type AllowanceStatus,
  type AllowanceView,
} from "../../lib/allowances/model";
import { ellipsify } from "../../lib/explorer";

const STATUS_LABELS: Record<AllowanceStatus, string> = {
  active: "Active",
  depleted: "Depleted",
  expired: "Expired",
  revoked: "Revoked",
  syncing: "Syncing",
};

const STATUS_CLASSES: Record<AllowanceStatus, string> = {
  active: "border-success/30 bg-success/10 text-success",
  depleted: "border-warning/30 bg-warning/10 text-warning-foreground",
  expired: "border-border bg-secondary text-muted",
  revoked: "border-destructive/30 bg-destructive/10 text-destructive",
  syncing: "border-info/30 bg-info/10 text-info",
};

export function AllowanceCard({
  allowance,
  record,
}: {
  allowance: AllowanceView;
  record?: AllowanceRecord;
}) {
  const { cluster, getExplorerUrl } = useCluster();
  const client = useSubscriptionsClient();
  const { mutate } = useSWRConfig();
  const { saveRecord, saveRevocation } = useAllowanceRecords();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string>();
  const [error, setError] =
    useState<ReturnType<typeof classifyAllowanceError>>();

  const canRevoke =
    allowance.status !== "revoked" && allowance.status !== "syncing";
  const progressBasisPoints =
    allowance.capBaseUnits === 0n
      ? 0n
      : (allowance.spentBaseUnits * 10_000n) / allowance.capBaseUnits;
  const progress = Number(progressBasisPoints) / 100;

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(undefined), 1_500);
  };

  const handleRevoke = async () => {
    if (!client || !isSupportedAllowanceCluster(cluster)) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await revokeFixedAllowance({
        client,
        cluster,
        delegationAddress: allowance.address,
      });

      if (!record) {
        saveRecord({
          version: 1,
          cluster,
          address: allowance.address,
          owner: allowance.owner,
          delegatee: allowance.delegatee,
          mint: allowance.mint,
          nonce: "0",
          capBaseUnits: allowance.capBaseUnits.toString(),
          expiryTs: allowance.expiryTs.toString(),
          createdAt: new Date().toISOString(),
          createSignature: allowance.createSignature ?? "",
        });
      }
      saveRevocation({
        cluster,
        address: allowance.address,
        revokedAt: new Date().toISOString(),
        revokeSignature: result.revokeSignature,
      });
      await mutate(
        (key) => Array.isArray(key) && key[0] === "fixed-allowances"
      );
      setConfirming(false);
      toast.success(
        result.alreadyRevoked
          ? "Allowance was already revoked"
          : "Access revoked"
      );
    } catch (caught) {
      setError(classifyAllowanceError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Agent allowance
          </p>
          <button
            type="button"
            onClick={() => copy("agent", allowance.delegatee)}
            className="mt-2 min-h-10 rounded-md font-mono text-lg font-semibold tracking-tight transition-colors hover:text-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            aria-label="Copy agent wallet address"
          >
            {copied === "agent"
              ? "Copied agent address"
              : ellipsify(allowance.delegatee, 7)}
          </button>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[allowance.status]}`}
        >
          {STATUS_LABELS[allowance.status]}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Metric label="Cap" value={allowance.capBaseUnits} />
        <Metric label="Spent" value={allowance.spentBaseUnits} />
        <Metric
          label="Remaining"
          value={allowance.remainingBaseUnits}
          emphasis
        />
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          role="progressbar"
          aria-label="Allowance spent"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        />
      </div>

      <dl className="mt-6 grid gap-4 border-t border-border pt-5 text-sm sm:grid-cols-2">
        <Detail
          label="Expires"
          value={new Date(Number(allowance.expiryTs) * 1000).toLocaleString()}
        />
        <Detail label="Mint" value={ellipsify(allowance.mint, 6)} mono />
        <Detail
          label="Delegation PDA"
          value={ellipsify(allowance.address, 6)}
          mono
        />
        <Detail
          label="Cap source"
          value={
            allowance.capSource === "creation-record"
              ? "BudgetRail creation record"
              : "Current on-chain balance"
          }
        />
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copy("pda", allowance.address)}
          className="min-h-10 rounded-lg border border-border px-3 text-xs font-semibold transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          {copied === "pda" ? "Copied" : "Copy PDA"}
        </button>
        <a
          href={getExplorerUrl(`/address/${allowance.address}`)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-xs font-semibold transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          View account
        </a>
        {allowance.createSignature && (
          <a
            href={getExplorerUrl(`/tx/${allowance.createSignature}`)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-xs font-semibold transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            Creation tx
          </a>
        )}
      </div>

      {error && (
        <div
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4"
          role="alert"
        >
          <p className="text-sm font-semibold">{error.title}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{error.message}</p>
        </div>
      )}

      {canRevoke && !confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-5 min-h-11 w-full rounded-lg border border-destructive/40 px-4 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive motion-reduce:transition-none"
        >
          Revoke agent access
        </button>
      )}

      {canRevoke && confirming && (
        <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm font-semibold">Revoke this allowance?</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            This closes the delegation account immediately. The agent cannot use
            its remaining {formatUsdcAmount(allowance.remainingBaseUnits)} USDC
            authority after confirmation.
          </p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="min-h-10 flex-1 rounded-lg border border-border bg-card px-3 text-xs font-semibold transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none"
            >
              Keep active
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={busy}
              aria-busy={busy}
              className="min-h-10 flex-1 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
            >
              {busy ? "Revoking…" : "Confirm revoke"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function Metric({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: bigint;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-1 font-mono text-sm font-semibold tabular-nums sm:text-base ${
          emphasis ? "text-success" : ""
        }`}
      >
        {formatUsdcAmount(value)}
        <span className="ml-1 text-xs font-normal text-muted">USDC</span>
      </p>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 text-sm font-medium ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
