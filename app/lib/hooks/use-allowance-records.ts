"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { AllowanceRecord } from "../allowances/model";
import type { SupportedAllowanceCluster } from "../allowances/model";
import {
  ALLOWANCE_STORAGE_KEY,
  markAllowanceRevoked,
  parseAllowanceRecords,
  upsertAllowanceRecord,
} from "../allowances/storage";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot() {
  return localStorage.getItem(ALLOWANCE_STORAGE_KEY) ?? "[]";
}

function getServerSnapshot() {
  return "[]";
}

function writeRecords(records: AllowanceRecord[]) {
  localStorage.setItem(ALLOWANCE_STORAGE_KEY, JSON.stringify(records));
  listeners.forEach((listener) => listener());
}

export function useAllowanceRecords() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const records = useMemo(() => parseAllowanceRecords(raw), [raw]);

  const saveRecord = useCallback((record: AllowanceRecord) => {
    writeRecords(
      upsertAllowanceRecord(parseAllowanceRecords(getSnapshot()), record)
    );
  }, []);

  const saveRevocation = useCallback(
    (input: {
      cluster: SupportedAllowanceCluster;
      address: string;
      revokedAt: string;
      revokeSignature?: string;
    }) => {
      writeRecords(
        markAllowanceRevoked(parseAllowanceRecords(getSnapshot()), input)
      );
    },
    []
  );

  return { records, saveRecord, saveRevocation };
}
