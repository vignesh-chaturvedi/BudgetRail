import { probeLedgerLiveness } from "../../lib/ledger/liveness";
import {
  evaluateReleaseReadiness,
  publicReadiness,
} from "../../lib/release/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = evaluateReleaseReadiness();
  // Configuration alone cannot tell a running rail from a frozen one, and a
  // frozen rail is exactly what a reviewer would find. Fail closed on it so the
  // container healthcheck can recycle the process instead of serving a demo
  // that no longer answers.
  const ledger = await probeLedgerLiveness();
  const ready = readiness.ready && ledger.status !== "stalled";

  return Response.json(
    {
      ...publicReadiness(readiness),
      status: ready ? "ready" : "blocked",
      ledger,
    },
    {
      status: ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    }
  );
}
