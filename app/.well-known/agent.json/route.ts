function publicOrigin(request: Request) {
  const configured = process.env.BUDGETRAIL_PUBLIC_URL;
  if (configured) return new URL(configured).origin;
  return new URL(request.url).origin;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = publicOrigin(request);
  return Response.json(
    {
      name: "BudgetRail Agent",
      description:
        "An autonomous x402 buyer with capped, expiring, and revocable USDC authority on Solana.",
      image: `${origin}/budgetrail-agent.svg`,
      services: [
        { type: "A2A", value: `${origin}/api/agent/purchase` },
        { type: "WALLET", value: "solana" },
      ],
      skills: ["finance_and_business/financial_management/budget_management"],
      domains: ["finance_and_business/finance"],
      x402Support: true,
      active: true,
      registrations: [],
    },
    { headers: { "cache-control": "public, max-age=300" } }
  );
}
