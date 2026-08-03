"use client";

import { useState, useRef, useEffect } from "react";
import { useCluster, CLUSTERS } from "./cluster-context";

export function ClusterSelect() {
  const { cluster, setCluster } = useCluster();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <span className={`size-2 rounded-full ${clusterDotClass(cluster)}`} />
        {cluster}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-40 rounded-xl border border-border bg-popover p-2 shadow-lg"
          role="menu"
        >
          <div className="space-y-1">
            {CLUSTERS.map((c) => (
              <button
                key={c}
                type="button"
                role="menuitem"
                onClick={() => {
                  setCluster(c);
                  setIsOpen(false);
                }}
                className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-medium transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                  c === cluster ? "bg-secondary" : ""
                }`}
              >
                <span className={`size-2 rounded-full ${clusterDotClass(c)}`} />
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function clusterDotClass(cluster: (typeof CLUSTERS)[number]) {
  if (cluster === "devnet") return "bg-warning";
  if (cluster === "localnet") return "bg-info";
  if (cluster === "mainnet") return "bg-foreground";
  return "bg-muted";
}
