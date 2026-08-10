export const DEPLOYMENT_MODES = ["local", "grant-demo", "mainnet"] as const;

export type DeploymentMode = (typeof DEPLOYMENT_MODES)[number];

export type ReleaseCheck = {
  id: string;
  label: string;
  status: "pass" | "warning" | "blocked";
  detail: string;
};

export type ReleaseReadiness = {
  ready: boolean;
  mode: DeploymentMode;
  cluster: string;
  mainnetWritesLocked: boolean;
  publicUrl?: string;
  buildSha: string;
  checks: ReleaseCheck[];
};

const DEVNET_X402_NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

function deploymentMode(value: string | undefined): DeploymentMode {
  return DEPLOYMENT_MODES.includes(value as DeploymentMode)
    ? (value as DeploymentMode)
    : "local";
}

function isHttpsOrigin(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function evaluateReleaseReadiness(
  env: NodeJS.ProcessEnv = process.env,
  runtimeArchitecture = process.arch
): ReleaseReadiness {
  const mode = deploymentMode(env.BUDGETRAIL_DEPLOYMENT_MODE);
  const cluster = env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  const publicUrl = env.BUDGETRAIL_PUBLIC_URL;
  const mainnetWritesRequested =
    env.BUDGETRAIL_ENABLE_MAINNET_WRITES?.toLowerCase() === "true";
  const checks: ReleaseCheck[] = [];

  checks.push({
    id: "deployment-mode",
    label: "Explicit deployment mode",
    status:
      (env.BUDGETRAIL_DEPLOYMENT_MODE &&
        !DEPLOYMENT_MODES.includes(
          env.BUDGETRAIL_DEPLOYMENT_MODE as DeploymentMode
        )) ||
      (env.NODE_ENV === "production" && mode === "local")
        ? "blocked"
        : "pass",
    detail:
      env.NODE_ENV === "production" && mode === "local"
        ? "Production must explicitly select the grant-demo profile."
        : `Deployment profile: ${mode}.`,
  });

  checks.push({
    id: "runtime-architecture",
    label: "Surfpool runtime architecture",
    status:
      mode === "grant-demo" && runtimeArchitecture !== "x64"
        ? "blocked"
        : "pass",
    detail:
      mode === "grant-demo"
        ? "Surfpool 1.4 publishes Linux x64 binaries; the hosted image must run as linux/amd64."
        : `Runtime architecture: ${runtimeArchitecture}.`,
  });

  checks.push({
    id: "node-runtime",
    label: "Long-running Node runtime",
    status:
      mode === "grant-demo" && env.BUDGETRAIL_RUNTIME !== "container"
        ? "blocked"
        : "pass",
    detail:
      mode === "grant-demo"
        ? "The hosted demo must run as a single long-lived container because Surfpool and the replay store are process-local."
        : "Local release checks use the same Node runtime as the deployment image.",
  });

  checks.push({
    id: "cluster",
    label: "Grant demo cluster",
    status: mode === "grant-demo" && cluster !== "devnet" ? "blocked" : "pass",
    detail:
      mode === "grant-demo"
        ? `Expected devnet and received ${cluster}.`
        : `Configured cluster: ${cluster}.`,
  });

  checks.push({
    id: "x402-network",
    label: "x402 network binding",
    status:
      mode === "grant-demo" &&
      env.BUDGETRAIL_X402_NETWORK !== DEVNET_X402_NETWORK
        ? "blocked"
        : "pass",
    detail:
      mode === "grant-demo"
        ? "The grant demo is pinned to the Solana devnet CAIP-2 identifier."
        : "The network binding is validated before release.",
  });

  checks.push({
    id: "public-url",
    label: "Public HTTPS origin",
    status:
      mode === "grant-demo" && !isHttpsOrigin(publicUrl) ? "blocked" : "pass",
    detail:
      mode === "grant-demo"
        ? "BUDGETRAIL_PUBLIC_URL must be the final HTTPS origin."
        : "A public URL is required only for the hosted grant-demo profile.",
  });

  checks.push({
    id: "mainnet-write-lock",
    label: "Mainnet write lock",
    status: mode === "mainnet" || mainnetWritesRequested ? "blocked" : "pass",
    detail:
      mode === "mainnet" || mainnetWritesRequested
        ? "This release intentionally has no mainnet write path. Complete a separate funded-wallet review before enabling one."
        : "Mainnet create, pay, revoke, and demo writes remain disabled.",
  });

  if (mode === "grant-demo") {
    checks.push({
      id: "single-replica",
      label: "Single replica",
      status: env.BUDGETRAIL_REPLICA_COUNT === "1" ? "pass" : "blocked",
      detail:
        "The grant demo must use exactly one replica so the in-memory replay store and disposable rail remain coherent.",
    });
  }

  return {
    ready: checks.every((check) => check.status !== "blocked"),
    mode,
    cluster,
    mainnetWritesLocked: true,
    publicUrl,
    buildSha: env.BUDGETRAIL_BUILD_SHA ?? "development",
    checks,
  };
}

export function publicReadiness(readiness: ReleaseReadiness) {
  return {
    status: readiness.ready ? "ready" : "blocked",
    mode: readiness.mode,
    cluster: readiness.cluster,
    mainnetWritesLocked: readiness.mainnetWritesLocked,
    buildSha: readiness.buildSha,
    checks: readiness.checks,
  };
}
