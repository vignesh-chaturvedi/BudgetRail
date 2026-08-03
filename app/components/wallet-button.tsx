"use client";

import { useState, useRef, useEffect } from "react";
import { useWallet } from "../lib/wallet/context";
import { useBalance } from "../lib/hooks/use-balance";
import { lamportsToSolString } from "../lib/lamports";
import { ellipsify } from "../lib/explorer";
import { useCluster } from "./cluster-context";

export function WalletButton() {
  const { connectors, connect, disconnect, wallet, status, error } =
    useWallet();

  const { getExplorerUrl } = useCluster();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const address = wallet?.account.address;
  const balance = useBalance(address);

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleCopy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (status !== "connected") {
    return (
      <div className="relative" ref={ref}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (isOpen ? close() : open())}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          className="min-h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
        >
          Connect Wallet
        </button>

        {isOpen && (
          <div
            className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-popover p-3 shadow-lg"
            role="menu"
          >
            <p className="mb-2 text-xs font-medium text-muted">
              Choose a wallet
            </p>
            <div className="space-y-1">
              {connectors.map((connector) => (
                <button
                  key={connector.id}
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    try {
                      await connect(connector.id);
                      close();
                    } catch {
                      // connection errors are surfaced through context state
                    }
                  }}
                  disabled={status === "connecting"}
                  className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
                >
                  {connector.icon && (
                    // Wallet-standard icons may be dynamic data URLs that Next Image cannot optimize.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={connector.icon}
                      alt=""
                      className="h-5 w-5 rounded"
                    />
                  )}
                  <span>{connector.name}</span>
                </button>
              ))}
              {connectors.length === 0 && (
                <p className="rounded-lg bg-secondary p-3 text-xs leading-5 text-muted">
                  No Wallet Standard-compatible Solana wallet was detected.
                </p>
              )}
            </div>
            {status === "connecting" && (
              <p className="mt-2 text-xs text-muted">Connecting...</p>
            )}
            {error != null && (
              <p className="mt-2 text-xs text-destructive">
                {error instanceof Error ? error.message : String(error)}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? close() : open())}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <span className="h-2 w-2 rounded-full bg-green-500" />
        <span className="font-mono">{ellipsify(address!, 4)}</span>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border bg-popover p-4 shadow-lg"
          role="menu"
        >
          <div className="mb-3">
            <p className="text-xs text-muted">Balance</p>
            <p className="text-lg font-bold tabular-nums">
              {balance.lamports != null
                ? lamportsToSolString(balance.lamports)
                : "\u2014"}{" "}
              <span className="text-sm font-normal text-muted">SOL</span>
            </p>
          </div>

          <div className="mb-3 rounded-lg border border-border bg-secondary/50 px-3 py-2">
            <p className="break-all font-mono text-xs">{address}</p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="min-h-10 flex-1 rounded-lg border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              {copied ? "Copied!" : "Copy address"}
            </button>
            <a
              href={getExplorerUrl(`/address/${address}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-10 flex-1 items-center justify-center rounded-lg border border-border bg-card px-3 text-center text-xs font-medium transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              Explorer
            </a>
          </div>

          <button
            type="button"
            onClick={() => {
              disconnect();
              close();
            }}
            className="mt-2 min-h-10 w-full rounded-lg border border-border bg-card px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive motion-reduce:transition-none"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
