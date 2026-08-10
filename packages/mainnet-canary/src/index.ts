import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

export const MAINNET_GENESIS_HASH =
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" as const;
export const MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" as const;
export const MAINNET_USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as const;
export const SUBSCRIPTIONS_PROGRAM =
  "De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44" as const;
export const TOKEN_PROGRAM =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as const;

export const ALLOWANCE_BASE_UNITS = 200_000n;
export const PAYMENT_BASE_UNITS = 100_000n;
export const OVER_BUDGET_BASE_UNITS = 300_000n;
export const USDC_DECIMALS = 6;
export const EXPIRY_SECONDS = 15 * 60;
export const MAX_TOTAL_SOL_LAMPORTS = 50_000_000n;
export const MIN_FACILITATOR_SOL_LAMPORTS = 10_000_000n;
export const MAINNET_ACKNOWLEDGEMENT =
  "BUDGETRAIL_MAINNET_CANARY_0.20_USDC" as const;

export const CANARY_ACTIONS = [
  "inspect",
  "keys",
  "addresses",
  "preflight",
  "run",
  "contain",
  "finalize",
  "verify",
  "sweep",
  "report",
] as const;

export type CanaryAction = (typeof CANARY_ACTIONS)[number];
export type CanaryRole = "owner" | "agent" | "facilitator" | "merchant";
export type CanaryEnvironment = Readonly<Record<string, string | undefined>>;

export type CanaryConfig = {
  action: CanaryAction;
  runId: string;
  repoRoot: string;
  rpcUrl?: string;
  rpcProvider?: string;
  evidenceDir: string;
  statePath: string;
  keyDir: string;
  keyPaths: Record<CanaryRole, string>;
  recoveryAddress?: string;
  allowPublicReadonly: boolean;
  execute: boolean;
};

export type CanaryCheck = {
  id: string;
  status: "pass" | "fail";
  detail: string;
};

export type CanaryBalances = {
  ownerUsdc: string;
  merchantUsdc: string;
  ownerSolLamports: string;
  agentSolLamports: string;
  facilitatorSolLamports: string;
  merchantSolLamports: string;
};

export type CanaryTransactionName =
  | "setup"
  | "delegation"
  | "payment"
  | "revoke"
  | "closeAuthority"
  | "clearTokenDelegate"
  | "sweepOwnerUsdc"
  | "sweepMerchantUsdc"
  | "closeOwnerAta"
  | "closeMerchantAta"
  | "sweepOwnerSol"
  | "sweepFacilitatorSol";

export type CanaryTransaction = {
  signature: string;
  finalizedSlot: string;
  explorerUrl: string;
};

export type CanaryEvidence = {
  schema: "budgetrail.mainnet-canary.v1";
  runId: string;
  status:
    | "keys-created"
    | "preflight-passed"
    | "running"
    | "canary-passed"
    | "contained"
    | "swept"
    | "aborted";
  createdAtUtc: string;
  updatedAtUtc: string;
  phase6Commit: string;
  canaryCommit?: string;
  network: typeof MAINNET_CAIP2;
  genesisHash: typeof MAINNET_GENESIS_HASH;
  subscriptionsProgram: typeof SUBSCRIPTIONS_PROGRAM;
  usdcMint: typeof MAINNET_USDC_MINT;
  rpcProvider?: string;
  parameters: {
    allowanceBaseUnits: string;
    paymentBaseUnits: string;
    overBudgetBaseUnits: string;
    expirySeconds: number;
    nonce: string;
    expiryTs?: string;
  };
  addresses: Partial<Record<CanaryRole, string>> & {
    ownerAta?: string;
    merchantAta?: string;
    subscriptionAuthority?: string;
    delegation?: string;
    recovery?: string;
  };
  checks: CanaryCheck[];
  balances: {
    before?: CanaryBalances;
    afterPayment?: CanaryBalances;
    afterNegativeTests?: CanaryBalances;
    afterSweep?: CanaryBalances;
  };
  transactions: Partial<Record<CanaryTransactionName, CanaryTransaction>>;
  negativeTests: {
    overBudget?: {
      policyCode: string;
      simulation: "rejected";
      reason: string;
      balancesUnchanged: boolean;
    };
    postRevoke?: {
      simulation: "rejected";
      reason: string;
      balancesUnchanged: boolean;
    };
  };
  verification?: {
    delegationMatched: boolean;
    paymentDeltaMatched: boolean;
    delegationClosed: boolean;
    authorityClosed: boolean;
    tokenDelegateCleared: boolean;
    ownerAtaClosed?: boolean;
    merchantAtaClosed?: boolean;
    finalSlot?: string;
  };
  events: Array<{
    atUtc: string;
    stage: string;
    result: "pass" | "fail" | "info";
    detail: string;
  }>;
};

