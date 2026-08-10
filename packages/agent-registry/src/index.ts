import type { Keypair, PublicKey } from "@solana/web3.js";

export const BUDGETRAIL_AGENT_URI =
  "https://raw.githubusercontent.com/vignesh-chaturvedi/BudgetRail/main/public/agent-metadata.json";

export function getBudgetRailAgentUri(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.BUDGETRAIL_PUBLIC_URL;
  if (!configured) return BUDGETRAIL_AGENT_URI;
  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return BUDGETRAIL_AGENT_URI;
    }
    return `${url.origin}/.well-known/agent.json`;
  } catch {
    return BUDGETRAIL_AGENT_URI;
  }
}

export type RegisteredAgentIdentity = {
  protocol: "ERC-8004 Solana Agent Registry";
  asset: string;
  owner: string;
  operationalWallet: string;
  registrationSignature: string;
  walletLinkSignature: string;
  metadataUri: string;
  verified: true;
};

type RegistryWriteResult = {
  success: boolean;
  signature: string;
  error?: string;
};

type RegistryAgent = {
  getOwnerPublicKey(): PublicKey;
  getAgentWalletPublicKey(): PublicKey | null;
};

export type AgentRegistryPort = {
  registerAgent(
    uri: string
  ): Promise<RegistryWriteResult & { asset?: PublicKey }>;
  setAgentWallet(
    asset: PublicKey,
    wallet: Keypair
  ): Promise<RegistryWriteResult>;
  loadAgent(asset: PublicKey): Promise<RegistryAgent>;
};

export async function createAgentRegistryClient({
  rpcUrl,
  owner,
}: {
  rpcUrl: string;
  owner: Keypair;
}): Promise<AgentRegistryPort> {
  // 8004-solana is ESM-only. Keep the legacy SDK behind this dynamic adapter
  // so the Kit-first application and tsx proof scripts do not inherit it.
  const { SolanaSDK } = await import("8004-solana");
  return new SolanaSDK({
    cluster: "devnet",
    rpcUrl,
    signer: owner,
    useIndexer: false,
    forceOnChain: true,
  }) as AgentRegistryPort;
}

export async function registerBudgetRailIdentity({
  registry,
  owner,
  operationalWallet,
  metadataUri = getBudgetRailAgentUri(),
}: {
  registry: AgentRegistryPort;
  owner: PublicKey;
  operationalWallet: Keypair;
  metadataUri?: string;
}): Promise<RegisteredAgentIdentity> {
  const registered = await registry.registerAgent(metadataUri);
  if (!registered.success || !registered.asset) {
    throw new Error(
      registered.error || "Agent Registry did not return an agent asset"
    );
  }

  const linked = await registry.setAgentWallet(
    registered.asset,
    operationalWallet
  );
  if (!linked.success) {
    throw new Error(
      linked.error || "Agent Registry did not link the operational wallet"
    );
  }

  const agent = await registry.loadAgent(registered.asset);
  const onChainOwner = agent.getOwnerPublicKey();
  const onChainWallet = agent.getAgentWalletPublicKey();
  if (!onChainOwner.equals(owner)) {
    throw new Error("Registered agent owner does not match the demo owner");
  }
  if (!onChainWallet?.equals(operationalWallet.publicKey)) {
    throw new Error(
      "Registered agent wallet does not match the payment delegate"
    );
  }

  return {
    protocol: "ERC-8004 Solana Agent Registry",
    asset: registered.asset.toBase58(),
    owner: onChainOwner.toBase58(),
    operationalWallet: onChainWallet.toBase58(),
    registrationSignature: registered.signature,
    walletLinkSignature: linked.signature,
    metadataUri,
    verified: true,
  };
}
