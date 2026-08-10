import type { NextConfig } from "next";

function configuredRpcOrigins() {
  const value = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!value) return [];
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    const websocket = new URL(url.origin);
    websocket.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, websocket.origin];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@solana/surfpool", "ws"],
  async headers() {
    const scriptSource =
      process.env.NODE_ENV === "development"
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'";
    const connectSources = [
      "'self'",
      "https://api.devnet.solana.com",
      "wss://api.devnet.solana.com",
      "https://api.testnet.solana.com",
      "wss://api.testnet.solana.com",
      "https://api.mainnet-beta.solana.com",
      "wss://api.mainnet-beta.solana.com",
      "http://127.0.0.1:*",
      "ws://127.0.0.1:*",
      ...configuredRpcOrigins(),
    ];
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      `connect-src ${[...new Set(connectSources)].join(" ")}`,
      "font-src 'self' data:",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:",
      "object-src 'none'",
      scriptSource,
      "style-src 'self' 'unsafe-inline'",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=()",
          },
        ],
      },
    ];
  },
  // @solana/kit-plugin-payer's browser bundle has a spurious `import 'fs'`
  // from the payerFromFile export. Stub it out for the client bundle.
  turbopack: {
    resolveAlias: {
      fs: { browser: "./empty-module.js" },
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    }
    return config;
  },
};

export default nextConfig;
