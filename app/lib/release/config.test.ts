import { describe, expect, it } from "vitest";
import {
  evaluateReleaseReadiness,
  publicReadiness,
  resolveBuildSha,
} from "./config";

describe("build provenance", () => {
  const base: NodeJS.ProcessEnv = { NODE_ENV: "test" };

  it("prefers the explicit override", () => {
    expect(
      resolveBuildSha({
        ...base,
        BUDGETRAIL_BUILD_SHA: "abc1234",
        RENDER_GIT_COMMIT: "def5678",
      })
    ).toBe("abc1234");
  });

  it.each([
    ["RENDER_GIT_COMMIT", "render99"],
    ["RAILWAY_GIT_COMMIT_SHA", "railway9"],
    ["VERCEL_GIT_COMMIT_SHA", "vercel99"],
  ])("falls back to the %s the platform injects", (key, value) => {
    expect(resolveBuildSha({ ...base, [key]: value })).toBe(value);
  });

  it("does not report a stale override when it is blank", () => {
    expect(
      resolveBuildSha({
        ...base,
        BUDGETRAIL_BUILD_SHA: "   ",
        RENDER_GIT_COMMIT: "render99",
      })
    ).toBe("render99");
  });

  it("reports development when nothing is set", () => {
    expect(resolveBuildSha(base)).toBe("development");
  });
});

const safeGrantEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  BUDGETRAIL_DEPLOYMENT_MODE: "grant-demo",
  BUDGETRAIL_RUNTIME: "container",
  BUDGETRAIL_PUBLIC_URL: "https://budgetrail.example",
  BUDGETRAIL_REPLICA_COUNT: "1",
  BUDGETRAIL_X402_NETWORK: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  NEXT_PUBLIC_SOLANA_CLUSTER: "devnet",
};

describe("release readiness", () => {
  it("accepts the locked single-replica grant demo profile", () => {
    const result = evaluateReleaseReadiness(safeGrantEnvironment, "x64");

    expect(result.ready).toBe(true);
    expect(result.mainnetWritesLocked).toBe(true);
  });

  it.each([
    ["wrong cluster", { NEXT_PUBLIC_SOLANA_CLUSTER: "mainnet" }],
    ["non-container runtime", { BUDGETRAIL_RUNTIME: "serverless" }],
    ["missing public URL", { BUDGETRAIL_PUBLIC_URL: undefined }],
    ["multiple replicas", { BUDGETRAIL_REPLICA_COUNT: "2" }],
    ["mainnet write request", { BUDGETRAIL_ENABLE_MAINNET_WRITES: "true" }],
    ["URL with a path", { BUDGETRAIL_PUBLIC_URL: "https://example.com/app" }],
  ])("blocks %s", (_label, override) => {
    const result = evaluateReleaseReadiness(
      {
        ...safeGrantEnvironment,
        ...override,
      },
      "x64"
    );

    expect(result.ready).toBe(false);
    expect(result.checks.some((check) => check.status === "blocked")).toBe(
      true
    );
  });

  it("blocks Linux arm64 because Surfpool 1.4 has no matching binary", () => {
    expect(evaluateReleaseReadiness(safeGrantEnvironment, "arm64").ready).toBe(
      false
    );
  });

  it("fails closed when production omits or misspells its release profile", () => {
    expect(
      evaluateReleaseReadiness({ NODE_ENV: "production" }, "x64").ready
    ).toBe(false);
    expect(
      evaluateReleaseReadiness(
        {
          ...safeGrantEnvironment,
          BUDGETRAIL_DEPLOYMENT_MODE: "grant-dmeo",
        },
        "x64"
      ).ready
    ).toBe(false);
  });

  it("does not expose the public origin or environment values", () => {
    const result = publicReadiness(
      evaluateReleaseReadiness(
        {
          ...safeGrantEnvironment,
          BUDGETRAIL_BUILD_SHA: "abc1234",
        },
        "x64"
      )
    );

    expect(result).not.toHaveProperty("publicUrl");
    expect(JSON.stringify(result)).not.toContain("budgetrail.example");
  });
});
