"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { SUBSCRIPTIONS_PROGRAM_ADDRESS } from "@solana/subscriptions";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { useCluster } from "../cluster-context";
import { useWallet } from "../../lib/wallet/context";
import { useSubscriptionsClient } from "../../lib/hooks/use-subscriptions-client";
import { useTokenBalance } from "../../lib/hooks/use-token-balance";
import { useBalance } from "../../lib/hooks/use-balance";
import { useAllowanceRecords } from "../../lib/hooks/use-allowance-records";
import {
  createFixedAllowance,
  MINIMUM_SETUP_LAMPORTS,
  type CreateAllowanceResult,
  type CreateAllowanceStage,
} from "../../lib/allowances/actions";
import { classifyAllowanceError } from "../../lib/allowances/errors";
import {
  formatUsdcAmount,
  getUsdcMint,
  isSupportedAllowanceCluster,
  validateAllowanceDraft,
  type AllowanceDraft,
  type AllowanceDraftErrors,
} from "../../lib/allowances/model";
import { ellipsify } from "../../lib/explorer";

type FormValues = {
  delegatee: string;
  amount: string;
  expiry: string;
};

const INITIAL_VALUES: FormValues = {
  delegatee: "",
  amount: "2",
  expiry: "",
};

const STAGE_LABELS: Record<CreateAllowanceStage, string> = {
  checking: "Checking balances and account state…",
  setup: "Setting up your USDC authority…",
  creating: "Creating the fixed allowance…",
  confirmed: "Confirmed on Solana",
};