const PUBLIC_RPC_HOSTS = new Set([
  "api.mainnet-beta.solana.com",
  "api.mainnet.solana.com",
]);

const RUN_ID_PATTERN = /^BR-MN-\d{8}-\d{3}$/;

function required(env: CanaryEnvironment, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for this action.`);
  return value;
}

export function isCanaryAction(value: string): value is CanaryAction {
  return CANARY_ACTIONS.includes(value as CanaryAction);
}

export function isPublicMainnetRpc(value: string) {
  try {
    return PUBLIC_RPC_HOSTS.has(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function deriveCanaryNonce(runId: string) {
  const digest = createHash("sha256").update(runId).digest();
  return digest.readBigUInt64LE(0);
}

export function isPathInside(parent: string, candidate: string) {
  const child = relative(resolve(parent), resolve(candidate));
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

export function parseCanaryConfig({
  action,
  env,
  repoRoot,
  execute,
}: {
  action: CanaryAction;
  env: CanaryEnvironment;
  repoRoot: string;
  execute: boolean;
}): CanaryConfig {
  const normalizedRepoRoot = resolve(repoRoot);
  const runId = env.BUDGETRAIL_CANARY_RUN_ID?.trim() || defaultRunId();
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error("BUDGETRAIL_CANARY_RUN_ID must match BR-MN-YYYYMMDD-NNN.");
  }

  const keyDir = resolve(
    env.BUDGETRAIL_CANARY_KEY_DIR?.trim() ||
      resolve(homedir(), ".config", "budgetrail", "mainnet-canary", runId)
  );
  const evidenceDir = resolve(
    env.BUDGETRAIL_CANARY_EVIDENCE_DIR?.trim() ||
      resolve(normalizedRepoRoot, "..", "BudgetRail-mainnet-evidence", runId)
  );
  if (isPathInside(normalizedRepoRoot, keyDir)) {
    throw new Error(
      "The mainnet key directory must be outside the repository."
    );
  }
  if (isPathInside(normalizedRepoRoot, evidenceDir)) {
    throw new Error("The evidence directory must be outside the repository.");
  }

  const ownerKeyPath = env.BUDGETRAIL_CANARY_OWNER_KEYPAIR?.trim();
  const agentKeyPath = env.BUDGETRAIL_CANARY_AGENT_KEYPAIR?.trim();
  const facilitatorKeyPath = env.BUDGETRAIL_CANARY_FACILITATOR_KEYPAIR?.trim();
  const merchantKeyPath = env.BUDGETRAIL_CANARY_MERCHANT_KEYPAIR?.trim();
  const keyPaths = {
    owner: ownerKeyPath ? resolve(ownerKeyPath) : resolve(keyDir, "owner.json"),
    agent: agentKeyPath ? resolve(agentKeyPath) : resolve(keyDir, "agent.json"),
    facilitator: facilitatorKeyPath
      ? resolve(facilitatorKeyPath)
      : resolve(keyDir, "facilitator.json"),
    merchant: merchantKeyPath
      ? resolve(merchantKeyPath)
      : resolve(keyDir, "merchant.json"),
  } satisfies Record<CanaryRole, string>;

  for (const [role, path] of Object.entries(keyPaths)) {
    if (isPathInside(normalizedRepoRoot, path)) {
      throw new Error(`${role} keypair must be stored outside the repository.`);
    }
  }

  const networkAction = !["keys", "addresses", "report"].includes(action);
  const rpcUrl = networkAction
    ? required(env, "BUDGETRAIL_MAINNET_RPC_URL")
    : env.BUDGETRAIL_MAINNET_RPC_URL?.trim();
  const rpcProvider = networkAction
    ? required(env, "BUDGETRAIL_MAINNET_RPC_PROVIDER")
    : env.BUDGETRAIL_MAINNET_RPC_PROVIDER?.trim();

  if (rpcUrl) {
    const parsed = new URL(rpcUrl);
    if (parsed.protocol !== "https:") {
      throw new Error("The mainnet RPC endpoint must use HTTPS.");
    }
    if (/devnet|testnet|localhost|127\.0\.0\.1/i.test(rpcUrl)) {
      throw new Error(
        "The RPC endpoint is not an acceptable mainnet endpoint."
      );
    }
  }

  const allowPublicReadonly =
    env.BUDGETRAIL_CANARY_ALLOW_PUBLIC_READONLY === "true";
  if (rpcUrl && isPublicMainnetRpc(rpcUrl)) {
    if (action !== "inspect" || !allowPublicReadonly || execute) {
      throw new Error(
        "Solana's public RPC is allowed only for an explicit read-only inspect. Configure a private provider before preflight or writes."
      );
    }
  }

  if (["run", "contain", "finalize", "sweep"].includes(action)) {
    if (!execute) {
      throw new Error(`${action} requires the --execute flag.`);
    }
    if (env.BUDGETRAIL_CANARY_ACK !== MAINNET_ACKNOWLEDGEMENT) {
      throw new Error(
        `Set BUDGETRAIL_CANARY_ACK to ${MAINNET_ACKNOWLEDGEMENT} only after reviewing the exact run plan.`
      );
    }
  }

  return {
    action,
    runId,
    repoRoot: normalizedRepoRoot,
    rpcUrl,
    rpcProvider,
    evidenceDir,
    statePath: resolve(evidenceDir, "state.json"),
    keyDir,
    keyPaths,
    recoveryAddress: env.BUDGETRAIL_CANARY_RECOVERY_ADDRESS?.trim(),
    allowPublicReadonly,
    execute,
  };
}

export function newCanaryEvidence(
  config: CanaryConfig,
  phase6Commit: string
): CanaryEvidence {
  const now = new Date().toISOString();
  return {
    schema: "budgetrail.mainnet-canary.v1",
    runId: config.runId,
    status: "keys-created",
    createdAtUtc: now,
    updatedAtUtc: now,
    phase6Commit,
    network: MAINNET_CAIP2,
    genesisHash: MAINNET_GENESIS_HASH,
    subscriptionsProgram: SUBSCRIPTIONS_PROGRAM,
    usdcMint: MAINNET_USDC_MINT,
    rpcProvider: config.rpcProvider,
    parameters: {
      allowanceBaseUnits: ALLOWANCE_BASE_UNITS.toString(),
      paymentBaseUnits: PAYMENT_BASE_UNITS.toString(),
      overBudgetBaseUnits: OVER_BUDGET_BASE_UNITS.toString(),
      expirySeconds: EXPIRY_SECONDS,
      nonce: deriveCanaryNonce(config.runId).toString(),
    },
    addresses: {},
    checks: [],
    balances: {},
    transactions: {},
    negativeTests: {},
    events: [],
  };
}

export function addCanaryEvent(
  evidence: CanaryEvidence,
  stage: string,
  result: "pass" | "fail" | "info",
  detail: string
) {
  evidence.updatedAtUtc = new Date().toISOString();
  evidence.events.push({
    atUtc: evidence.updatedAtUtc,
    stage,
    result,
    detail,
  });
}

export function explorerUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`;
}

