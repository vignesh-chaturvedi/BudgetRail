"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentPaymentEvent } from "../../../packages/x402-adapter/src";
import type {
  DemoActivity,
  Phase3DemoResult,
  Phase4DemoState,
} from "../../lib/phase3/demo-runtime";
import { formatUsdcAmount } from "../../lib/allowances/model";
import { ellipsify } from "../../lib/explorer";

type ConsoleStatus =
  "loading" | "ready" | "purchasing" | "revoking" | "resetting" | "error";

type Notice = {
  tone: "success" | "denied" | "error";
  title: string;
  message: string;
};

type StreamMessage =
  | { type: "stage"; event: AgentPaymentEvent }
  | { type: "complete"; result: Phase3DemoResult }
  | { type: "error"; error: { code: string; message: string } };

async function fetchDemoState(signal?: AbortSignal) {
  const response = await fetch("/api/demo/state", {
    cache: "no-store",
    signal,
  });
  const body = await readBody(response);
  if (!response.ok) throw new Error(errorMessage(body));
  return body as Phase4DemoState;
}

export function OperatorConsole() {
  const [state, setState] = useState<Phase4DemoState>();
  const [status, setStatus] = useState<ConsoleStatus>("loading");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [stage, setStage] = useState<AgentPaymentEvent>();
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [copied, setCopied] = useState<string>();

  const loadState = useCallback(async (signal?: AbortSignal) => {
    const next = await fetchDemoState(signal);
    setState(next);
    setError(undefined);
    return next;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchDemoState(controller.signal)
      .then((next) => {
        setState(next);
        setError(undefined);
        setStatus("ready");
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "The judge console could not load."
        );
        setStatus("error");
      });
    return () => controller.abort();
  }, [loadState]);

  const runPurchase = async () => {
    setStatus("purchasing");
    setNotice(undefined);
    setError(undefined);
    setStage({
      stage: "bootstrapping",
      message: "Checking the registered identity and live allowance.",
      at: new Date().toISOString(),
    });

    try {
      const response = await fetch("/api/agent/purchase", { method: "POST" });
      if (!response.ok || !response.body) {
        throw new Error(
          `The payment endpoint returned HTTP ${response.status}.`
        );
      }
      const outcome = await readPurchaseStream(response.body, setStage);
      const refreshed = await loadState();
      if (outcome.type === "complete") {
        setNotice({
          tone: "success",
          title: "Protected result unlocked",
          message: `${outcome.result.artifact.title} was delivered after a confirmed 0.10 USDC settlement.`,
        });
      } else if (refreshed.railStatus === "revoked") {
        setNotice({
          tone: "denied",
          title: "Post-revoke payment blocked",
          message:
            "The rail is closed, so the agent failed before it could spend or unlock the resource.",
        });
      } else {
        throw new Error(outcome.error.message);
      }
      setStatus("ready");
    } catch (caught) {
      await loadState().catch(() => undefined);
      setNotice({
        tone: "error",
        title: "Payment run stopped",
        message:
          caught instanceof Error
            ? caught.message
            : "The autonomous payment could not complete.",
      });
      setStatus("ready");
    }
  };

  const revoke = async () => {
    setStatus("revoking");
    setNotice(undefined);
    setError(undefined);
    try {
      const response = await fetch("/api/demo/revoke", { method: "POST" });
      const body = await readBody(response);
      if (!response.ok) throw new Error(errorMessage(body));
      setState(body as Phase4DemoState);
      setConfirmingRevoke(false);
      setNotice({
        tone: "success",
        title: "Kill switch confirmed",
        message:
          "The delegation account is closed. Run the agent once more to prove the post-revoke denial.",
      });
      setStatus("ready");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The revocation transaction failed."
      );
      setStatus("ready");
    }
  };

  const reset = async () => {
    setStatus("resetting");
    setNotice(undefined);
    setError(undefined);
    setStage(undefined);
    setConfirmingRevoke(false);
    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      const body = await readBody(response);
      if (!response.ok) throw new Error(errorMessage(body));
      setState(body as Phase4DemoState);
      setNotice({
        tone: "success",
        title: "Fresh demo rail ready",
        message:
          "New disposable wallets, registry identity, and 2.00 USDC allowance were created.",
      });
      setStatus("ready");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The demo could not be reset."
      );
      setStatus("ready");
    }
  };

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(undefined), 1_500);
  };

  if (status === "loading") return <ConsoleSkeleton />;
  if (status === "error" || !state) {
    return (
      <section className="mt-16 border-t border-border pt-12 sm:mt-20 sm:pt-16">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
          <p className="text-sm font-semibold">Couldn’t start judge mode</p>
          <p className="mt-2 max-w-xl text-xs leading-5 text-muted">{error}</p>
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              void loadState()
                .then(() => setStatus("ready"))
                .catch((caught) => {
                  setError(errorMessage(caught));
                  setStatus("error");
                });
            }}
            className="mt-4 min-h-10 rounded-lg border border-border bg-card px-4 text-xs font-semibold transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            Retry setup
          </button>
        </div>
      </section>
    );
  }

  const busy = ["purchasing", "revoking", "resetting"].includes(status);
  const paid = state.activities.some(
    (activity) => activity.kind === "payment-settled"
  );
  const denied = state.activities.some(
    (activity) => activity.kind === "payment-denied"
  );

  return (
    <section
      aria-labelledby="operator-console-title"
      className="mt-16 border-t border-border pt-12 sm:mt-20 sm:pt-16"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
              Phase 4 judge mode
            </span>
            <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 font-mono text-xs text-warning-foreground">
              isolated devnet fork
            </span>
          </div>
          <h2
            id="operator-console-title"
            className="mt-5 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl"
          >
            One screen. Every actor and receipt.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted sm:text-base sm:leading-7">
            BudgetRail registers the buyer through Solana Agent Registry, links
            its payment wallet, and keeps the owner, merchant, budget, and
            policy trail readable without narration.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={runPurchase}
            disabled={busy}
            aria-busy={status === "purchasing"}
            className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
          >
            {status === "purchasing"
              ? "Agent is running…"
              : state.railStatus === "revoked"
                ? "Prove post-revoke denial"
                : paid
                  ? "Run another 0.10 payment"
                  : "Run 0.10 USDC task"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            aria-busy={status === "resetting"}
            className="min-h-11 rounded-lg border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
          >
            {status === "resetting" ? "Seeding fresh rail…" : "Reset demo"}
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <IdentityCard
          label="Owner"
          title="Budget authority"
          address={state.participants.owner}
          copy={() => copy("owner", state.participants.owner)}
          copied={copied === "owner"}
        />
        <IdentityCard
          label="Registered agent"
          title="BudgetRail Agent"
          address={state.identity.asset}
          copy={() => copy("identity", state.identity.asset)}
          copied={copied === "identity"}
          href={explorerAddress(state.identity.asset, state.rpcUrl)}
        />
        <IdentityCard
          label="Operational wallet"
          title="x402 payment signer"
          address={state.participants.agent}
          copy={() => copy("agent", state.participants.agent)}
          copied={copied === "agent"}
          verified={
            state.identity.operationalWallet === state.participants.agent
          }
        />
        <IdentityCard
          label="Merchant"
          title="Protected research API"
          address={state.participants.merchant}
          copy={() => copy("merchant", state.participants.merchant)}
          copied={copied === "merchant"}
        />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <div className="space-y-6">
          <BudgetCard state={state} />
          <DemoGuide
            identityReady={state.identity.verified}
            paid={paid}
            revoked={state.railStatus === "revoked"}
            denied={denied}
          />
          <KillSwitch
            state={state}
            busy={busy}
            confirming={confirmingRevoke}
            setConfirming={setConfirmingRevoke}
            revoke={revoke}
            revoking={status === "revoking"}
          />
        </div>

        <div className="min-w-0 space-y-6">
          {(stage || notice || error) && (
            <RunFeedback stage={stage} notice={notice} error={error} />
          )}
          <ActivityLog activities={state.activities} rpcUrl={state.rpcUrl} />
        </div>
      </div>
    </section>
  );
}

