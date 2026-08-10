import { createHash } from "node:crypto";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitEntry>;

declare global {
  var __budgetRailRateLimits: RateLimitStore | undefined;
}

const store =
  globalThis.__budgetRailRateLimits ??
  (globalThis.__budgetRailRateLimits = new Map<string, RateLimitEntry>());
const PRUNE_THRESHOLD = 1_000;
const MAX_KEYS = 10_000;

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  const address =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    forwarded?.trim() ??
    "local";
  const userAgent = request.headers.get("user-agent") ?? "unknown";

  return createHash("sha256")
    .update(`${address}:${userAgent}`)
    .digest("hex")
    .slice(0, 24);
}

function prune(now: number) {
  if (store.size < PRUNE_THRESHOLD) return;
  for (const [key, value] of store) {
    if (value.resetAt <= now) store.delete(key);
  }

  while (store.size >= MAX_KEYS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function enforceRateLimit(
  request: Request,
  {
    action,
    limit,
    windowMs,
    now = Date.now(),
  }: {
    action: string;
    limit: number;
    windowMs: number;
    now?: number;
  }
) {
  prune(now);
  const key = `${action}:${clientKey(request)}`;
  const existing = store.get(key);
  const entry =
    !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : existing;

  entry.count += 1;
  store.set(key, entry);

  if (entry.count <= limit) return null;

  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1_000));
  return Response.json(
    {
      error: "RATE_LIMITED",
      message:
        "This public demo action is temporarily rate limited. Retry shortly.",
    },
    {
      status: 429,
      headers: {
        "cache-control": "no-store",
        "retry-after": String(retryAfter),
      },
    }
  );
}

export function resetRateLimitsForTest() {
  if (process.env.NODE_ENV === "test") store.clear();
}
