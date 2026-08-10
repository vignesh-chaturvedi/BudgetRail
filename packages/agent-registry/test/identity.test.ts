import { Keypair } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import {
  BUDGETRAIL_AGENT_URI,
  getBudgetRailAgentUri,
  registerBudgetRailIdentity,
  type AgentRegistryPort,
} from "../src";

describe("BudgetRail Agent Registry adapter", () => {
  it("uses the hosted same-origin agent card only for a valid HTTPS origin", () => {
    expect(
      getBudgetRailAgentUri({
        NODE_ENV: "test",
        BUDGETRAIL_PUBLIC_URL: "https://budgetrail.example",
      })
    ).toBe("https://budgetrail.example/.well-known/agent.json");
    expect(
      getBudgetRailAgentUri({
        NODE_ENV: "test",
        BUDGETRAIL_PUBLIC_URL: "http://budgetrail.example",
      })
    ).toBe(BUDGETRAIL_AGENT_URI);
  });

  it("registers an identity and verifies the operational wallet link", async () => {
    const owner = Keypair.generate();
    const operationalWallet = Keypair.generate();
    const asset = Keypair.generate().publicKey;
    const registry: AgentRegistryPort = {
      registerAgent: vi.fn().mockResolvedValue({
        success: true,
        signature: "register-signature",
        asset,
      }),
      setAgentWallet: vi.fn().mockResolvedValue({
        success: true,
        signature: "wallet-link-signature",
      }),
      loadAgent: vi.fn().mockResolvedValue({
        getOwnerPublicKey: () => owner.publicKey,
        getAgentWalletPublicKey: () => operationalWallet.publicKey,
      }),
    };

    await expect(
      registerBudgetRailIdentity({
        registry,
        owner: owner.publicKey,
        operationalWallet,
      })
    ).resolves.toEqual({
      protocol: "ERC-8004 Solana Agent Registry",
      asset: asset.toBase58(),
      owner: owner.publicKey.toBase58(),
      operationalWallet: operationalWallet.publicKey.toBase58(),
      registrationSignature: "register-signature",
      walletLinkSignature: "wallet-link-signature",
      metadataUri: BUDGETRAIL_AGENT_URI,
      verified: true,
    });
  });

  it("rejects a registry record that links a different wallet", async () => {
    const owner = Keypair.generate();
    const operationalWallet = Keypair.generate();
    const registry: AgentRegistryPort = {
      registerAgent: vi.fn().mockResolvedValue({
        success: true,
        signature: "register-signature",
        asset: Keypair.generate().publicKey,
      }),
      setAgentWallet: vi.fn().mockResolvedValue({
        success: true,
        signature: "wallet-link-signature",
      }),
      loadAgent: vi.fn().mockResolvedValue({
        getOwnerPublicKey: () => owner.publicKey,
        getAgentWalletPublicKey: () => Keypair.generate().publicKey,
      }),
    };

    await expect(
      registerBudgetRailIdentity({
        registry,
        owner: owner.publicKey,
        operationalWallet,
      })
    ).rejects.toThrow("does not match the payment delegate");
  });

  it("surfaces a failed registration without attempting wallet linkage", async () => {
    const owner = Keypair.generate();
    const operationalWallet = Keypair.generate();
    const setAgentWallet = vi.fn();
    const registry: AgentRegistryPort = {
      registerAgent: vi.fn().mockResolvedValue({
        success: false,
        signature: "",
        error: "registry unavailable",
      }),
      setAgentWallet,
      loadAgent: vi.fn(),
    };

    await expect(
      registerBudgetRailIdentity({
        registry,
        owner: owner.publicKey,
        operationalWallet,
      })
    ).rejects.toThrow("registry unavailable");
    expect(setAgentWallet).not.toHaveBeenCalled();
  });
});
