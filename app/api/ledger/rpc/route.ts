import { peekPhase3DemoRuntime } from "../../../lib/phase3/demo-runtime";
import {
  BLOCKED_RPC_METHODS,
  EXCLUDED_SCAN_METHODS,
  LEDGER_RPC_PATH,
  LEDGER_RPC_UPSTREAM_TIMEOUT_MS,
  MAX_LEDGER_RPC_BATCH,
  MAX_LEDGER_RPC_BODY_BYTES,
  READ_ONLY_RPC_METHODS,
  acquireLedgerSlot,
  jsonRpcErrorBody,
  ledgerCorsHeaders,
  planLedgerRpcRequest,
  resolveLedgerCorsOrigin,
} from "../../../lib/ledger/rpc-proxy";
import { enforceRateLimit } from "../../../lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withCors(response: Response, corsHeaders: Record<string, string>) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Read-only JSON-RPC view of the judge rail's isolated Surfpool ledger.
 *
 * Deliberately cross-origin so Solana Explorer can resolve the signatures the
 * operator console links to. Demo control routes stay same-origin; this one
 * compensates by refusing every method that could write to or mutate the
 * ledger, including Surfpool's `surfnet_*` cheat codes.
 */
export async function OPTIONS(request: Request) {
  const allowedOrigin = resolveLedgerCorsOrigin(request.headers.get("origin"));
  return new Response(null, {
    status: allowedOrigin ? 204 : 403,
    headers: ledgerCorsHeaders(allowedOrigin),
  });
}

/**
 * Human-readable description of the endpoint, so a reviewer who opens the URL
 * directly sees the policy instead of a JSON-RPC error.
 */
export async function GET(request: Request) {
  const allowedOrigin = resolveLedgerCorsOrigin(request.headers.get("origin"));
  const runtimePromise = peekPhase3DemoRuntime();

  return Response.json(
    {
      service: "budgetrail-judge-ledger",
      path: LEDGER_RPC_PATH,
      description:
        "Read-only JSON-RPC proxy for the isolated Surfpool devnet fork backing the BudgetRail judge console. Paste this URL into Solana Explorer as a custom cluster RPC endpoint.",
      access: "read-only",
      railRunning: runtimePromise !== undefined,
      transport: "POST JSON-RPC 2.0",
      maxBatchSize: MAX_LEDGER_RPC_BATCH,
      maxBodyBytes: MAX_LEDGER_RPC_BODY_BYTES,
      allowedMethods: [...READ_ONLY_RPC_METHODS].sort(),
      blockedMethods: [...BLOCKED_RPC_METHODS].sort(),
      excludedScanMethods: [...EXCLUDED_SCAN_METHODS].sort(),
      note: "Writes, airdrops, simulation, and Surfpool cheat codes are refused so the ledger cannot be altered by a visitor. Full-ledger scans are withheld because they can stall a single isolated rail.",
    },
    { headers: ledgerCorsHeaders(allowedOrigin) }
  );
}

export async function POST(request: Request) {
  const allowedOrigin = resolveLedgerCorsOrigin(request.headers.get("origin"));
  const corsHeaders = ledgerCorsHeaders(allowedOrigin);

  // A browser sends `origin` on every cross-site fetch; an unrecognised one
  // gets no CORS grant, so answering it would only serve non-browser callers.
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && !allowedOrigin) {
    return Response.json(
      jsonRpcErrorBody(
        -32600,
        "This ledger endpoint only answers the BudgetRail demo origin and Solana Explorer."
      ),
      { status: 403, headers: corsHeaders }
    );
  }

  const rateLimited = enforceRateLimit(request, {
    action: "ledger-rpc",
    limit: 240,
    windowMs: 60_000,
  });
  // Without the CORS grant Explorer would surface a bare network failure
  // instead of the quota message.
  if (rateLimited) return withCors(rateLimited, corsHeaders);

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_LEDGER_RPC_BODY_BYTES) {
    return Response.json(
      jsonRpcErrorBody(-32600, "The JSON-RPC request body is too large."),
      { status: 413, headers: corsHeaders }
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_LEDGER_RPC_BODY_BYTES) {
    return Response.json(
      jsonRpcErrorBody(-32600, "The JSON-RPC request body is too large."),
      { status: 413, headers: corsHeaders }
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json(
      jsonRpcErrorBody(-32700, "The request body is not valid JSON."),
      { status: 400, headers: corsHeaders }
    );
  }

  const plan = planLedgerRpcRequest(payload);

  if (plan.outcome === "protocol-error") {
    return Response.json(jsonRpcErrorBody(plan.code, plan.message), {
      status: plan.status,
      headers: corsHeaders,
    });
  }

  // Answered entirely from policy, so the ledger is never consulted.
  if (plan.outcome === "reject-all") {
    return Response.json(plan.body, { status: 200, headers: corsHeaders });
  }

  const runtimePromise = peekPhase3DemoRuntime();
  if (!runtimePromise) {
    return Response.json(
      jsonRpcErrorBody(
        -32603,
        "No judge rail is running yet. Open the BudgetRail console to seed one, then retry."
      ),
      { status: 503, headers: corsHeaders }
    );
  }

  const release = acquireLedgerSlot();
  if (!release) {
    return Response.json(
      jsonRpcErrorBody(-32603, "The judge ledger is busy. Retry in a moment."),
      { status: 503, headers: { ...corsHeaders, "retry-after": "2" } }
    );
  }

  try {
    const demo = await runtimePromise;
    // One deadline for the whole request, so a batch cannot extend the bound by
    // spending the full timeout on each of its calls.
    const deadline = AbortSignal.timeout(LEDGER_RPC_UPSTREAM_TIMEOUT_MS);
    const answers: unknown[] = [];

    for (const call of plan.allowedCalls) {
      const upstream = await fetch(demo.ledgerRpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(call),
        signal: deadline,
      });
      answers.push(await upstream.json());
    }

    // Clients match a batch by id, so the join order is free; a single call is
    // answered as a single object, exactly as it was sent.
    const body =
      plan.isBatch || plan.rejectedResponses.length > 0
        ? [...answers, ...plan.rejectedResponses]
        : answers[0];

    return Response.json(body, { headers: corsHeaders });
  } catch {
    // The upstream address and any node internals stay out of the response.
    return Response.json(
      jsonRpcErrorBody(-32603, "The judge ledger did not answer in time."),
      { status: 502, headers: corsHeaders }
    );
  } finally {
    release();
  }
}