export function CreateAllowancePanel() {
  const { cluster, getExplorerUrl } = useCluster();
  const { signer, wallet } = useWallet();
  const client = useSubscriptionsClient();
  const { mutate } = useSWRConfig();
  const { saveRecord } = useAllowanceRecords();
  const mint = useMemo(() => getUsdcMint(cluster), [cluster]);
  const tokenBalance = useTokenBalance(mint);
  const solBalance = useBalance(wallet?.account.address);

  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [fieldErrors, setFieldErrors] = useState<AllowanceDraftErrors>({});
  const [draft, setDraft] = useState<AllowanceDraft>();
  const [stage, setStage] = useState<CreateAllowanceStage>();
  const [formError, setFormError] =
    useState<ReturnType<typeof classifyAllowanceError>>();
  const [result, setResult] = useState<CreateAllowanceResult>();

  const delegateeRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);

  const supportedCluster = isSupportedAllowanceCluster(cluster);
  const isBusy = stage !== undefined && stage !== "confirmed";
  const readinessLoading = tokenBalance.isLoading || solBalance.isLoading;
  const hasEnoughSol =
    solBalance.lamports !== null &&
    solBalance.lamports >= MINIMUM_SETUP_LAMPORTS;
  const hasEnoughUsdc =
    draft !== undefined &&
    tokenBalance.data !== undefined &&
    tokenBalance.data.amount >= draft.capBaseUnits;

  const updateValue = (key: keyof FormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(undefined);
    setResult(undefined);
    setStage(undefined);
  };

  const setExpiryFromHours = (hours: number) => {
    const date = new Date(Date.now() + hours * 60 * 60 * 1000);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    updateValue("expiry", local);
  };

  const handleReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(undefined);
    setFormError(undefined);

    if (!supportedCluster) {
      setFormError(
        classifyAllowanceError(new Error(`Unsupported cluster: ${cluster}`))
      );
      return;
    }

    const parsed = validateAllowanceDraft(
      values,
      BigInt(Math.floor(Date.now() / 1000))
    );
    setFieldErrors(parsed.errors);
    if (!parsed.draft) {
      if (parsed.errors.delegatee) delegateeRef.current?.focus();
      else if (parsed.errors.amount) amountRef.current?.focus();
      else if (parsed.errors.expiry) expiryRef.current?.focus();
      return;
    }
    setDraft(parsed.draft);
  };

  const handleCreate = async () => {
    if (!client || !signer || !wallet || !draft || !supportedCluster) return;
    setFormError(undefined);
    setResult(undefined);

    try {
      const next = await createFixedAllowance({
        client,
        cluster,
        owner: wallet.account.address,
        mint,
        draft,
        onStage: setStage,
      });
      saveRecord(next.record);
      setResult(next);
      setStage(undefined);
      setValues(INITIAL_VALUES);
      setDraft(undefined);
      await Promise.all([
        mutate((key) => Array.isArray(key) && key[0] === "fixed-allowances"),
        mutate((key) => Array.isArray(key) && key[0] === "token-balance"),
      ]);
      toast.success("Allowance created", {
        description: `${formatUsdcAmount(
          BigInt(next.record.capBaseUnits)
        )} USDC is now available to the agent.`,
      });
    } catch (error) {
      setStage(undefined);
      setFormError(classifyAllowanceError(error));
    }
  };

  return (
    <section
      aria-labelledby="create-allowance-title"
      className="rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            New rail
          </p>
          <h2
            id="create-allowance-title"
            className="mt-2 text-xl font-semibold tracking-tight"
          >
            Grant agent access
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted">
            Set the maximum USDC this agent can spend and when its authority
            expires.
          </p>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 font-mono text-xs text-muted">
          fixed
        </span>
      </div>

      {!supportedCluster && (
        <InlineNotice
          tone="warning"
          title="This cluster is read-only"
          message="Switch to devnet or localnet to create a Phase 2 allowance. Mainnet stays disabled until the final safety review."
        />
      )}

      {result && (
        <div
          className="mt-6 rounded-lg border border-success/30 bg-success/10 p-4"
          role="status"
        >
          <p className="text-sm font-semibold text-success">
            Allowance confirmed
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            The fixed delegation is live and visible in the allowance list.
          </p>
          <a
            href={getExplorerUrl(`/tx/${result.createSignature}`)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-10 items-center text-xs font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
          >
            View creation transaction
          </a>
        </div>
      )}

      {!draft ? (
        <form onSubmit={handleReview} className="mt-6 space-y-5" noValidate>
          <div>
            <label htmlFor="delegatee" className="text-sm font-medium">
              Agent wallet
            </label>
            <input
              ref={delegateeRef}
              id="delegatee"
              name="delegatee"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={values.delegatee}
              onChange={(event) => updateValue("delegatee", event.target.value)}
              placeholder="Agent’s Solana address"
              aria-invalid={fieldErrors.delegatee ? "true" : undefined}
              aria-describedby={
                fieldErrors.delegatee ? "delegatee-error" : "delegatee-help"
              }
              className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm shadow-none transition-colors placeholder:text-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none motion-reduce:transition-none"
            />
            {fieldErrors.delegatee ? (
              <p
                id="delegatee-error"
                className="mt-1.5 text-xs text-destructive"
              >
                {fieldErrors.delegatee}
              </p>
            ) : (
              <p id="delegatee-help" className="mt-1.5 text-xs text-muted">
                Only this wallet can authorize delegated x402 payments.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="allowance-amount" className="text-sm font-medium">
              Spending cap
            </label>
            <div className="relative mt-2">
              <input
                ref={amountRef}
                id="allowance-amount"
                name="amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={values.amount}
                onChange={(event) => updateValue("amount", event.target.value)}
                aria-invalid={fieldErrors.amount ? "true" : undefined}
                aria-describedby={
                  fieldErrors.amount ? "amount-error" : "amount-help"
                }
                className="min-h-11 w-full rounded-lg border border-input bg-background px-3 pr-16 font-mono text-sm tabular-nums transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none motion-reduce:transition-none"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-muted">
                USDC
              </span>
            </div>
            {fieldErrors.amount ? (
              <p id="amount-error" className="mt-1.5 text-xs text-destructive">
                {fieldErrors.amount}
              </p>
            ) : (
              <p id="amount-help" className="mt-1.5 text-xs text-muted">
                Exact to six decimals. The program rejects spending above this
                cap.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="allowance-expiry" className="text-sm font-medium">
                Expiry
              </label>
              <div className="flex gap-1.5" aria-label="Quick expiry options">
                <button
                  type="button"
                  onClick={() => setExpiryFromHours(24)}
                  className="min-h-10 rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  24h
                </button>
                <button
                  type="button"
                  onClick={() => setExpiryFromHours(168)}
                  className="min-h-10 rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  7d
                </button>
              </div>
            </div>
            <input
              ref={expiryRef}
              id="allowance-expiry"
              name="expiry"
              type="datetime-local"
              autoComplete="off"
              value={values.expiry}
              onChange={(event) => updateValue("expiry", event.target.value)}
              aria-invalid={fieldErrors.expiry ? "true" : undefined}
              aria-describedby={
                fieldErrors.expiry ? "expiry-error" : "expiry-help"
              }
              className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none motion-reduce:transition-none"
            />
            {fieldErrors.expiry ? (
              <p id="expiry-error" className="mt-1.5 text-xs text-destructive">
                {fieldErrors.expiry}
              </p>
            ) : (
              <p id="expiry-help" className="mt-1.5 text-xs text-muted">
                After this time, delegated transfers fail on-chain.
              </p>
            )}
          </div>

          {formError && (
            <InlineNotice
              tone={formError.code === "wallet-rejected" ? "neutral" : "error"}
              title={formError.title}
              message={formError.message}
            />
          )}

          <button
            type="submit"
            disabled={!supportedCluster}
            className="min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
          >
            Review allowance
          </button>
        </form>
      ) : (
        <div className="mt-6" aria-live="polite">
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              Signature review
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <ReviewRow label="Network" value={cluster} />
              <ReviewRow
                label="Owner"
                value={ellipsify(wallet?.account.address ?? "", 6)}
                mono
              />
              <ReviewRow
                label="Agent"
                value={ellipsify(draft.delegatee, 6)}
                mono
              />
              <ReviewRow
                label="Maximum"
                value={`${formatUsdcAmount(draft.capBaseUnits)} USDC`}
                mono
              />
              <ReviewRow
                label="Expires"
                value={new Date(Number(draft.expiryTs) * 1000).toLocaleString()}
              />
              <ReviewRow label="Mint" value={ellipsify(mint, 6)} mono />
              <ReviewRow
                label="Program"
                value={ellipsify(SUBSCRIPTIONS_PROGRAM_ADDRESS, 6)}
                mono
              />
            </dl>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <ReadinessItem
              label="Devnet SOL"
              loading={solBalance.isLoading}
              ready={hasEnoughSol}
              value={hasEnoughSol ? "Ready" : "Needs funding"}
            />
            <ReadinessItem
              label="USDC balance"
              loading={tokenBalance.isLoading}
              ready={hasEnoughUsdc}
              value={
                tokenBalance.data
                  ? `${formatUsdcAmount(tokenBalance.data.amount)} USDC`
                  : "Checking"
              }
            />
          </div>

          {!readinessLoading && !hasEnoughUsdc && (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4">
              <p className="text-sm font-semibold text-warning-foreground">
                Fund this wallet with devnet USDC
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                The cap is enforced on-chain, but the agent cannot pay until the
                owner’s token account has enough funds.
              </p>
              {cluster === "devnet" && (
                <a
                  href="https://faucet.circle.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Open Circle testnet faucet
                </a>
              )}
            </div>
          )}

          {formError && (
            <InlineNotice
              tone={formError.code === "wallet-rejected" ? "neutral" : "error"}
              title={formError.title}
              message={formError.message}
            />
          )}

          <p className="mt-4 text-xs leading-5 text-muted">
            First use may request one setup signature and one allowance
            signature. Each transaction is simulated before submission by the
            RPC planner.
          </p>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setDraft(undefined);
                setStage(undefined);
                setFormError(undefined);
              }}
              disabled={isBusy}
              className="min-h-11 flex-1 rounded-lg border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={
                isBusy || readinessLoading || !hasEnoughSol || !hasEnoughUsdc
              }
              aria-busy={isBusy}
              className="min-h-11 flex-[2] rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
            >
              {stage ? STAGE_LABELS[stage] : "Create & sign"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ReviewRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd
        className={`max-w-[68%] text-right font-medium ${
          mono ? "font-mono tabular-nums" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function ReadinessItem({
  label,
  value,
  loading,
  ready,
}: {
  label: string;
  value: string;
  loading: boolean;
  ready: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
        <span
          className={`size-2 rounded-full ${
            loading ? "bg-muted" : ready ? "bg-success" : "bg-warning"
          }`}
          aria-hidden="true"
        />
        {loading ? "Checking…" : value}
      </p>
    </div>
  );
}

function InlineNotice({
  tone,
  title,
  message,
}: {
  tone: "neutral" | "warning" | "error";
  title: string;
  message: string;
}) {
  const classes =
    tone === "error"
      ? "border-destructive/30 bg-destructive/10"
      : tone === "warning"
        ? "border-warning/30 bg-warning/10"
        : "border-border bg-secondary";
  return (
    <div className={`mt-5 rounded-lg border p-4 ${classes}`} role="alert">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{message}</p>
    </div>
  );
}