function IdentityCard({
  label,
  title,
  address,
  copy,
  copied,
  href,
  verified,
}: {
  label: string;
  title: string;
  address: string;
  copy: () => void;
  copied: boolean;
  href?: string;
  verified?: boolean;
}) {
  return (
    <article className="min-w-0 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          {label}
        </p>
        {verified && (
          <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
            Linked
          </span>
        )}
      </div>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <button
        type="button"
        onClick={copy}
        className="mt-2 min-h-10 max-w-full rounded-md font-mono text-xs text-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        aria-label={`Copy ${label.toLowerCase()} address`}
      >
        {copied ? "Copied" : ellipsify(address, 7)}
      </button>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold underline decoration-border underline-offset-4 transition-colors hover:text-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          Inspect identity ↗
        </a>
      )}
    </article>
  );
}

function BudgetCard({ state }: { state: Phase4DemoState }) {
  const cap = BigInt(state.budget.capBaseUnits);
  const spent = BigInt(state.budget.spentBaseUnits);
  const remaining = BigInt(state.budget.remainingBaseUnits);
  const progress = cap === 0n ? 0 : Number((spent * 10_000n) / cap) / 100;

  return (
    <article className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Fixed delegation
          </p>
          <h3 className="mt-2 text-xl font-semibold">
            2.00 USDC spending rail
          </h3>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
            state.railStatus === "active"
              ? "border-success/30 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {state.railStatus === "active" ? "Live" : "Revoked"}
        </span>
      </div>
      <dl className="mt-6 grid grid-cols-3 gap-3">
        <BudgetMetric label="Cap" value={cap} />
        <BudgetMetric label="Spent" value={spent} />
        <BudgetMetric label="Unused" value={remaining} emphasis />
      </dl>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          role="progressbar"
          aria-label="Budget spent"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        />
      </div>
      {state.railStatus === "revoked" && (
        <p className="mt-4 text-xs leading-5 text-muted">
          {formatUsdcAmount(remaining)} USDC was unused when access was revoked;
          it is no longer spendable by the agent.
        </p>
      )}
    </article>
  );
}

