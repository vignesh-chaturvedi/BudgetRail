import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

type SecretRule = {
  id: string;
  pattern: RegExp;
};

type Finding = {
  scope: "current" | "history" | "client-bundle";
  path: string;
  line: number;
  rule: string;
  commit?: string;
};

const rules: SecretRule[] = [
  {
    id: "private-key-pem",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    id: "live-token-prefix",
    pattern:
      /\b(?:sk_live_|ghp_|gho_|github_pat_|xoxb-|xoxp-)[A-Za-z0-9_\-]{12,}\b/g,
  },
  {
    id: "credential-assignment",
    pattern:
      /\b(?:PRIVATE_KEY|SECRET_KEY|API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD)\b\s*[:=]\s*["']?([^\s,"';}]{8,})/gi,
  },
  {
    id: "solana-keypair-array",
    pattern: /\[(?:\s*\d{1,3}\s*,){63}\s*\d{1,3}\s*\]/g,
  },
];

const safeValueMarkers = [
  "[REDACTED]",
  "must-not-leak",
  "placeholder",
  "your_",
  "example",
  "dummy",
];
const skippedExtensions = new Set([
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".lock",
  ".pdf",
  ".png",
  ".svg",
  ".webp",
]);

function git(args: string[]) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function shouldScan(path: string) {
  if (
    path.includes("/node_modules/") ||
    path.startsWith("node_modules/") ||
    path.startsWith(".next/server/") ||
    path.startsWith(".agents/") ||
    path.startsWith(".superstack/security-reports/") ||
    /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/.test(path) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)
  ) {
    return false;
  }
  return !skippedExtensions.has(extname(path).toLowerCase());
}

function scanText(
  text: string,
  path: string,
  scope: Finding["scope"],
  commit?: string,
  activeRules: SecretRule[] = rules
) {
  const findings: Finding[] = [];
  for (const rule of activeRules) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      const lineStart = text.lastIndexOf("\n", match.index) + 1;
      const lineEnd = text.indexOf("\n", match.index);
      const lineText = text.slice(
        lineStart,
        lineEnd === -1 ? text.length : lineEnd
      );
      const normalized = lineText.toLowerCase();
      if (safeValueMarkers.some((marker) => normalized.includes(marker))) {
        continue;
      }
      findings.push({
        scope,
        path,
        line: text.slice(0, match.index).split("\n").length,
        rule: rule.id,
        commit,
      });
    }
  }
  return findings;
}

function trackedFiles() {
  return git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    .split("\0")
    .filter(Boolean)
    .filter(shouldScan);
}

function scanCurrent(files: string[]) {
  return files.flatMap((path) =>
    scanText(readFileSync(path, "utf8"), path, "current")
  );
}

function scanHistory(files: string[]) {
  const commits = git(["rev-list", "--all"]).trim().split("\n").filter(Boolean);
  const findings: Finding[] = [];
  for (const commit of commits) {
    for (const path of files) {
      let text: string;
      try {
        text = git(["show", `${commit}:${path}`]);
      } catch {
        continue;
      }
      findings.push(...scanText(text, path, "history", commit.slice(0, 12)));
    }
  }
  return { commits: commits.length, findings };
}

function walk(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function scanClientBundle() {
  const bundleRules = rules.filter(
    (rule) => rule.id !== "credential-assignment"
  );
  return walk(".next/static")
    .filter((path) => shouldScan(path))
    .flatMap((path) =>
      scanText(
        readFileSync(path, "utf8"),
        relative(process.cwd(), path),
        "client-bundle",
        undefined,
        bundleRules
      )
    );
}

const files = trackedFiles();
const current = scanCurrent(files);
const history = scanHistory(files);
const clientBundle = scanClientBundle();
const findings = [...current, ...history.findings, ...clientBundle];

if (findings.length > 0) {
  console.error(
    JSON.stringify(
      {
        status: "secret-scan-failed",
        findings,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        status: "secret-scan-clean",
        trackedFilesScanned: files.length,
        historyCommitsScanned: history.commits,
        clientArtifactsScanned: walk(".next/static").length,
        highConfidenceRules: rules.map((rule) => rule.id),
      },
      null,
      2
    )
  );
}
