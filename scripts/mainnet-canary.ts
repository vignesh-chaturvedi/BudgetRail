import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  findAssociatedTokenPda,
  fetchToken,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  compileTransactionMessage,
  createEmptyClient,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageEncoder,
  isNone,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type Signature,
} from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { identity, payer } from "@solana/kit-plugin-signer";
import { associatedTokenProgram, tokenProgram } from "@solana-program/token";
import {
  fetchFixedDelegation,
  fetchSubscriptionAuthority,
  findFixedDelegationPda,
  findSubscriptionAuthorityPda,
  subscriptionsProgram,
} from "@solana/subscriptions";
import { Keypair } from "@solana/web3.js";
import type { PaymentRequired } from "@x402/core/types";
import { createRpcClient, toFacilitatorSvmSigner } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/facilitator";
import {
  BUDGETRAIL_FACILITATOR_OPTIONS,
  PaymentPolicyError,
  buildDelegatedPaymentPayload,
  selectBudgetRailRequirement,
} from "../packages/x402-adapter/src";
import {
  redactSensitiveText,
  safeErrorMessage,
} from "../packages/security/src";
import {
  ALLOWANCE_BASE_UNITS,
  EXPIRY_SECONDS,
  MAINNET_CAIP2,
  MAINNET_GENESIS_HASH,
  MAINNET_USDC_MINT,
  MAX_TOTAL_SOL_LAMPORTS,
  MIN_FACILITATOR_SOL_LAMPORTS,
  OVER_BUDGET_BASE_UNITS,
  PAYMENT_BASE_UNITS,
  SUBSCRIPTIONS_PROGRAM,
  TOKEN_PROGRAM,
  USDC_DECIMALS,
  addCanaryEvent,
  deriveCanaryNonce,
  explorerUrl,
  isPathInside,
  isCanaryAction,
  newCanaryEvidence,
  parseCanaryConfig,
  renderCanaryMarkdown,
  type CanaryAction,
  type CanaryBalances,
  type CanaryCheck,
  type CanaryConfig,
  type CanaryEvidence,
  type CanaryRole,
  type CanaryTransactionName,
} from "../packages/mainnet-canary/src";

const PHASE_6_COMMIT = "a953cc545e4bd234676358b34c19faec424d6499";
const MERCHANT_RESOURCE_URL =
  "https://merchant.budgetrail.test/api/mainnet-canary";
const MERCHANT_RESOURCE_ORIGIN = "https://merchant.budgetrail.test";
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const FINALIZATION_ATTEMPTS = 45;
const FINALIZATION_POLL_MS = 1_500;

type CanarySigner = Awaited<ReturnType<typeof createKeyPairSignerFromBytes>>;
type CanarySigners = Record<CanaryRole, CanarySigner>;
type MainnetRpc = ReturnType<typeof createRpcClient>;

function usage(): never {
  console.error(`Usage: pnpm phase7:canary <action> [--execute]

Actions:
  inspect    Read-only mainnet program, mint, and network verification
  keys       Create four disposable keypairs outside the repository
  addresses  Record public addresses only
  preflight  Verify clean Git state, private RPC, wallets, funds, and accounts
  run        Execute the fixed canary sequence (requires --execute + acknowledgement)
  contain    Revoke only the recorded active delegation after an aborted run
  finalize   Finish post-revoke proof and close authority after containment
  verify     Re-verify finalized transactions and terminal on-chain state
  sweep      Return USDC and material SOL to the recovery wallet
  report     Regenerate sanitized evidence Markdown from state.json

The write actions never accept private keys or RPC credentials as CLI arguments.`);
  process.exit(2);
}

function actionFromArgs(): CanaryAction {
  const value = process.argv[2] ?? "";
  if (!isCanaryAction(value)) usage();
  return value;
}

function createCanaryClient(
  identitySigner: CanarySigner,
  payerSigner: CanarySigner,
  rpcUrl: string
) {
  return createEmptyClient()
    .use(identity(identitySigner))
    .use(payer(payerSigner))
    .use(solanaRpc({ rpcUrl }))
    .use(associatedTokenProgram())
    .use(tokenProgram())
    .use(subscriptionsProgram());
}

function ensureExternalProtectedDirectory(
  config: CanaryConfig,
  path: string,
  label: string
) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const real = realpathSync(path);
  if (isPathInside(config.repoRoot, real)) {
    throw new Error(`${label} resolved inside the repository.`);
  }
  const stats = statSync(real);
  if (!stats.isDirectory()) throw new Error(`${label} is not a directory.`);
  chmodSync(real, 0o700);
  return real;
}

function writeProtectedFile(path: string, content: string, exclusive = false) {
  writeFileSync(path, content, {
    encoding: "utf8",
    flag: exclusive ? "wx" : "w",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}

function assertProtectedFile(path: string) {
  const real = realpathSync(path);
  const stats = statSync(real);
  if (!stats.isFile()) throw new Error(`${basename(path)} is not a file.`);
  if ((stats.mode & 0o077) !== 0) {
    throw new Error(
      `${basename(path)} must not be readable or writable by group/others (chmod 600).`
    );
  }
  return real;
}

async function loadSigner(path: string) {
  const real = assertProtectedFile(path);
  const parsed: unknown = JSON.parse(readFileSync(real, "utf8"));
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 64 ||
    !parsed.every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 255
    )
  ) {
    throw new Error(`${basename(path)} is not a valid Solana keypair file.`);
  }
  return createKeyPairSignerFromBytes(Uint8Array.from(parsed));
}

async function loadSigners(config: CanaryConfig): Promise<CanarySigners> {
  const [owner, agent, facilitator, merchant] = await Promise.all([
    loadSigner(config.keyPaths.owner),
    loadSigner(config.keyPaths.agent),
    loadSigner(config.keyPaths.facilitator),
    loadSigner(config.keyPaths.merchant),
  ]);
  const signers = { owner, agent, facilitator, merchant };
  const addresses = Object.values(signers).map((signer) => signer.address);
  if (new Set(addresses).size !== addresses.length) {
    throw new Error("Every canary role must use a different public address.");
  }
  return signers;
}

function createKeys(config: CanaryConfig) {
  ensureExternalProtectedDirectory(
    config,
    config.keyDir,
    "The mainnet key directory"
  );
  const existing = Object.values(config.keyPaths).filter(existsSync);
  if (existing.length > 0) {
    throw new Error(
      `Refusing to overwrite ${existing.map((path) => basename(path)).join(", ")}. Use a new run ID.`
    );
  }
  const generated = {
    owner: Keypair.generate(),
    agent: Keypair.generate(),
    facilitator: Keypair.generate(),
    merchant: Keypair.generate(),
  };
  for (const role of Object.keys(generated) as CanaryRole[]) {
    const parent = realpathSync(dirname(config.keyPaths[role]));
    if (isPathInside(config.repoRoot, parent)) {
      throw new Error(`${role} keypair parent resolved inside the repository.`);
    }
    if ((statSync(parent).mode & 0o077) !== 0) {
      throw new Error(
        `${role} keypair parent must have owner-only permissions (chmod 700).`
      );
    }
    writeProtectedFile(
      config.keyPaths[role],
      JSON.stringify(Array.from(generated[role].secretKey)),
      true
    );
  }
  return Object.fromEntries(
    (Object.keys(generated) as CanaryRole[]).map((role) => [
      role,
      generated[role].publicKey.toBase58(),
    ])
  ) as Record<CanaryRole, string>;
}

