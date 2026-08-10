import { describe, expect, it } from "vitest";
import {
  ALLOWANCE_BASE_UNITS,
  MAINNET_ACKNOWLEDGEMENT,
  MAINNET_CAIP2,
  defaultRunId,
  deriveCanaryNonce,
  isPathInside,
  newCanaryEvidence,
  parseCanaryConfig,
  renderCanaryMarkdown,
  type CanaryEnvironment,
} from "../src";

const repoRoot = "/workspace/BudgetRail";
const privateRpc = "https://mainnet.example-rpc.invalid/rpc-id";

function environment(overrides: CanaryEnvironment = {}): CanaryEnvironment {
  return {
    BUDGETRAIL_CANARY_RUN_ID: "BR-MN-20260810-001",
    BUDGETRAIL_MAINNET_RPC_URL: privateRpc,
    BUDGETRAIL_MAINNET_RPC_PROVIDER: "Example private provider",
    BUDGETRAIL_CANARY_KEY_DIR: "/secure/budgetrail/BR-MN-20260810-001",
    BUDGETRAIL_CANARY_EVIDENCE_DIR: "/evidence/budgetrail/BR-MN-20260810-001",
    ...overrides,
  };
}

describe("Phase 7 mainnet canary policy", () => {
  it("pins the exact, tiny mainnet scope", () => {
    const config = parseCanaryConfig({
      action: "preflight",
      env: environment(),
      repoRoot,
      execute: false,
    });
    const evidence = newCanaryEvidence(config, "a953cc5");

    expect(evidence.network).toBe(MAINNET_CAIP2);
    expect(evidence.genesisHash).toBe(
      "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
    );
    expect(evidence.parameters.allowanceBaseUnits).toBe(
      ALLOWANCE_BASE_UNITS.toString()
    );
    expect(evidence.parameters.paymentBaseUnits).toBe("100000");
    expect(evidence.parameters.overBudgetBaseUnits).toBe("300000");
    expect(evidence.parameters.expirySeconds).toBe(900);
  });

  it("derives a stable, run-specific u64 nonce", () => {
    const first = deriveCanaryNonce("BR-MN-20260810-001");
    const same = deriveCanaryNonce("BR-MN-20260810-001");
    const other = deriveCanaryNonce("BR-MN-20260810-002");

    expect(first).toBe(same);
    expect(first).not.toBe(other);
    expect(first).toBeGreaterThanOrEqual(0n);
    expect(first).toBeLessThanOrEqual(2n ** 64n - 1n);
  });

  it("rejects key and evidence paths inside the repository", () => {
    expect(() =>
      parseCanaryConfig({
        action: "preflight",
        env: environment({
          BUDGETRAIL_CANARY_KEY_DIR: "/workspace/BudgetRail/.keys",
        }),
        repoRoot,
        execute: false,
      })
    ).toThrow("key directory must be outside");

    expect(() =>
      parseCanaryConfig({
        action: "preflight",
        env: environment({
          BUDGETRAIL_CANARY_EVIDENCE_DIR: "/workspace/BudgetRail/evidence",
        }),
        repoRoot,
        execute: false,
      })
    ).toThrow("evidence directory must be outside");
  });

  it("treats whitespace-only key overrides as absent", () => {
    const config = parseCanaryConfig({
      action: "keys",
      env: environment({
        BUDGETRAIL_CANARY_OWNER_KEYPAIR: "   ",
      }),
      repoRoot,
      execute: false,
    });

    expect(config.keyPaths.owner).toBe(
      "/secure/budgetrail/BR-MN-20260810-001/owner.json"
    );
  });

  it("permits the public Solana RPC only for explicit read-only inspection", () => {
    const publicEnv = environment({
      BUDGETRAIL_MAINNET_RPC_URL: "https://api.mainnet-beta.solana.com",
      BUDGETRAIL_CANARY_ALLOW_PUBLIC_READONLY: "true",
    });
    expect(
      parseCanaryConfig({
        action: "inspect",
        env: publicEnv,
        repoRoot,
        execute: false,
      }).allowPublicReadonly
    ).toBe(true);
    expect(() =>
      parseCanaryConfig({
        action: "preflight",
        env: publicEnv,
        repoRoot,
        execute: false,
      })
    ).toThrow("public RPC");
  });

  it("requires both the execute flag and exact acknowledgement for writes", () => {
    expect(() =>
      parseCanaryConfig({
        action: "run",
        env: environment(),
        repoRoot,
        execute: false,
      })
    ).toThrow("--execute");

    expect(() =>
      parseCanaryConfig({
        action: "run",
        env: environment({ BUDGETRAIL_CANARY_ACK: "wrong" }),
        repoRoot,
        execute: true,
      })
    ).toThrow("BUDGETRAIL_CANARY_ACK");

    expect(
      parseCanaryConfig({
        action: "run",
        env: environment({
          BUDGETRAIL_CANARY_ACK: MAINNET_ACKNOWLEDGEMENT,
        }),
        repoRoot,
        execute: true,
      }).execute
    ).toBe(true);
  });

  it("renders a sanitized, independently verifiable Markdown report", () => {
    const config = parseCanaryConfig({
      action: "report",
      env: environment(),
      repoRoot,
      execute: false,
    });
    const evidence = newCanaryEvidence(config, "a953cc5");
    evidence.addresses.owner = "11111111111111111111111111111111";
    const report = renderCanaryMarkdown(evidence);

    expect(report).toContain("BudgetRail Phase 7 mainnet canary");
    expect(report).toContain(MAINNET_CAIP2);
    expect(report).toContain("Secret-handling statement");
    expect(report).not.toContain(privateRpc);
  });

  it("recognizes path containment and UTC run IDs", () => {
    expect(isPathInside(repoRoot, "/workspace/BudgetRail/scripts/a.ts")).toBe(
      true
    );
    expect(isPathInside(repoRoot, "/workspace/evidence/run.json")).toBe(false);
    expect(defaultRunId(new Date("2026-08-10T12:00:00Z"))).toBe(
      "BR-MN-20260810-001"
    );
  });
});
