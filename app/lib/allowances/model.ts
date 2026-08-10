import { address, type Address } from "@solana/kit";
import type { Delegation } from "@solana/subscriptions";
import type { ClusterMoniker } from "../solana-client";

export const USDC_DECIMALS = 6;
export const USDC_BASE_UNITS = 10n ** BigInt(USDC_DECIMALS);
export const MAX_U64 = 18_446_744_073_709_551_615n;

export const DEVNET_USDC_MINT = address(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);
export const MAINNET_USDC_MINT = address(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

export const SUPPORTED_ALLOWANCE_CLUSTERS = ["devnet", "localnet"] as const;

export type SupportedAllowanceCluster =
  (typeof SUPPORTED_ALLOWANCE_CLUSTERS)[number];

export type FixedDelegation = Extract<Delegation, { kind: "fixed" }>;

export type AllowanceStatus =
  "active" | "depleted" | "expired" | "revoked" | "syncing";

export type AllowanceRecord = {
  version: 1;
  cluster: SupportedAllowanceCluster;
  address: Address;
  owner: Address;
  delegatee: Address;
  mint: Address;
  nonce: string;
  capBaseUnits: string;
  expiryTs: string;
  createdAt: string;
  createSignature: string;
  revokedAt?: string;
  revokeSignature?: string;
};

export type AllowanceView = {
  address: Address;
  owner: Address;
  delegatee: Address;
  mint: Address;
  capBaseUnits: bigint;
  spentBaseUnits: bigint;
  remainingBaseUnits: bigint;
  expiryTs: bigint;
  status: AllowanceStatus;
  capSource: "creation-record" | "current-chain-balance";
  createSignature?: string;
  revokeSignature?: string;
};

export type AllowanceDraft = {
  delegatee: Address;
  capBaseUnits: bigint;
  expiryTs: bigint;
};

export type AllowanceDraftErrors = Partial<
  Record<"delegatee" | "amount" | "expiry", string>
>;

export function isSupportedAllowanceCluster(
  cluster: ClusterMoniker
): cluster is SupportedAllowanceCluster {
  return SUPPORTED_ALLOWANCE_CLUSTERS.includes(
    cluster as SupportedAllowanceCluster
  );
}

export function getUsdcMint(cluster: ClusterMoniker): Address {
  const configuredMint = process.env.NEXT_PUBLIC_BUDGETRAIL_TOKEN_MINT;
  if (configuredMint) return address(configuredMint);

  if (cluster === "devnet" || cluster === "localnet") {
    return DEVNET_USDC_MINT;
  }

  if (cluster === "mainnet") return MAINNET_USDC_MINT;

  return DEVNET_USDC_MINT;
}

export function parseUsdcAmount(input: string): bigint {
  const normalized = input.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/.exec(normalized);

  if (!match) {
    throw new Error("Enter a positive USDC amount with up to 6 decimals.");
  }

  const whole = BigInt(match[1]);
  const fractional = BigInt((match[2] ?? "").padEnd(USDC_DECIMALS, "0"));
  const amount = whole * USDC_BASE_UNITS + fractional;

  if (amount <= 0n) throw new Error("Allowance must be greater than 0 USDC.");
  if (amount > MAX_U64) throw new Error("Allowance is too large for Solana.");

  return amount;
}

export function formatUsdcAmount(amount: bigint): string {
  const whole = amount / USDC_BASE_UNITS;
  const remainder = amount % USDC_BASE_UNITS;
  if (remainder === 0n) return whole.toString();

  return `${whole}.${remainder
    .toString()
    .padStart(USDC_DECIMALS, "0")
    .replace(/0+$/, "")}`;
}

export function parseExpiryInput(input: string, nowTs: bigint): bigint {
  const timestampMs = Date.parse(input);
  if (!Number.isFinite(timestampMs)) {
    throw new Error("Choose a valid expiry date and time.");
  }

  const expiryTs = BigInt(Math.floor(timestampMs / 1000));
  if (expiryTs <= nowTs + 300n) {
    throw new Error("Expiry must be at least 5 minutes from now.");
  }

  return expiryTs;
}

export function validateAllowanceDraft(
  values: { delegatee: string; amount: string; expiry: string },
  nowTs: bigint
): { draft?: AllowanceDraft; errors: AllowanceDraftErrors } {
  const errors: AllowanceDraftErrors = {};
  let delegatee: Address | undefined;
  let capBaseUnits: bigint | undefined;
  let expiryTs: bigint | undefined;

  try {
    delegatee = address(values.delegatee.trim());
  } catch {
    errors.delegatee = "Enter a valid Solana agent wallet address.";
  }

  try {
    capBaseUnits = parseUsdcAmount(values.amount);
  } catch (error) {
    errors.amount = error instanceof Error ? error.message : "Invalid amount.";
  }

  try {
    expiryTs = parseExpiryInput(values.expiry, nowTs);
  } catch (error) {
    errors.expiry = error instanceof Error ? error.message : "Invalid expiry.";
  }

  if (!delegatee || capBaseUnits === undefined || expiryTs === undefined) {
    return { errors };
  }

  return { draft: { delegatee, capBaseUnits, expiryTs }, errors };
}

export function getAllowanceStatus({
  remainingBaseUnits,
  expiryTs,
  nowTs,
  revoked,
}: {
  remainingBaseUnits: bigint;
  expiryTs: bigint;
  nowTs: bigint;
  revoked?: boolean;
}): AllowanceStatus {
  if (revoked) return "revoked";
  if (expiryTs <= nowTs) return "expired";
  if (remainingBaseUnits === 0n) return "depleted";
  return "active";
}

export function toAllowanceView({
  delegation,
  record,
  nowTs,
}: {
  delegation?: FixedDelegation;
  record?: AllowanceRecord;
  nowTs: bigint;
}): AllowanceView {
  if (!delegation && !record) {
    throw new Error("An on-chain delegation or creation record is required.");
  }

  const recordedCap = record ? BigInt(record.capBaseUnits) : undefined;
  const remainingBaseUnits =
    delegation?.data.amount ?? (record?.revokedAt ? 0n : (recordedCap ?? 0n));
  const capBaseUnits =
    recordedCap !== undefined && recordedCap >= remainingBaseUnits
      ? recordedCap
      : remainingBaseUnits;
  const spentBaseUnits = capBaseUnits - remainingBaseUnits;
  const expiryTs = delegation?.data.expiryTs ?? BigInt(record!.expiryTs);
  const owner = delegation?.data.header.delegator ?? record!.owner;
  const delegatee = delegation?.data.header.delegatee ?? record!.delegatee;
  const mint = delegation?.data.mint ?? record!.mint;
  const allowanceAddress = delegation?.address ?? record!.address;

  return {
    address: allowanceAddress,
    owner,
    delegatee,
    mint,
    capBaseUnits,
    spentBaseUnits,
    remainingBaseUnits,
    expiryTs,
    status:
      !delegation && record && !record.revokedAt
        ? "syncing"
        : getAllowanceStatus({
            remainingBaseUnits,
            expiryTs,
            nowTs,
            revoked: !delegation && Boolean(record?.revokedAt),
          }),
    capSource: record ? "creation-record" : "current-chain-balance",
    createSignature: record?.createSignature,
    revokeSignature: record?.revokeSignature,
  };
}

export function createDelegationNonce(
  nowMs = Date.now(),
  randomValue = Math.random()
): bigint {
  const suffix = Math.min(999, Math.max(0, Math.floor(randomValue * 1000)));
  return BigInt(nowMs) * 1000n + BigInt(suffix);
}