function BudgetMetric({
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
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`mt-1 font-mono text-sm font-semibold tabular-nums sm:text-base ${
          emphasis ? "text-success" : ""
        }`}
      >
        {formatUsdcAmount(value)}
        <span className="ml-1 text-xs font-normal text-muted">USDC</span>
      </dd>
    </div>
  );
}

function DemoGuide({
  identityReady,
  paid,
  revoked,
  denied,
}: {
  identityReady: boolean;
  paid: boolean;
  revoked: boolean;
  denied: boolean;
}) {
  const steps = [
    [identityReady, "Identity", "Agent registered and wallet linked"],
    [paid, "Pay", "Agent buys one 0.10 USDC result"],
    [revoked, "Revoke", "Owner closes the spending rail"],
    [denied, "Prove", "Next agent payment fails closed"],
  ] as const;
  return (
    <article className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">
        Four-step judge path
      </p>
      <ol className="mt-4 space-y-1">
        {steps.map(([done, title, detail], index) => (
          <li
            key={title}
            className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 py-2"
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                done
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-border bg-secondary text-muted"
              }`}
              aria-label={done ? "Complete" : "Pending"}
            >
              {done ? "✓" : index + 1}
            </span>
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted">{detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

function KillSwitch({
  state,
  busy,
  confirming,
  setConfirming,
  revoke,
  revoking,
}: {
  state: Phase4DemoState;
  busy: boolean;
  confirming: boolean;
  setConfirming: (value: boolean) => void;
  revoke: () => void;
  revoking: boolean;
}) {
  if (state.railStatus === "revoked") {
    return (
      <article className="rounded-xl border border-destructive/30 bg-destructive/10 p-5">
        <p className="text-sm font-semibold">Kill switch engaged</p>
        <p className="mt-2 text-xs leading-5 text-muted">
          Access is closed on-chain. Use “Prove post-revoke denial” above, or
          reset the demo for a new disposable rail.
        </p>
      </article>
    );
  }
  return (
    <article className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">
        Owner safety control
      </p>
      {!confirming ? (
        <>
          <h3 className="mt-2 text-lg font-semibold">Stop the agent now</h3>
          <p className="mt-2 text-xs leading-5 text-muted">
            Revocation closes the delegation account and removes all remaining
            payment authority immediately after confirmation.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="mt-4 min-h-11 w-full rounded-lg border border-destructive/40 px-4 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-60 motion-reduce:transition-none"
          >
            Revoke now
          </button>
        </>
      ) : (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm font-semibold">Close this spending rail?</p>
          <p className="mt-2 text-xs leading-5 text-muted">
            This cannot be undone on the current rail. Reset judge mode to seed
            a fresh disposable allowance.
          </p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="min-h-10 flex-1 rounded-lg border border-border bg-card px-3 text-xs font-semibold transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 motion-reduce:transition-none"
            >
              Keep active
            </button>
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              aria-busy={revoking}
              className="min-h-10 flex-1 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 disabled:opacity-60 motion-reduce:transition-none"
            >
              {revoking ? "Confirming…" : "Confirm revoke"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function RunFeedback({
  stage,
  notice,
  error,
}: {
  stage?: AgentPaymentEvent;
  notice?: Notice;
  error?: string;
}) {
  const tone = notice?.tone;
  return (
    <div
      className={`rounded-xl border p-5 ${
        tone === "success"
          ? "border-success/30 bg-success/10"
          : tone === "denied" || tone === "error" || error
            ? "border-destructive/30 bg-destructive/10"
            : "border-info/30 bg-info/10"
      }`}
      role={tone === "error" || error ? "alert" : "status"}
      aria-live="polite"
    >
      <p className="text-sm font-semibold">
        {notice?.title ?? (stage ? "Agent is working" : "Operator update")}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted">
        {notice?.message ?? error ?? stage?.message}
      </p>
      {stage && !notice && (
        <p className="mt-2 font-mono text-xs text-info">{stage.stage}</p>
      )}
    </div>
  );
}

function ActivityLog({
  activities,
  rpcUrl,
}: {
  activities: DemoActivity[];
  rpcUrl: string;
}) {
  return (
    <article className="min-w-0 rounded-xl border border-border bg-card">
      <div className="border-b border-border p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Verifiable activity
        </p>
        <h3 className="mt-2 text-xl font-semibold">Receipts and decisions</h3>
        <p className="mt-2 text-xs leading-5 text-muted">
          Signatures open in Solana Explorer against this live isolated ledger.
          Policy denials remain readable even when no transaction was signed.
        </p>
      </div>
      {activities.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm font-semibold">No activity yet</p>
          <p className="mt-2 text-xs text-muted">
            Reset judge mode to seed the first verifiable event.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-border">
          {activities.map((activity) => (
            <li
              key={activity.id}
              className="grid min-w-0 gap-3 p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:px-6"
            >
              <DecisionBadge decision={activity.decision} />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{activity.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {activity.detail}
                </p>
                <p className="mt-2 font-mono text-xs text-muted">
                  {new Date(activity.at).toLocaleTimeString()}
                </p>
              </div>
              {activity.signature ? (
                <a
                  href={explorerTransaction(activity.signature, rpcUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center justify-self-start rounded-lg border border-border px-3 text-xs font-semibold transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:justify-self-end"
                  title={activity.signature}
                >
                  {ellipsify(activity.signature, 5)} ↗
                </a>
              ) : (
                <span className="inline-flex min-h-10 items-center justify-self-start text-xs font-medium text-muted sm:justify-self-end">
                  No signature
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function DecisionBadge({ decision }: { decision: DemoActivity["decision"] }) {
  const style = {
    allowed: "border-success/30 bg-success/10 text-success",
    denied: "border-destructive/30 bg-destructive/10 text-destructive",
    control: "border-info/30 bg-info/10 text-info",
  }[decision];
  return (
    <span
      className={`inline-flex min-h-6 items-center justify-center justify-self-start rounded-full border px-2 text-xs font-semibold capitalize ${style}`}
    >
      {decision}
    </span>
  );
}

function ConsoleSkeleton() {
  return (
    <section
      className="mt-16 border-t border-border pt-12 sm:mt-20 sm:pt-16"
      aria-label="Starting Phase 4 judge mode"
      role="status"
    >
      <div className="h-7 w-40 animate-pulse rounded bg-border motion-reduce:animate-none" />
      <div className="mt-5 h-10 w-full max-w-xl animate-pulse rounded bg-border motion-reduce:animate-none" />
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-40 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none"
          />
        ))}
      </div>
      <p className="mt-5 text-xs text-muted">
        Registering a disposable agent identity and seeding its devnet rail…
      </p>
    </section>
  );
}

async function readPurchaseStream(
  stream: ReadableStream<Uint8Array>,
  onStage: (event: AgentPaymentEvent) => void
): Promise<Extract<StreamMessage, { type: "complete" | "error" }>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome:
    Extract<StreamMessage, { type: "complete" | "error" }> | undefined;
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line) as StreamMessage;
      if (message.type === "stage") onStage(message.event);
      else outcome = message;
    }
    if (done) break;
  }
  if (!outcome) throw new Error("The agent stream closed without an outcome.");
  return outcome;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function errorMessage(value: unknown) {
  if (value instanceof Error) return value.message;
  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }
  return "The request could not be completed.";
}

function explorerTransaction(signature: string, rpcUrl: string) {
  return explorerUrl(`/tx/${signature}`, rpcUrl);
}

function explorerAddress(address: string, rpcUrl: string) {
  return explorerUrl(`/address/${address}`, rpcUrl);
}

function explorerUrl(path: string, rpcUrl: string) {
  const url = new URL(path, "https://explorer.solana.com");
  url.searchParams.set("cluster", "custom");
  url.searchParams.set("customUrl", rpcUrl);
  return url.toString();
}
