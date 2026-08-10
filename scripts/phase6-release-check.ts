import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { evaluateReleaseReadiness } from "../app/lib/release/config";

const requiredArtifacts = [
  "Dockerfile",
  ".dockerignore",
  ".env.example",
  "README.md",
  "LICENSE",
  "docs/ARCHITECTURE.md",
  "docs/THREAT_MODEL.md",
  "docs/DEPLOYMENT.md",
  "docs/DEMO_SCRIPT.md",
  "docs/SUBMISSION_CHECKLIST.md",
  "docs/PHASE_6_EVIDENCE.md",
  "docs/PHASE_6_DEPLOYMENT_REPORT.html",
  "app/api/health/route.ts",
  "app/api/readiness/route.ts",
  "app/.well-known/agent.json/route.ts",
  "public/agent-metadata.json",
];

const missingArtifacts = requiredArtifacts.filter((path) => !existsSync(path));
const remote = execFileSync("git", ["remote", "get-url", "origin"], {
  encoding: "utf8",
}).trim();
const hasExpectedPublicRemote =
  /github\.com[:/]vignesh-chaturvedi\/BudgetRail(?:\.git)?$/.test(remote);

const environment: NodeJS.ProcessEnv = {
  ...process.env,
  BUDGETRAIL_DEPLOYMENT_MODE: "grant-demo",
  BUDGETRAIL_RUNTIME: "container",
  BUDGETRAIL_PUBLIC_URL: "https://budgetrail.example",
  BUDGETRAIL_REPLICA_COUNT: "1",
  BUDGETRAIL_X402_NETWORK: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  BUDGETRAIL_ENABLE_MAINNET_WRITES: "false",
  NEXT_PUBLIC_SOLANA_CLUSTER: "devnet",
};
const readiness = evaluateReleaseReadiness(environment, "x64");
const envExample = readFileSync(".env.example", "utf8");
const envTripwireDocumented = envExample.includes(
  "BUDGETRAIL_ENABLE_MAINNET_WRITES=false"
);

const passed =
  missingArtifacts.length === 0 &&
  hasExpectedPublicRemote &&
  readiness.ready &&
  readiness.mainnetWritesLocked &&
  envTripwireDocumented;

console.log(
  JSON.stringify(
    {
      status: passed ? "phase-6-release-candidate" : "phase-6-release-blocked",
      artifactCount: requiredArtifacts.length,
      missingArtifacts,
      expectedGitHubRemote: hasExpectedPublicRemote,
      deploymentProfileReady: readiness.ready,
      mainnetWritesLocked: readiness.mainnetWritesLocked,
      checks: readiness.checks.map(({ id, status }) => ({ id, status })),
      externalGates: [
        "deploy the container to a public HTTPS origin",
        "verify the clean-browser judge flow against that origin",
        "record and publish the 60-90 second demo",
        "add final live, Colosseum, receipt, and transaction links",
      ],
    },
    null,
    2
  )
);

if (!passed) process.exitCode = 1;
