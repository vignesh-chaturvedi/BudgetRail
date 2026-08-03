"use client";

import { useState } from "react";
import type { AgentPaymentEvent } from "../../../packages/x402-adapter/src";
import type { Phase3DemoResult } from "../../lib/phase3/demo-runtime";
import { formatUsdcAmount } from "../../lib/allowances/model";
import { ellipsify } from "../../lib/explorer";

type LabStatus = "idle" | "running" | "success" | "error";

type StreamMessage =
  | { type: "stage"; event: AgentPaymentEvent }
  | { type: "complete"; result: Phase3DemoResult }
  | { type: "error"; error: { code: string; message: string } };

export function AutonomousPaymentLab() {
  const [status, setStatus] = useState<LabStatus>("idle");
  const [events, setEvents] = useState<AgentPaymentEvent[]>([]);
  const [result, setResult] = useState<Phase3DemoResult>();
  const [error, setError] = useState<{ code: string; message: string }>();

  const runProof = async () => {
    setStatus("running");
    setEvents([]);
    setResult(undefined);
    setError(undefined);

    try {
      const response = await fetch("/api/agent/purchase", { method: "POST" });
      if (!response.ok || !response.body) {
        throw new Error(`The proof endpoint returned HTTP ${response.status}.`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const message = JSON.parse(line) as StreamMessage;
          if (message.type === "stage") {
            setEvents((current) => [...current, message.event]);
          } else if (message.type === "complete") {
            completed = true;
            setResult(message.result);
            setStatus("success");
          } else {
            completed = true;
            setError(message.error);
            setStatus("error");
          }
        }

        if (done) break;
      }

      if (!completed) {
        throw new Error("The proof stream closed before returning a result.");
      }
    } catch (caught) {
      setError({
        code: "PROOF_STREAM_FAILED",
        message:
          caught instanceof Error
            ? caught.message
            : "The autonomous payment proof could not run.",
      });
      setStatus("error");
    }
  };

  return (
    <section
      aria-labelledby="autonomous-payment-title"
      className="mt-16 border-t border-border pt-12 sm:mt-20 sm:pt-16"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-info/30 bg-info/10 px-2.5 py-1 text-xs font-semibold text-info">
              Phase 3 live proof
            </span>
            <span className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-xs text-muted">
              x402 exact · 0.10 USDC
            </span>
          </div>
          <h2
            id="autonomous-payment-title"
            className="mt-5 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl"
          >
            Watch the agent buy a protected result.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted sm:text-base sm:leading-7">
            One action runs the real request → challenge → validate → pay →
            retry loop against an isolated Surfpool fork of Solana devnet. No
            wallet popup and no mocked settlement.
          </p>
        </div>

        <button
          type="button"
          onClick={runProof}
          disabled={status === "running"}
          aria-busy={status === "running"}
          className="min-h-12 w-full rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none sm:w-auto"
        >
          {status === "running"
            ? "Agent is purchasing…"
            : result
              ? "Run another purchase"
              : "Run autonomous purchase"}
        </button>
      </div>

      <div className="mt-8 grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <article className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                Deterministic agent
              </p>
              <h3 className="mt-2 text-lg font-semibold">Payment lifecycle</h3>
            </div>
            <StatusBadge status={status} />
          </div>

          {events.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-border bg-secondary/50 p-6 text-center">
              <p className="text-sm font-semibold">Ready for the first run</p>
              <p className="mt-2 text-xs leading-5 text-muted">
                Start the purchase to stream each policy and settlement stage
                here.
              </p>
            </div>
          ) : (
            <ol className="mt-6 space-y-1" aria-live="polite">
              {events.map((event, index) => (
                <li
                  key={`${event.at}-${index}`}
                  className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 py-2"
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[0.625rem] font-semibold ${
                      status === "running" && index === events.length - 1
                        ? "border-info/40 bg-info/10 text-info"
                        : "border-success/30 bg-success/10 text-success"
                    }`}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {event.stage}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-muted">
                      {event.message}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {error && (
            <div
              className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-4"
              role="alert"
            >
              <p className="text-sm font-semibold">Proof run stopped</p>
              <p className="mt-1 font-mono text-xs text-destructive">
                {error.code}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">
                {error.message}
              </p>
              <button
                type="button"
                onClick={runProof}
                className="mt-4 min-h-10 rounded-lg border border-border bg-card px-3 text-xs font-semibold transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                Retry proof
              </button>
            </div>
          )}
        </article>

        <article className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Protected output
          </p>
          {!result ? (
            <div className="mt-6 min-h-64 rounded-lg bg-secondary/50 p-6">
              {status === "running" ? (
                <div role="status" aria-label="Waiting for protected result">
                  <div className="h-5 w-48 animate-pulse rounded bg-border motion-reduce:animate-none" />
                  <div className="mt-4 h-3 w-full animate-pulse rounded bg-border motion-reduce:animate-none" />
                  <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-border motion-reduce:animate-none" />
                  <div className="mt-8 grid grid-cols-3 gap-3">
                    {[0, 1, 2].map((item) => (
                      <div
                        key={item}
                        className="h-16 animate-pulse rounded bg-border motion-reduce:animate-none"
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-52 flex-col items-center justify-center text-center">
                  <p className="text-sm font-semibold">Locked by HTTP 402</p>
                  <p className="mt-2 max-w-sm text-xs leading-5 text-muted">
                    The merchant releases its spend-safety brief only after
                    facilitator verification and confirmed settlement.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <ProtectedResult result={result} />
          )}
        </article>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: LabStatus }) {
  const styles: Record<LabStatus, string> = {
    idle: "border-border bg-secondary text-muted",
    running: "border-info/30 bg-info/10 text-info",
    success: "border-success/30 bg-success/10 text-success",
    error: "border-destructive/30 bg-destructive/10 text-destructive",
  };
  const labels: Record<LabStatus, string> = {
    idle: "Idle",
    running: "Running",
    success: "Settled",
    error: "Failed",
  };
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function ProtectedResult({ result }: { result: Phase3DemoResult }) {
  const before = BigInt(result.allowance.beforeBaseUnits);
  const after = BigInt(result.allowance.afterBaseUnits);
  const paid = BigInt(result.allowance.paidBaseUnits);

  return (
    <div className="mt-5">
      <div className="rounded-lg border border-success/30 bg-success/10 p-4">
        <p className="text-sm font-semibold text-success">
          {result.artifact.title}
        </p>
        <p className="mt-2 text-xs leading-5 text-muted">
          {result.artifact.summary}
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
        <ResultMetric label="Before" amount={before} />
        <ResultMetric label="Paid" amount={paid} />
        <ResultMetric label="After" amount={after} emphasis />
      </dl>

      <div className="mt-5 space-y-3">
        {result.artifact.findings.map((finding) => (
          <div
            key={finding.title}
            className="rounded-lg border border-border p-4"
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  finding.severity === "pass" ? "bg-success" : "bg-info"
                }`}
                aria-hidden="true"
              />
              <p className="text-sm font-semibold">{finding.title}</p>
            </div>
            <p className="mt-2 break-words text-xs leading-5 text-muted">
              {finding.detail}
            </p>
          </div>
        ))}
      </div>

      <dl className="mt-5 grid gap-3 border-t border-border pt-5 text-xs sm:grid-cols-2">
        <ResultDetail
          label="Transaction"
          value={ellipsify(result.transaction, 8)}
        />
        <ResultDetail
          label="Delegation"
          value={ellipsify(result.addresses.delegation, 8)}
        />
        <ResultDetail
          label="Agent"
          value={ellipsify(result.addresses.agent, 8)}
        />
        <ResultDetail label="Network" value="Surfpool devnet fork" />
      </dl>
      <p className="mt-4 text-xs leading-5 text-muted">
        Local signatures are isolated proof evidence and are not visible on the
        public Solana Explorer.
      </p>
    </div>
  );
}

function ResultMetric({
  label,
  amount,
  emphasis,
}: {
  label: string;
  amount: bigint;
  emphasis?: boolean;
}) {
  return (
    <div className="bg-card p-3 sm:p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`mt-1 font-mono text-sm font-semibold tabular-nums ${
          emphasis ? "text-success" : ""
        }`}
      >
        {formatUsdcAmount(amount)}
        <span className="ml-1 text-xs font-normal text-muted">USDC</span>
      </dd>
    </div>
  );
}

function ResultDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 font-mono font-medium">{value}</dd>
    </div>
  );
}
