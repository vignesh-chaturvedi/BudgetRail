import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { ClusterSelect } from "./cluster-select";
import { WalletButton } from "./wallet-button";

export function AppHeader() {
  return (
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex min-h-10 items-center gap-2 rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary font-mono text-xs font-bold text-primary-foreground">
            BR
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-tight">
              BudgetRail
            </span>
            <span className="hidden text-[0.6875rem] uppercase tracking-widest text-muted sm:block">
              Agent spending control
            </span>
          </span>
        </Link>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle />
        <ClusterSelect />
        <WalletButton />
      </div>
    </header>
  );
}
