import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./components/providers";
import { AppHeader } from "./components/app-header";
import { GridBackground } from "./components/grid-background";

export const metadata: Metadata = {
  title: "BudgetRail",
  description:
    "Capped, expiring, and revocable authority for autonomous Solana payments",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          <div className="relative min-h-screen bg-background text-foreground">
            <GridBackground />
            <div className="relative z-10">
              <AppHeader />
              {children}
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