export function renderCanaryMarkdown(evidence: CanaryEvidence) {
  const txRows = Object.entries(evidence.transactions)
    .map(
      ([name, tx]) =>
        `| ${name} | [${short(tx.signature)}](${tx.explorerUrl}) | ${tx.finalizedSlot} |`
    )
    .join("\n");
  const checkRows = evidence.checks
    .map(
      (check) =>
        `| ${check.id} | ${check.status.toUpperCase()} | ${escapeTable(check.detail)} |`
    )
    .join("\n");
  const eventRows = evidence.events
    .map(
      (event) =>
        `| ${event.atUtc} | ${event.stage} | ${event.result.toUpperCase()} | ${escapeTable(event.detail)} |`
    )
    .join("\n");

  return `# BudgetRail Phase 7 mainnet canary — ${evidence.runId}

> Status: **${evidence.status}**  
> Updated: ${evidence.updatedAtUtc}

## Fixed scope

- Network: \`${evidence.network}\`
- Subscriptions Program: \`${evidence.subscriptionsProgram}\`
- Canonical USDC: \`${evidence.usdcMint}\`
- Allowance: ${evidence.parameters.allowanceBaseUnits} base units (0.20 USDC)
- Valid settlement: ${evidence.parameters.paymentBaseUnits} base units (0.10 USDC)
- Rejected attempt: ${evidence.parameters.overBudgetBaseUnits} base units (0.30 USDC)
- Expiry window: ${evidence.parameters.expirySeconds} seconds
- Phase 6 baseline: \`${evidence.phase6Commit}\`
- Canary commit: \`${evidence.canaryCommit ?? "not-recorded"}\`
- RPC provider: ${evidence.rpcProvider ?? "not-recorded"}

## Public addresses

- Owner: \`${evidence.addresses.owner ?? "not-recorded"}\`
- Agent: \`${evidence.addresses.agent ?? "not-recorded"}\`
- Facilitator: \`${evidence.addresses.facilitator ?? "not-recorded"}\`
- Merchant: \`${evidence.addresses.merchant ?? "not-recorded"}\`
- Delegation: \`${evidence.addresses.delegation ?? "not-recorded"}\`
- Recovery: \`${evidence.addresses.recovery ?? "not-recorded"}\`

## Preflight checks

| Check | Result | Detail |
|---|---|---|
${checkRows || "| — | — | No checks recorded |"}

## Finalized transactions

| Stage | Transaction | Finalized slot |
|---|---|---:|
${txRows || "| — | — | — |"}

## Balance invariants

| Snapshot | Owner USDC | Merchant USDC | Owner SOL lamports | Facilitator SOL lamports |
|---|---:|---:|---:|---:|
${balanceRow("Before", evidence.balances.before)}
${balanceRow("After payment", evidence.balances.afterPayment)}
${balanceRow("After negative tests", evidence.balances.afterNegativeTests)}
${balanceRow("After sweep", evidence.balances.afterSweep)}

## Negative tests

- Over-budget policy: ${evidence.negativeTests.overBudget?.policyCode ?? "not-recorded"}
- Over-budget native simulation: ${evidence.negativeTests.overBudget?.simulation ?? "not-recorded"}
- Over-budget balances unchanged: ${String(evidence.negativeTests.overBudget?.balancesUnchanged ?? false)}
- Post-revoke native simulation: ${evidence.negativeTests.postRevoke?.simulation ?? "not-recorded"}
- Post-revoke balances unchanged: ${String(evidence.negativeTests.postRevoke?.balancesUnchanged ?? false)}

## Verification

- Delegation matched: ${String(evidence.verification?.delegationMatched ?? false)}
- Payment delta matched: ${String(evidence.verification?.paymentDeltaMatched ?? false)}
- Delegation closed: ${String(evidence.verification?.delegationClosed ?? false)}
- Authority closed: ${String(evidence.verification?.authorityClosed ?? false)}
- Token delegate cleared: ${String(evidence.verification?.tokenDelegateCleared ?? false)}
- Owner USDC account closed: ${String(evidence.verification?.ownerAtaClosed ?? false)}
- Merchant USDC account closed: ${String(evidence.verification?.merchantAtaClosed ?? false)}

## Event log

| UTC | Stage | Result | Detail |
|---|---|---|---|
${eventRows || "| — | — | — | No events recorded |"}

## Secret-handling statement

This report contains public addresses, transaction signatures, balances, and sanitized errors only. Keypair JSON, recovery material, authenticated RPC URLs, and API credentials are deliberately excluded.
`;
}

export function defaultRunId(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `BR-MN-${year}${month}${day}-001`;
}

function balanceRow(label: string, balance?: CanaryBalances) {
  if (!balance) return `| ${label} | — | — | — | — |`;
  return `| ${label} | ${balance.ownerUsdc} | ${balance.merchantUsdc} | ${balance.ownerSolLamports} | ${balance.facilitatorSolLamports} |`;
}

function short(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function escapeTable(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