function git(config: CanaryConfig, args: string[]) {
  return execFileSync("git", args, {
    cwd: config.repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function writeEvidence(config: CanaryConfig, evidence: CanaryEvidence) {
  ensureExternalProtectedDirectory(
    config,
    config.evidenceDir,
    "The evidence directory"
  );
  evidence.updatedAtUtc = new Date().toISOString();
  const stateTemp = resolve(
    dirname(config.statePath),
    `.state-${process.pid}.tmp`
  );
  const reportPath = resolve(config.evidenceDir, "report.md");
  const reportTemp = resolve(dirname(reportPath), `.report-${process.pid}.tmp`);
  writeProtectedFile(stateTemp, `${JSON.stringify(evidence, null, 2)}\n`, true);
  renameSync(stateTemp, config.statePath);
  chmodSync(config.statePath, 0o600);
  writeProtectedFile(reportTemp, renderCanaryMarkdown(evidence), true);
  renameSync(reportTemp, reportPath);
  chmodSync(reportPath, 0o600);
}

function readEvidence(config: CanaryConfig) {
  if (!existsSync(config.statePath)) {
    throw new Error(
      `No evidence state exists for ${config.runId}. Run keys and addresses first.`
    );
  }
  const evidence = JSON.parse(
    readFileSync(config.statePath, "utf8")
  ) as CanaryEvidence;
  if (
    evidence.schema !== "budgetrail.mainnet-canary.v1" ||
    evidence.runId !== config.runId
  ) {
    throw new Error("The evidence state schema or run ID does not match.");
  }
  return evidence;
}

function safeDetail(value: unknown, config: CanaryConfig) {
  const raw =
    typeof value === "string"
      ? value
      : safeErrorMessage(value, "The operation failed closed.");
  const withoutRpc = config.rpcUrl
    ? raw.replaceAll(config.rpcUrl, "[REDACTED_RPC_URL]")
    : raw;
  return redactSensitiveText(withoutRpc).slice(0, 500);
}

async function networkFacts(rpc: MainnetRpc) {
  const [genesisHash, accounts, tokenSupply, finalizedSlot] = await Promise.all(
    [
      rpc.getGenesisHash().send(),
      rpc
        .getMultipleAccounts(
          [address(SUBSCRIPTIONS_PROGRAM), address(MAINNET_USDC_MINT)],
          { commitment: "finalized", encoding: "base64" }
        )
        .send(),
      rpc
        .getTokenSupply(address(MAINNET_USDC_MINT), {
          commitment: "finalized",
        })
        .send(),
      rpc.getSlot({ commitment: "finalized" }).send(),
    ]
  );
  const program = accounts.value[0];
  const mint = accounts.value[1];
  return {
    genesisHash: String(genesisHash),
    finalizedSlot: finalizedSlot.toString(),
    programExecutable: program?.executable === true,
    programOwner: program?.owner ? String(program.owner) : "missing",
    mintExists: Boolean(mint),
    mintOwner: mint?.owner ? String(mint.owner) : "missing",
    mintDecimals: tokenSupply.value.decimals,
  };
}

function assertNetworkFacts(facts: Awaited<ReturnType<typeof networkFacts>>) {
  if (facts.genesisHash !== MAINNET_GENESIS_HASH) {
    throw new Error(`Unexpected genesis hash ${facts.genesisHash}.`);
  }
  if (!facts.programExecutable) {
    throw new Error("The pinned Subscriptions Program is not executable.");
  }
  if (!facts.mintExists || facts.mintOwner !== TOKEN_PROGRAM) {
    throw new Error(
      "The pinned USDC mint or token-program owner does not match."
    );
  }
  if (facts.mintDecimals !== USDC_DECIMALS) {
    throw new Error("The pinned USDC mint does not use 6 decimals.");
  }
}

async function tokenBalance(
  rpc: MainnetRpc,
  owner: Address
): Promise<{ ata: Address; amount: bigint }> {
  const [ata] = await findAssociatedTokenPda({
    owner,
    mint: address(MAINNET_USDC_MINT),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const account = await rpc
    .getAccountInfo(ata, { commitment: "finalized", encoding: "base64" })
    .send();
  if (!account.value) return { ata, amount: 0n };
  const balance = await rpc
    .getTokenAccountBalance(ata, { commitment: "finalized" })
    .send();
  return { ata, amount: BigInt(balance.value.amount) };
}

async function balances(
  rpc: MainnetRpc,
  signers: Pick<CanarySigners, CanaryRole>
): Promise<CanaryBalances> {
  const [
    ownerUsdc,
    merchantUsdc,
    ownerSol,
    agentSol,
    facilitatorSol,
    merchantSol,
  ] = await Promise.all([
    tokenBalance(rpc, signers.owner.address),
    tokenBalance(rpc, signers.merchant.address),
    rpc.getBalance(signers.owner.address, { commitment: "finalized" }).send(),
    rpc.getBalance(signers.agent.address, { commitment: "finalized" }).send(),
    rpc
      .getBalance(signers.facilitator.address, { commitment: "finalized" })
      .send(),
    rpc
      .getBalance(signers.merchant.address, { commitment: "finalized" })
      .send(),
  ]);
  return {
    ownerUsdc: ownerUsdc.amount.toString(),
    merchantUsdc: merchantUsdc.amount.toString(),
    ownerSolLamports: ownerSol.value.toString(),
    agentSolLamports: agentSol.value.toString(),
    facilitatorSolLamports: facilitatorSol.value.toString(),
    merchantSolLamports: merchantSol.value.toString(),
  };
}

function totalSol(snapshot: CanaryBalances) {
  return (
    BigInt(snapshot.ownerSolLamports) +
    BigInt(snapshot.agentSolLamports) +
    BigInt(snapshot.facilitatorSolLamports) +
    BigInt(snapshot.merchantSolLamports)
  );
}

function samePaymentBalances(a: CanaryBalances, b: CanaryBalances) {
  return a.ownerUsdc === b.ownerUsdc && a.merchantUsdc === b.merchantUsdc;
}

function recordCheck(
  checks: CanaryCheck[],
  id: string,
  passed: boolean,
  detail: string
) {
  checks.push({ id, status: passed ? "pass" : "fail", detail });
  return passed;
}

async function waitForFinalized(rpc: MainnetRpc, value: string) {
  const txSignature = value as Signature;
  for (let attempt = 0; attempt < FINALIZATION_ATTEMPTS; attempt += 1) {
    const response = await rpc
      .getSignatureStatuses([txSignature], { searchTransactionHistory: true })
      .send();
    const status = response.value[0];
    if (status?.err) {
      throw new Error(`Transaction ${value} finalized with an error.`);
    }
    if (status?.confirmationStatus === "finalized") {
      return status.slot.toString();
    }
    await new Promise((resolveDelay) =>
      setTimeout(resolveDelay, FINALIZATION_POLL_MS)
    );
  }
  throw new Error(
    `Transaction ${value} did not reach finalized status within the canary timeout. Resolve its status before retrying.`
  );
}

async function recordTransaction(
  config: CanaryConfig,
  evidence: CanaryEvidence,
  rpc: MainnetRpc,
  name: CanaryTransactionName,
  signature: string
) {
  const finalizedSlot = await waitForFinalized(rpc, signature);
  evidence.transactions[name] = {
    signature,
    finalizedSlot,
    explorerUrl: explorerUrl(signature),
  };
  addCanaryEvent(evidence, name, "pass", `Finalized at slot ${finalizedSlot}.`);
  writeEvidence(config, evidence);
  return finalizedSlot;
}

async function ensureTokenDelegateCleared(
  config: CanaryConfig,
  evidence: CanaryEvidence,
  rpc: MainnetRpc,
  ownerClient: ReturnType<typeof createCanaryClient>,
  owner: CanarySigner,
  ownerAta: Address
) {
  let tokenAccount = await fetchToken(rpc, ownerAta, {
    commitment: "finalized",
  });
  if (!isNone(tokenAccount.data.delegate)) {
    const revoked = await ownerClient.token.instructions
      .revoke({ source: ownerAta, owner })
      .sendTransaction();
    await recordTransaction(
      config,
      evidence,
      rpc,
      "clearTokenDelegate",
      revoked.context.signature
    );
    tokenAccount = await fetchToken(rpc, ownerAta, {
      commitment: "finalized",
    });
  }
  if (!isNone(tokenAccount.data.delegate)) {
    throw new Error("Owner USDC account still has a token delegate.");
  }
}

function paymentRequired(
  merchant: Address,
  facilitator: Address,
  amount: bigint
): PaymentRequired {
  return {
    x402Version: 2,
    resource: {
      url: MERCHANT_RESOURCE_URL,
      description: "BudgetRail Phase 7 mainnet canary result",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: MAINNET_CAIP2,
        asset: MAINNET_USDC_MINT,
        amount: amount.toString(),
        payTo: merchant,
        maxTimeoutSeconds: 60,
        extra: { feePayer: facilitator },
      },
    ],
  };
}

function paymentPolicy(
  merchant: Address,
  facilitator: Address,
  maxAmount: bigint
) {
  return {
    network: MAINNET_CAIP2,
    asset: MAINNET_USDC_MINT,
    payTo: merchant,
    maxAmount,
    maxTimeoutSeconds: 120,
    allowedResourceOrigins: [MERCHANT_RESOURCE_ORIGIN],
    allowedFeePayers: [facilitator],
  } as const;
}

async function createPayload(
  config: CanaryConfig,
  signers: CanarySigners,
  amount: bigint,
  memo: string
) {
  const required = paymentRequired(
    signers.merchant.address,
    signers.facilitator.address,
    amount
  );
  const requirement = selectBudgetRailRequirement(
    required,
    paymentPolicy(signers.merchant.address, signers.facilitator.address, amount)
  );
  const built = await buildDelegatedPaymentPayload({
    requirement,
    delegator: signers.owner.address,
    delegatee: signers.agent,
    delegationNonce: deriveCanaryNonce(config.runId),
    memo,
    rpcUrl: config.rpcUrl,
  });
  return { ...built, requirement };
}

function createFacilitator(config: CanaryConfig, signer: CanarySigner) {
  return new ExactSvmScheme(
    toFacilitatorSvmSigner(signer, { defaultRpcUrl: config.rpcUrl }),
    undefined,
    BUDGETRAIL_FACILITATOR_OPTIONS
  );
}

async function recordAddresses(
  config: CanaryConfig,
  signers: CanarySigners,
  existing?: CanaryEvidence
) {
  const evidence = existing ?? newCanaryEvidence(config, PHASE_6_COMMIT);
  evidence.addresses.owner = signers.owner.address;
  evidence.addresses.agent = signers.agent.address;
  evidence.addresses.facilitator = signers.facilitator.address;
  evidence.addresses.merchant = signers.merchant.address;
  addCanaryEvent(
    evidence,
    "addresses",
    "pass",
    "Recorded four unique disposable public addresses; no secret material entered evidence."
  );
  writeEvidence(config, evidence);
  return evidence;
}

async function performPreflight(config: CanaryConfig, signers: CanarySigners) {
  const rpc = createRpcClient(MAINNET_CAIP2, config.rpcUrl);
  const evidence = existsSync(config.statePath)
    ? readEvidence(config)
    : await recordAddresses(config, signers);
  const checks: CanaryCheck[] = [];
  evidence.rpcProvider = config.rpcProvider;

  const gitStatus = git(config, ["status", "--porcelain"]);
  const head = git(config, ["rev-parse", "HEAD"]);
  recordCheck(checks, "git-clean", gitStatus === "", "Working tree is clean.");
  recordCheck(
    checks,
    "phase7-commit",
    head !== PHASE_6_COMMIT,
    `Canary commit ${head}.`
  );
  evidence.canaryCommit = head;

  for (const [role, path] of Object.entries(config.keyPaths)) {
    let secure = false;
    try {
      assertProtectedFile(path);
      secure = true;
    } catch {
      secure = false;
    }
    recordCheck(
      checks,
      `key-${role}-protected`,
      secure,
      `${role} keypair is outside Git with owner-only permissions.`
    );
  }

  const facts = await networkFacts(rpc);
  recordCheck(
    checks,
    "mainnet-genesis",
    facts.genesisHash === MAINNET_GENESIS_HASH,
    `Genesis hash ${facts.genesisHash}.`
  );
  recordCheck(
    checks,
    "subscriptions-program",
    facts.programExecutable,
    `Pinned program executable at finalized slot ${facts.finalizedSlot}.`
  );
  recordCheck(
    checks,
    "canonical-usdc",
    facts.mintExists &&
      facts.mintOwner === TOKEN_PROGRAM &&
      facts.mintDecimals === USDC_DECIMALS,
    `Pinned mint owner and ${facts.mintDecimals} decimals matched.`
  );

  const snapshot = await balances(rpc, signers);
  evidence.balances.before = snapshot;
  recordCheck(
    checks,
    "owner-usdc-exact",
    BigInt(snapshot.ownerUsdc) === ALLOWANCE_BASE_UNITS,
    `Owner holds ${snapshot.ownerUsdc} USDC base units; expected exactly ${ALLOWANCE_BASE_UNITS}.`
  );
  recordCheck(
    checks,
    "merchant-usdc-empty",
    BigInt(snapshot.merchantUsdc) === 0n,
    `Merchant begins with ${snapshot.merchantUsdc} USDC base units.`
  );
  recordCheck(
    checks,
    "facilitator-fees-funded",
    BigInt(snapshot.facilitatorSolLamports) >= MIN_FACILITATOR_SOL_LAMPORTS,
    `Facilitator holds ${snapshot.facilitatorSolLamports} lamports.`
  );
  recordCheck(
    checks,
    "sol-exposure-ceiling",
    totalSol(snapshot) <= MAX_TOTAL_SOL_LAMPORTS,
    `Combined canary balance is ${totalSol(snapshot)} lamports; ceiling is ${MAX_TOTAL_SOL_LAMPORTS}.`
  );

  const ownerClient = createCanaryClient(
    signers.owner,
    signers.facilitator,
    config.rpcUrl!
  );
  const authority =
    await ownerClient.subscriptions.queries.isSubscriptionAuthorityInitialized(
      signers.owner.address,
      address(MAINNET_USDC_MINT)
    );
  const delegations =
    await ownerClient.subscriptions.queries.delegationsByDelegator(
      signers.owner.address
    );
  recordCheck(
    checks,
    "fresh-authority",
    !authority.initialized,
    "Owner has no existing USDC Subscription Authority."
  );
  recordCheck(
    checks,
    "no-existing-delegations",
    delegations.length === 0,
    `Owner has ${delegations.length} existing delegation accounts.`
  );

  evidence.checks = checks;
  const failed = checks.filter((check) => check.status === "fail");
  if (failed.length > 0) {
    evidence.status = "aborted";
    addCanaryEvent(
      evidence,
      "preflight",
      "fail",
      `${failed.length} preflight check(s) failed: ${failed.map((check) => check.id).join(", ")}.`
    );
    writeEvidence(config, evidence);
    throw new Error(
      `Preflight failed: ${failed.map((check) => check.id).join(", ")}.`
    );
  }
  evidence.status = "preflight-passed";
  addCanaryEvent(
    evidence,
    "preflight",
    "pass",
    `All ${checks.length} safety checks passed at finalized slot ${facts.finalizedSlot}.`
  );
  writeEvidence(config, evidence);
  return { evidence, rpc, ownerClient };
}

async function executeCanary(config: CanaryConfig, signers: CanarySigners) {
  const { evidence, rpc, ownerClient } = await performPreflight(
    config,
    signers
  );
  if (Object.keys(evidence.transactions).length > 0) {
    throw new Error(
      "This run already contains a transaction. Refusing to replay a mainnet canary."
    );
  }
  evidence.status = "running";
  addCanaryEvent(
    evidence,
    "run",
    "info",
    "Mainnet write sequence started after explicit acknowledgement."
  );
  writeEvidence(config, evidence);

  const ownerToken = await tokenBalance(rpc, signers.owner.address);
  const merchantToken = await tokenBalance(rpc, signers.merchant.address);
  evidence.addresses.ownerAta = ownerToken.ata;
  evidence.addresses.merchantAta = merchantToken.ata;

  const setupInstructions: Instruction[] = [];
  if (merchantToken.amount === 0n) {
    const merchantAtaInfo = await rpc
      .getAccountInfo(merchantToken.ata, {
        commitment: "finalized",
        encoding: "base64",
      })
      .send();
    if (!merchantAtaInfo.value) {
      setupInstructions.push(
        await ownerClient.associatedToken.instructions.createAssociatedTokenIdempotent(
          {
            owner: signers.merchant.address,
            mint: address(MAINNET_USDC_MINT),
            tokenProgram: TOKEN_PROGRAM_ADDRESS,
          }
        )
      );
    }
  }
  setupInstructions.push(
    await ownerClient.subscriptions.instructions.initSubscriptionAuthority({
      tokenMint: address(MAINNET_USDC_MINT),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      userAta: ownerToken.ata,
    })
  );
  const setup = await ownerClient.sendTransaction(setupInstructions);
  await recordTransaction(
    config,
    evidence,
    rpc,
    "setup",
    setup.context.signature
  );

  const [subscriptionAuthority] = await findSubscriptionAuthorityPda({
    user: signers.owner.address,
    tokenMint: address(MAINNET_USDC_MINT),
  });
  evidence.addresses.subscriptionAuthority = subscriptionAuthority;
  const authorityAccount = await fetchSubscriptionAuthority(
    rpc,
    subscriptionAuthority,
    { commitment: "finalized" }
  );
  if (
    authorityAccount.data.user !== signers.owner.address ||
    authorityAccount.data.tokenMint !== MAINNET_USDC_MINT
  ) {
    throw new Error("Subscription Authority state did not match the run plan.");
  }

  const nonce = deriveCanaryNonce(config.runId);
  const expiryTs = BigInt(Math.floor(Date.now() / 1000) + EXPIRY_SECONDS);
  evidence.parameters.expiryTs = expiryTs.toString();
  const create = await ownerClient.subscriptions.instructions
    .createFixedDelegation({
      amount: ALLOWANCE_BASE_UNITS,
      delegatee: signers.agent.address,
      expectedSubscriptionAuthorityInitId: authorityAccount.data.initId,
      expiryTs,
      nonce,
      tokenMint: address(MAINNET_USDC_MINT),
    })
    .sendTransaction();

  const [delegation] = await findFixedDelegationPda({
    subscriptionAuthority,
    delegator: signers.owner.address,
    delegatee: signers.agent.address,
    nonce,
  });
  evidence.addresses.delegation = delegation;
  await recordTransaction(
    config,
    evidence,
    rpc,
    "delegation",
    create.context.signature
  );
  const delegationAccount = await fetchFixedDelegation(rpc, delegation, {
    commitment: "finalized",
  });
  const delegationMatched =
    delegationAccount.data.header.delegator === signers.owner.address &&
    delegationAccount.data.header.delegatee === signers.agent.address &&
    delegationAccount.data.header.initId === authorityAccount.data.initId &&
    delegationAccount.data.mint === MAINNET_USDC_MINT &&
    delegationAccount.data.amount === ALLOWANCE_BASE_UNITS &&
    delegationAccount.data.expiryTs === expiryTs;
  if (!delegationMatched) {
    throw new Error("The finalized fixed delegation did not match exactly.");
  }
  evidence.verification = {
    delegationMatched: true,
    paymentDeltaMatched: false,
    delegationClosed: false,
    authorityClosed: false,
    tokenDelegateCleared: false,
  };
  writeEvidence(config, evidence);

  const facilitator = createFacilitator(config, signers.facilitator);
  const valid = await createPayload(
    config,
    signers,
    PAYMENT_BASE_UNITS,
    `budgetrail-${config.runId}-payment`
  );
  const verification = await facilitator.verify(
    valid.paymentPayload,
    valid.requirement
  );
  if (!verification.isValid) {
    throw new Error(
      "Restricted facilitator simulation rejected the valid payment."
    );
  }
  const settlement = await facilitator.settle(
    valid.paymentPayload,
    valid.requirement
  );
  if (!settlement.success) {
    throw new Error("The valid x402 settlement failed closed.");
  }
  await recordTransaction(
    config,
    evidence,
    rpc,
    "payment",
    settlement.transaction
  );

  const afterPayment = await balances(rpc, signers);
  evidence.balances.afterPayment = afterPayment;
  const remaining = await fetchFixedDelegation(rpc, delegation, {
    commitment: "finalized",
  });
  const paymentDeltaMatched =
    BigInt(evidence.balances.before!.ownerUsdc) -
      BigInt(afterPayment.ownerUsdc) ===
      PAYMENT_BASE_UNITS &&
    BigInt(afterPayment.merchantUsdc) -
      BigInt(evidence.balances.before!.merchantUsdc) ===
      PAYMENT_BASE_UNITS &&
    remaining.data.amount === ALLOWANCE_BASE_UNITS - PAYMENT_BASE_UNITS;
  if (!paymentDeltaMatched) {
    throw new Error("The finalized payment balance invariants did not match.");
  }
  evidence.verification.paymentDeltaMatched = true;
  addCanaryEvent(
    evidence,
    "payment-invariants",
    "pass",
    "Owner decreased, merchant increased, and remaining allowance changed by exactly 100000 base units."
  );
  writeEvidence(config, evidence);

  let policyCode = "";
  try {
    selectBudgetRailRequirement(
      paymentRequired(
        signers.merchant.address,
        signers.facilitator.address,
        OVER_BUDGET_BASE_UNITS
      ),
      paymentPolicy(
        signers.merchant.address,
        signers.facilitator.address,
        PAYMENT_BASE_UNITS
      )
    );
  } catch (error) {
    if (!(error instanceof PaymentPolicyError)) throw error;
    policyCode = error.code;
  }
  if (policyCode !== "AMOUNT_EXCEEDS_REQUEST_LIMIT") {
    throw new Error("The deterministic policy did not reject 0.30 USDC.");
  }
  const overBudget = await createPayload(
    config,
    signers,
    OVER_BUDGET_BASE_UNITS,
    `budgetrail-${config.runId}-over-budget`
  );
  const beforeOverBudget = await balances(rpc, signers);
  const overBudgetVerification = await facilitator.verify(
    overBudget.paymentPayload,
    overBudget.requirement
  );
  const afterOverBudget = await balances(rpc, signers);
  if (overBudgetVerification.isValid) {
    throw new Error("Native simulation unexpectedly accepted 0.30 USDC.");
  }
  const overBudgetUnchanged = samePaymentBalances(
    beforeOverBudget,
    afterOverBudget
  );
  if (!overBudgetUnchanged) {
    throw new Error("The rejected over-budget probe changed token balances.");
  }
  evidence.negativeTests.overBudget = {
    policyCode,
    simulation: "rejected",
    reason: safeDetail(
      overBudgetVerification.invalidReason ?? "Native allowance rejection",
      config
    ),
    balancesUnchanged: true,
  };
  addCanaryEvent(
    evidence,
    "over-budget",
    "pass",
    "Policy and restricted native simulation rejected 300000 base units with balances unchanged."
  );
  writeEvidence(config, evidence);

  const revoke = await ownerClient.subscriptions.instructions
    .revokeDelegation({
      delegationAccount: delegation,
      receiver: signers.facilitator.address,
    })
    .sendTransaction();
  await recordTransaction(
    config,
    evidence,
    rpc,
    "revoke",
    revoke.context.signature
  );
  const delegationAfterRevoke = await rpc
    .getAccountInfo(delegation, {
      commitment: "finalized",
      encoding: "base64",
    })
    .send();
  if (delegationAfterRevoke.value) {
    throw new Error("Delegation account still exists after finalized revoke.");
  }
  evidence.verification.delegationClosed = true;

  const postRevoke = await createPayload(
    config,
    signers,
    PAYMENT_BASE_UNITS,
    `budgetrail-${config.runId}-post-revoke`
  );
  const beforePostRevoke = await balances(rpc, signers);
  const postRevokeVerification = await facilitator.verify(
    postRevoke.paymentPayload,
    postRevoke.requirement
  );
  const afterPostRevoke = await balances(rpc, signers);
  if (postRevokeVerification.isValid) {
    throw new Error("Native simulation accepted a payment after revocation.");
  }
  const postRevokeUnchanged = samePaymentBalances(
    beforePostRevoke,
    afterPostRevoke
  );
  if (!postRevokeUnchanged) {
    throw new Error("The post-revoke probe changed token balances.");
  }
  evidence.negativeTests.postRevoke = {
    simulation: "rejected",
    reason: safeDetail(
      postRevokeVerification.invalidReason ?? "Revoked delegation rejection",
      config
    ),
    balancesUnchanged: true,
  };
  evidence.balances.afterNegativeTests = afterPostRevoke;
  addCanaryEvent(
    evidence,
    "post-revoke",
    "pass",
    "Restricted native simulation rejected the formerly valid payment with balances unchanged."
  );
  writeEvidence(config, evidence);

  const close = await ownerClient.subscriptions.instructions
    .closeSubscriptionAuthority({
      receiver: signers.facilitator.address,
      tokenMint: address(MAINNET_USDC_MINT),
      user: signers.owner,
    })
    .sendTransaction();
  await recordTransaction(
    config,
    evidence,
    rpc,
    "closeAuthority",
    close.context.signature
  );
  const authorityInfo = await rpc
    .getAccountInfo(subscriptionAuthority, {
      commitment: "finalized",
      encoding: "base64",
    })
    .send();
  if (authorityInfo.value) {
    throw new Error("Subscription Authority still exists after close.");
  }
  await ensureTokenDelegateCleared(
    config,
    evidence,
    rpc,
    ownerClient,
    signers.owner,
    ownerToken.ata
  );
  evidence.verification.authorityClosed = true;
  evidence.verification.tokenDelegateCleared = true;
  evidence.verification.finalSlot =
    evidence.transactions.clearTokenDelegate?.finalizedSlot ??
    evidence.transactions.closeAuthority!.finalizedSlot;
  evidence.status = "canary-passed";
  addCanaryEvent(
    evidence,
    "canary",
    "pass",
    "All positive and negative invariants passed; material funds are ready to sweep."
  );
  writeEvidence(config, evidence);
  return evidence;
}

async function verifyCanary(config: CanaryConfig, signers: CanarySigners) {
  const evidence = readEvidence(config);
  for (const role of Object.keys(signers) as CanaryRole[]) {
    if (evidence.addresses[role] !== signers[role].address) {
      throw new Error(`${role} signer does not match the recorded evidence.`);
    }
  }
  const rpc = createRpcClient(MAINNET_CAIP2, config.rpcUrl);
  assertNetworkFacts(await networkFacts(rpc));
  let maxSlot = 0n;
  for (const [name, transaction] of Object.entries(evidence.transactions)) {
    const slot = await waitForFinalized(rpc, transaction.signature);
    if (BigInt(slot) > maxSlot) maxSlot = BigInt(slot);
    if (slot !== transaction.finalizedSlot) {
      throw new Error(`${name} finalized-slot evidence changed unexpectedly.`);
    }
  }
  if (evidence.addresses.delegation) {
    const account = await rpc
      .getAccountInfo(address(evidence.addresses.delegation), {
        commitment: "finalized",
        encoding: "base64",
      })
      .send();
    if (account.value) throw new Error("Delegation account is not closed.");
  }
  if (evidence.addresses.subscriptionAuthority) {
    const account = await rpc
      .getAccountInfo(address(evidence.addresses.subscriptionAuthority), {
        commitment: "finalized",
        encoding: "base64",
      })
      .send();
    if (account.value) throw new Error("Subscription Authority is not closed.");
  }
  if (evidence.status === "canary-passed") {
    if (!evidence.addresses.ownerAta) {
      throw new Error("Owner USDC account was not recorded.");
    }
    const tokenAccount = await fetchToken(
      rpc,
      address(evidence.addresses.ownerAta),
      { commitment: "finalized" }
    );
    if (!isNone(tokenAccount.data.delegate)) {
      throw new Error("Owner USDC token delegate is not cleared.");
    }
    const snapshot = await balances(rpc, signers);
    if (
      BigInt(snapshot.ownerUsdc) !==
        ALLOWANCE_BASE_UNITS - PAYMENT_BASE_UNITS ||
      BigInt(snapshot.merchantUsdc) !== PAYMENT_BASE_UNITS
    ) {
      throw new Error("Final token balances do not match the canary payment.");
    }
    if (
      !evidence.negativeTests.overBudget?.balancesUnchanged ||
      !evidence.negativeTests.postRevoke?.balancesUnchanged
    ) {
      throw new Error("Negative-test evidence is incomplete.");
    }
  }
  if (evidence.status === "swept") {
    for (const [label, value] of [
      ["Owner", evidence.addresses.ownerAta],
      ["Merchant", evidence.addresses.merchantAta],
    ] as const) {
      if (!value) throw new Error(`${label} USDC account was not recorded.`);
      const account = await rpc
        .getAccountInfo(address(value), {
          commitment: "finalized",
          encoding: "base64",
        })
        .send();
      if (account.value)
        throw new Error(`${label} USDC account is not closed.`);
    }
    const snapshot = await balances(rpc, signers);
    if (
      BigInt(snapshot.ownerUsdc) !== 0n ||
      BigInt(snapshot.merchantUsdc) !== 0n ||
      BigInt(snapshot.ownerSolLamports) !== 0n ||
      BigInt(snapshot.agentSolLamports) !== 0n ||
      BigInt(snapshot.facilitatorSolLamports) !== 0n ||
      BigInt(snapshot.merchantSolLamports) !== 0n
    ) {
      throw new Error(
        "Disposable wallets do not have a zero terminal balance."
      );
    }
    evidence.balances.afterSweep = snapshot;
  }
  if (
    !evidence.negativeTests.overBudget?.balancesUnchanged ||
    !evidence.negativeTests.postRevoke?.balancesUnchanged
  ) {
    throw new Error("Negative-test evidence is incomplete.");
  }
  evidence.verification ??= {
    delegationMatched: false,
    paymentDeltaMatched: false,
    delegationClosed: false,
    authorityClosed: false,
    tokenDelegateCleared: false,
  };
  evidence.verification.delegationClosed = true;
  evidence.verification.authorityClosed = true;
  if (evidence.status === "canary-passed") {
    evidence.verification.tokenDelegateCleared = true;
  }
  if (evidence.status === "swept") {
    evidence.verification.ownerAtaClosed = true;
    evidence.verification.merchantAtaClosed = true;
  }
  evidence.verification.finalSlot = maxSlot.toString();
  addCanaryEvent(
    evidence,
    "independent-verification",
    "pass",
    `Re-verified finalized signatures and terminal accounts through slot ${maxSlot}.`
  );
  writeEvidence(config, evidence);
  return evidence;
}

async function containCanary(config: CanaryConfig, signers: CanarySigners) {
  const evidence = readEvidence(config);
  if (!evidence.addresses.delegation) {
    throw new Error("No recorded delegation is available to contain.");
  }
  const rpc = createRpcClient(MAINNET_CAIP2, config.rpcUrl);
  assertNetworkFacts(await networkFacts(rpc));
  const delegation = address(evidence.addresses.delegation);
  const account = await rpc
    .getAccountInfo(delegation, {
      commitment: "finalized",
      encoding: "base64",
    })
    .send();
  if (!account.value) {
    evidence.status = "contained";
    evidence.verification ??= {
      delegationMatched: false,
      paymentDeltaMatched: false,
      delegationClosed: true,
      authorityClosed: false,
      tokenDelegateCleared: false,
    };
    evidence.verification.delegationClosed = true;
    addCanaryEvent(
      evidence,
      "containment",
      "pass",
      "The recorded delegation was already closed."
    );
    writeEvidence(config, evidence);
    return evidence;
  }

  const decoded = await fetchFixedDelegation(rpc, delegation, {
    commitment: "finalized",
  });
  if (
    decoded.data.header.delegator !== signers.owner.address ||
    decoded.data.header.delegatee !== signers.agent.address ||
    decoded.data.mint !== MAINNET_USDC_MINT ||
    decoded.data.amount > ALLOWANCE_BASE_UNITS
  ) {
    throw new Error(
      "The active delegation does not match the recorded canary."
    );
  }

  const client = createCanaryClient(
    signers.owner,
    signers.facilitator,
    config.rpcUrl!
  );
  const result = await client.subscriptions.instructions
    .revokeDelegation({
      delegationAccount: delegation,
      receiver: signers.facilitator.address,
    })
    .sendTransaction();
  await recordTransaction(
    config,
    evidence,
    rpc,
    "revoke",
    result.context.signature
  );
  const after = await rpc
    .getAccountInfo(delegation, {
      commitment: "finalized",
      encoding: "base64",
    })
    .send();
  if (after.value)
    throw new Error("Delegation remains active after containment.");
  evidence.status = "contained";
  evidence.verification ??= {
    delegationMatched: true,
    paymentDeltaMatched: false,
    delegationClosed: true,
    authorityClosed: false,
    tokenDelegateCleared: false,
  };
  evidence.verification.delegationClosed = true;
  addCanaryEvent(
    evidence,
    "containment",
    "pass",
    "Revoked the active fixed delegation and verified its account is closed."
  );
  writeEvidence(config, evidence);
  return evidence;
}

async function finalizeContainedCanary(
  config: CanaryConfig,
  signers: CanarySigners
) {
  const evidence = readEvidence(config);
  if (
    evidence.status !== "contained" ||
    !evidence.transactions.setup ||
    !evidence.transactions.delegation ||
    !evidence.transactions.payment ||
    !evidence.transactions.revoke ||
    !evidence.verification?.delegationMatched ||
    !evidence.verification.paymentDeltaMatched ||
    !evidence.verification.delegationClosed ||
    !evidence.addresses.delegation ||
    !evidence.addresses.subscriptionAuthority ||
    !evidence.addresses.ownerAta
  ) {
    throw new Error("Contained canary evidence is incomplete or inconsistent.");
  }

  const rpc = createRpcClient(MAINNET_CAIP2, config.rpcUrl);
  assertNetworkFacts(await networkFacts(rpc));
  const [delegationInfo, authorityInfo] = await Promise.all([
    rpc
      .getAccountInfo(address(evidence.addresses.delegation), {
        commitment: "finalized",
        encoding: "base64",
      })
      .send(),
    rpc
      .getAccountInfo(address(evidence.addresses.subscriptionAuthority), {
        commitment: "finalized",
        encoding: "base64",
      })
      .send(),
  ]);
  if (delegationInfo.value) {
    throw new Error("Delegation is active; refusing to finalize containment.");
  }
  const beforePostRevoke = await balances(rpc, signers);
  if (
    BigInt(beforePostRevoke.ownerUsdc) !==
      ALLOWANCE_BASE_UNITS - PAYMENT_BASE_UNITS ||
    BigInt(beforePostRevoke.merchantUsdc) !== PAYMENT_BASE_UNITS
  ) {
    throw new Error("Post-containment token balances do not match the canary.");
  }
  if (!evidence.negativeTests.postRevoke?.balancesUnchanged) {
    const facilitator = createFacilitator(config, signers.facilitator);
    const postRevoke = await createPayload(
      config,
      signers,
      PAYMENT_BASE_UNITS,
      `budgetrail-${config.runId}-post-revoke`
    );
    const postRevokeVerification = await facilitator.verify(
      postRevoke.paymentPayload,
      postRevoke.requirement
    );
    const afterPostRevoke = await balances(rpc, signers);
    if (postRevokeVerification.isValid) {
      throw new Error(
        "Native simulation accepted a payment after containment."
      );
    }
    if (!samePaymentBalances(beforePostRevoke, afterPostRevoke)) {
      throw new Error("The post-containment probe changed token balances.");
    }
    evidence.negativeTests.postRevoke = {
      simulation: "rejected",
      reason: safeDetail(
        postRevokeVerification.invalidReason ?? "Revoked delegation rejection",
        config
      ),
      balancesUnchanged: true,
    };
    evidence.balances.afterNegativeTests = afterPostRevoke;
    addCanaryEvent(
      evidence,
      "post-revoke",
      "pass",
      "Restricted native simulation rejected the formerly valid payment after containment with balances unchanged."
    );
    writeEvidence(config, evidence);
  }

  const ownerClient = createCanaryClient(
    signers.owner,
    signers.facilitator,
    config.rpcUrl!
  );
  if (authorityInfo.value) {
    const close = await ownerClient.subscriptions.instructions
      .closeSubscriptionAuthority({
        receiver: signers.facilitator.address,
        tokenMint: address(MAINNET_USDC_MINT),
        user: signers.owner,
      })
      .sendTransaction();
    await recordTransaction(
      config,
      evidence,
      rpc,
      "closeAuthority",
      close.context.signature
    );
  } else if (!evidence.transactions.closeAuthority) {
    throw new Error(
      "Authority is missing without a recorded close transaction."
    );
  }
  const authorityAfter = await rpc
    .getAccountInfo(address(evidence.addresses.subscriptionAuthority), {
      commitment: "finalized",
      encoding: "base64",
    })
    .send();
  if (authorityAfter.value) {
    throw new Error("Subscription Authority still exists after close.");
  }
  await ensureTokenDelegateCleared(
    config,
    evidence,
    rpc,
    ownerClient,
    signers.owner,
    address(evidence.addresses.ownerAta)
  );
  evidence.verification.authorityClosed = true;
  evidence.verification.tokenDelegateCleared = true;
  evidence.verification.finalSlot =
    evidence.transactions.clearTokenDelegate?.finalizedSlot ??
    evidence.transactions.closeAuthority!.finalizedSlot;
  evidence.status = "canary-passed";
  addCanaryEvent(
    evidence,
    "canary",
    "pass",
    "Recovered from the SDK trailing-account mismatch; all positive and negative invariants passed."
  );
  writeEvidence(config, evidence);
  return evidence;
}

function getSystemTransferInstruction(
  source: CanarySigner,
  destination: Address,
  lamports: bigint
): Instruction {
  if (lamports <= 0n) throw new Error("SOL sweep amount must be positive.");
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, lamports, true);
  return {
    programAddress: SYSTEM_PROGRAM,
    accounts: [
      {
        address: source.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: source,
      } as never,
      { address: destination, role: AccountRole.WRITABLE },
    ],
    data,
  };
}

async function sweepExactSolBalance(
  config: CanaryConfig,
  evidence: CanaryEvidence,
  rpc: MainnetRpc,
  source: CanarySigner,
  destination: Address,
  name: "sweepFacilitatorSol"
) {
  const balance = BigInt(
    (await rpc.getBalance(source.address, { commitment: "finalized" }).send())
      .value
  );
  if (balance === 0n) return;

  const latest = await rpc
    .getLatestBlockhash({ commitment: "finalized" })
    .send();
  const buildMessage = (lamports: bigint) =>
    pipe(
      createTransactionMessage({ version: 0 }),
      (message) => setTransactionMessageFeePayer(source.address, message),
      (message) =>
        appendTransactionMessageInstruction(
          getSystemTransferInstruction(source, destination, lamports),
          message
        ),
      (message) =>
        setTransactionMessageLifetimeUsingBlockhash(latest.value, message)
    );

  const feeMessage = compileTransactionMessage(buildMessage(1n));
  const feeBytes = getCompiledTransactionMessageEncoder().encode(feeMessage);
  const feeResponse = await rpc
    .getFeeForMessage(Buffer.from(feeBytes).toString("base64") as never, {
      commitment: "finalized",
    })
    .send();
  if (feeResponse.value === null) {
    throw new Error("RPC could not calculate the exact SOL sweep fee.");
  }
  const fee = BigInt(feeResponse.value);
  const transferAmount = calculateExactSolDrain(balance, fee);

  const signed = await signTransactionMessageWithSigners(
    buildMessage(transferAmount)
  );
  const signature = await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: "base64",
      maxRetries: 5n,
      preflightCommitment: "confirmed",
      skipPreflight: false,
    })
    .send();
  await recordTransaction(config, evidence, rpc, name, String(signature));
  const after = await rpc
    .getBalance(source.address, { commitment: "finalized" })
    .send();
  if (BigInt(after.value) !== 0n) {
    throw new Error("Facilitator SOL account was not drained exactly.");
  }
}

function calculateExactSolDrain(balance: bigint, fee: bigint) {
  if (balance <= fee) {
    throw new Error(
      "Facilitator balance is not enough for an exact SOL sweep."
    );
  }
  return balance - fee;
}

async function sweepCanary(config: CanaryConfig, signers: CanarySigners) {
  const evidence = readEvidence(config);
  if (evidence.status !== "canary-passed") {
    throw new Error("Sweep requires a verified canary-passed state.");
  }
  if (
    !evidence.verification?.delegationMatched ||
    !evidence.verification.paymentDeltaMatched ||
    !evidence.verification.delegationClosed ||
    !evidence.verification.authorityClosed ||
    !evidence.verification.tokenDelegateCleared
  ) {
    throw new Error("Sweep requires every terminal canary invariant to pass.");
  }
  if (!config.recoveryAddress) {
    throw new Error(
      "BUDGETRAIL_CANARY_RECOVERY_ADDRESS is required for sweep."
    );
  }
  const recovery = address(config.recoveryAddress);
  if (Object.values(signers).some((signer) => signer.address === recovery)) {
    throw new Error(
      "The recovery address must not be a disposable canary wallet."
    );
  }
  evidence.addresses.recovery = recovery;
  const rpc = createRpcClient(MAINNET_CAIP2, config.rpcUrl);
  assertNetworkFacts(await networkFacts(rpc));

  const before = await balances(rpc, signers);
  const [ownerToken, merchantToken] = await Promise.all([
    tokenBalance(rpc, signers.owner.address),
    tokenBalance(rpc, signers.merchant.address),
  ]);
  const ownerClient = createCanaryClient(
    signers.owner,
    signers.facilitator,
    config.rpcUrl!
  );
  const merchantClient = createCanaryClient(
    signers.merchant,
    signers.facilitator,
    config.rpcUrl!
  );

  if (BigInt(before.ownerUsdc) > 0n) {
    const result = await ownerClient.token.instructions
      .transferToATA({
        payer: signers.facilitator,
        mint: address(MAINNET_USDC_MINT),
        authority: signers.owner,
        recipient: recovery,
        amount: BigInt(before.ownerUsdc),
        decimals: USDC_DECIMALS,
      })
      .sendTransaction();
    await recordTransaction(
      config,
      evidence,
      rpc,
      "sweepOwnerUsdc",
      result.context.signature
    );
  }
  if (BigInt(before.merchantUsdc) > 0n) {
    const result = await merchantClient.token.instructions
      .transferToATA({
        payer: signers.facilitator,
        mint: address(MAINNET_USDC_MINT),
        authority: signers.merchant,
        recipient: recovery,
        amount: BigInt(before.merchantUsdc),
        decimals: USDC_DECIMALS,
      })
      .sendTransaction();
    await recordTransaction(
      config,
      evidence,
      rpc,
      "sweepMerchantUsdc",
      result.context.signature
    );
  }

  const ownerAtaInfo = await rpc
    .getAccountInfo(ownerToken.ata, {
      commitment: "finalized",
      encoding: "base64",
    })
    .send();
  if (ownerAtaInfo.value) {
    const closeOwnerAta = await ownerClient.token.instructions
      .closeAccount({
        account: ownerToken.ata,
        destination: recovery,
        owner: signers.owner,
      })
      .sendTransaction();
    await recordTransaction(
      config,
      evidence,
      rpc,
      "closeOwnerAta",
      closeOwnerAta.context.signature
    );
  } else if (!evidence.transactions.closeOwnerAta) {
    throw new Error("Owner USDC account is missing without closure evidence.");
  }

  const merchantAtaInfo = await rpc
    .getAccountInfo(merchantToken.ata, {
      commitment: "finalized",
      encoding: "base64",
    })
    .send();
  if (merchantAtaInfo.value) {
    const closeMerchantAta = await merchantClient.token.instructions
      .closeAccount({
        account: merchantToken.ata,
        destination: recovery,
        owner: signers.merchant,
      })
      .sendTransaction();
    await recordTransaction(
      config,
      evidence,
      rpc,
      "closeMerchantAta",
      closeMerchantAta.context.signature
    );
  } else if (!evidence.transactions.closeMerchantAta) {
    throw new Error(
      "Merchant USDC account is missing without closure evidence."
    );
  }
  evidence.verification.ownerAtaClosed = true;
  evidence.verification.merchantAtaClosed = true;
  writeEvidence(config, evidence);

  const ownerLamports = BigInt(
    (
      await rpc
        .getBalance(signers.owner.address, { commitment: "finalized" })
        .send()
    ).value
  );
  if (ownerLamports > 0n) {
    const result = await ownerClient.sendTransaction([
      getSystemTransferInstruction(signers.owner, recovery, ownerLamports),
    ]);
    await recordTransaction(
      config,
      evidence,
      rpc,
      "sweepOwnerSol",
      result.context.signature
    );
  }

  await sweepExactSolBalance(
    config,
    evidence,
    rpc,
    signers.facilitator,
    recovery,
    "sweepFacilitatorSol"
  );

  const after = await balances(rpc, signers);
  evidence.balances.afterSweep = after;
  if (
    BigInt(after.ownerUsdc) !== 0n ||
    BigInt(after.merchantUsdc) !== 0n ||
    BigInt(after.ownerSolLamports) !== 0n ||
    BigInt(after.agentSolLamports) !== 0n ||
    BigInt(after.facilitatorSolLamports) !== 0n ||
    BigInt(after.merchantSolLamports) !== 0n
  ) {
    throw new Error("Disposable canary balances remain after sweep.");
  }
  evidence.status = "swept";
  addCanaryEvent(
    evidence,
    "sweep",
    "pass",
    `USDC, token-account rent, and material SOL returned to ${recovery}; disposable token accounts were closed and the facilitator SOL account was drained exactly after its final network fee.`
  );
  writeEvidence(config, evidence);
  return evidence;
}

async function emergencyCleanup(
  config: CanaryConfig,
  signers: CanarySigners,
  evidence: CanaryEvidence
) {
  if (
    !evidence.addresses.delegation ||
    evidence.transactions.revoke ||
    !config.rpcUrl
  ) {
    return;
  }
  try {
    const rpc = createRpcClient(MAINNET_CAIP2, config.rpcUrl);
    const delegation = address(evidence.addresses.delegation);
    const account = await rpc
      .getAccountInfo(delegation, {
        commitment: "finalized",
        encoding: "base64",
      })
      .send();
    if (!account.value) return;
    const client = createCanaryClient(
      signers.owner,
      signers.facilitator,
      config.rpcUrl
    );
    const result = await client.subscriptions.instructions
      .revokeDelegation({
        delegationAccount: delegation,
        receiver: signers.facilitator.address,
      })
      .sendTransaction();
    await recordTransaction(
      config,
      evidence,
      rpc,
      "revoke",
      result.context.signature
    );
    addCanaryEvent(
      evidence,
      "emergency-cleanup",
      "pass",
      "Revoked the active delegation after the canary aborted."
    );
  } catch (cleanupError) {
    addCanaryEvent(
      evidence,
      "emergency-cleanup",
      "fail",
      safeDetail(cleanupError, config)
    );
  }
}

async function main() {
  const action = actionFromArgs();
  const config = parseCanaryConfig({
    action,
    env: process.env,
    repoRoot: resolve(import.meta.dirname, ".."),
    execute: process.argv.includes("--execute"),
  });
  activeConfig = config;

  if (action === "inspect") {
    const rpc = createRpcClient(MAINNET_CAIP2, config.rpcUrl);
    const facts = await networkFacts(rpc);
    assertNetworkFacts(facts);
    console.log(
      JSON.stringify(
        {
          status: "mainnet-readonly-inspection-passed",
          network: MAINNET_CAIP2,
          subscriptionsProgram: SUBSCRIPTIONS_PROGRAM,
          usdcMint: MAINNET_USDC_MINT,
          rpcProvider: config.rpcProvider,
          ...facts,
        },
        null,
        2
      )
    );
    return;
  }

  if (action === "keys") {
    const addresses = createKeys(config);
    const evidence = newCanaryEvidence(config, PHASE_6_COMMIT);
    evidence.addresses = addresses;
    addCanaryEvent(
      evidence,
      "keys",
      "pass",
      "Created four disposable keypairs outside Git with owner-only permissions."
    );
    writeEvidence(config, evidence);
    console.log(
      JSON.stringify(
        {
          status: "canary-keys-created",
          runId: config.runId,
          keyDirectory: config.keyDir,
          addresses,
          next: "Fund only after the private-RPC preflight tool has been reviewed and the Phase 7 commit is clean.",
        },
        null,
        2
      )
    );
    return;
  }

  if (action === "report") {
    const evidence = readEvidence(config);
    writeEvidence(config, evidence);
    console.log(
      JSON.stringify(
        {
          status: "canary-report-rendered",
          statePath: config.statePath,
          reportPath: resolve(config.evidenceDir, "report.md"),
          canaryStatus: evidence.status,
        },
        null,
        2
      )
    );
    return;
  }

  const signers = await loadSigners(config);
  if (action === "addresses") {
    const evidence = await recordAddresses(
      config,
      signers,
      existsSync(config.statePath) ? readEvidence(config) : undefined
    );
    console.log(
      JSON.stringify(
        {
          status: "canary-addresses-recorded",
          runId: config.runId,
          addresses: evidence.addresses,
          statePath: config.statePath,
        },
        null,
        2
      )
    );
    return;
  }
  if (action === "preflight") {
    const { evidence } = await performPreflight(config, signers);
    console.log(
      JSON.stringify(
        {
          status: evidence.status,
          checks: evidence.checks,
          balances: evidence.balances.before,
          statePath: config.statePath,
        },
        null,
        2
      )
    );
    return;
  }
  if (action === "verify") {
    const evidence = await verifyCanary(config, signers);
    console.log(
      JSON.stringify(
        {
          status: "canary-independently-verified",
          canaryStatus: evidence.status,
          verification: evidence.verification,
          reportPath: resolve(config.evidenceDir, "report.md"),
        },
        null,
        2
      )
    );
    return;
  }
  if (action === "contain") {
    const evidence = await containCanary(config, signers);
    console.log(
      JSON.stringify(
        {
          status: evidence.status,
          revoke: evidence.transactions.revoke,
          delegationClosed: evidence.verification?.delegationClosed,
          reportPath: resolve(config.evidenceDir, "report.md"),
        },
        null,
        2
      )
    );
    return;
  }
  if (action === "finalize") {
    const evidence = await finalizeContainedCanary(config, signers);
    console.log(
      JSON.stringify(
        {
          status: evidence.status,
          closeAuthority: evidence.transactions.closeAuthority,
          postRevoke: evidence.negativeTests.postRevoke,
          verification: evidence.verification,
          reportPath: resolve(config.evidenceDir, "report.md"),
        },
        null,
        2
      )
    );
    return;
  }
  if (action === "sweep") {
    const evidence = await sweepCanary(config, signers);
    console.log(
      JSON.stringify(
        {
          status: evidence.status,
          recoveryAddress: evidence.addresses.recovery,
          balances: evidence.balances.afterSweep,
          reportPath: resolve(config.evidenceDir, "report.md"),
        },
        null,
        2
      )
    );
    return;
  }
  if (action === "run") {
    let evidence: CanaryEvidence | undefined;
    try {
      evidence = await executeCanary(config, signers);
      console.log(
        JSON.stringify(
          {
            status: evidence.status,
            transactions: evidence.transactions,
            negativeTests: evidence.negativeTests,
            verification: evidence.verification,
            reportPath: resolve(config.evidenceDir, "report.md"),
            next: "Independently verify, then sweep to the confirmed recovery address.",
          },
          null,
          2
        )
      );
    } catch (error) {
      evidence = existsSync(config.statePath)
        ? readEvidence(config)
        : newCanaryEvidence(config, PHASE_6_COMMIT);
      evidence.status = "aborted";
      addCanaryEvent(evidence, "run", "fail", safeDetail(error, config));
      await emergencyCleanup(config, signers, evidence);
      writeEvidence(config, evidence);
      throw error;
    }
    return;
  }
}

let activeConfig: CanaryConfig | undefined;
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch((error) => {
    const message = activeConfig
      ? safeDetail(error, activeConfig)
      : redactSensitiveText(
          safeErrorMessage(error, "The mainnet canary command failed closed.")
        );
    console.error(
      JSON.stringify({ status: "mainnet-canary-failed", error: message })
    );
    process.exitCode = 1;
  });
}

export { calculateExactSolDrain, getSystemTransferInstruction };
