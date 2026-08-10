const REDACTION_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\b(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]"],
  [
    /\b(api[-_]?key|private[-_]?key|secret[-_]?key|access[-_]?token|auth[-_]?token|password)\b\s*[:=]\s*["']?[^\s,"';}]+["']?/gi,
    "$1=[REDACTED]",
  ],
  [/([?&](?:api[-_]?key|token|key)=)[^&#\s]+/gi, "$1[REDACTED]"],
  [/\[(?:\s*\d{1,3}\s*,){63}\s*\d{1,3}\s*\]/g, "[REDACTED_SOLANA_KEYPAIR]"],
  [
    /\b(?:sk_live_|sk_test_|ghp_|gho_|github_pat_|xoxb-|xoxp-)[A-Za-z0-9_\-]+\b/g,
    "[REDACTED_TOKEN]",
  ],
  [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    "[REDACTED_PRIVATE_KEY]",
  ],
];

const MAX_PUBLIC_ERROR_LENGTH = 240;

export function redactSensitiveText(value: string) {
  return REDACTION_PATTERNS.reduce(
    (redacted, [pattern, replacement]) =>
      redacted.replace(pattern, replacement),
    value
  );
}

export function safeErrorMessage(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : fallback;
  const redacted = redactSensitiveText(raw).trim();
  if (!redacted) return fallback;
  if (redacted.length <= MAX_PUBLIC_ERROR_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_PUBLIC_ERROR_LENGTH - 1)}…`;
}
