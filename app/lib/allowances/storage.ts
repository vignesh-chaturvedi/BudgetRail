import { address } from "@solana/kit";
import type { ClusterMoniker } from "../solana-client";
import type { AllowanceRecord, SupportedAllowanceCluster } from "./model";
import { isSupportedAllowanceCluster } from "./model";

export const ALLOWANCE_STORAGE_KEY = "budgetrail:allowances:v1";

export function parseAllowanceRecords(raw: string | null): AllowanceRecord[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      const record = parseRecord(entry);
      return record ? [record] : [];
    });
  } catch {
    return [];
  }
}

export function upsertAllowanceRecord(
  records: AllowanceRecord[],
  next: AllowanceRecord
): AllowanceRecord[] {
  const withoutCurrent = records.filter(
    (record) =>
      !(record.cluster === next.cluster && record.address === next.address)
  );
  return [next, ...withoutCurrent];
}

export function markAllowanceRevoked(
  records: AllowanceRecord[],
  input: {
    cluster: SupportedAllowanceCluster;
    address: string;
    revokedAt: string;
    revokeSignature?: string;
  }
): AllowanceRecord[] {
  return records.map((record) =>
    record.cluster === input.cluster && record.address === input.address
      ? {
          ...record,
          revokedAt: input.revokedAt,
          ...(input.revokeSignature
            ? { revokeSignature: input.revokeSignature }
            : {}),
        }
      : record
  );
}

export function allowanceRecordsForWallet(
  records: AllowanceRecord[],
  cluster: ClusterMoniker,
  owner: string
): AllowanceRecord[] {
  if (!isSupportedAllowanceCluster(cluster)) return [];
  return records.filter(
    (record) => record.cluster === cluster && record.owner === owner
  );
}

function parseRecord(value: unknown): AllowanceRecord | null {
  if (!isObject(value) || value.version !== 1) return null;
  if (
    typeof value.cluster !== "string" ||
    !isSupportedAllowanceCluster(value.cluster as ClusterMoniker)
  ) {
    return null;
  }

  const requiredStrings = [
    "address",
    "owner",
    "delegatee",
    "mint",
    "nonce",
    "capBaseUnits",
    "expiryTs",
    "createdAt",
    "createSignature",
  ] as const;
  if (requiredStrings.some((key) => typeof value[key] !== "string")) {
    return null;
  }

  try {
    const record: AllowanceRecord = {
      version: 1,
      cluster: value.cluster as SupportedAllowanceCluster,
      address: address(value.address as string),
      owner: address(value.owner as string),
      delegatee: address(value.delegatee as string),
      mint: address(value.mint as string),
      nonce: parseUnsignedInteger(value.nonce as string),
      capBaseUnits: parseUnsignedInteger(value.capBaseUnits as string),
      expiryTs: parseUnsignedInteger(value.expiryTs as string),
      createdAt: value.createdAt as string,
      createSignature: value.createSignature as string,
    };

    if (typeof value.revokedAt === "string") record.revokedAt = value.revokedAt;
    if (typeof value.revokeSignature === "string") {
      record.revokeSignature = value.revokeSignature;
    }
    return record;
  } catch {
    return null;
  }
}

function parseUnsignedInteger(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error("Invalid integer");
  BigInt(value);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
