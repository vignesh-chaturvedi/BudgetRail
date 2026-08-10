export type AllowanceErrorCode =
  | "wallet-rejected"
  | "insufficient-sol"
  | "insufficient-usdc"
  | "rpc-timeout"
  | "already-revoked"
  | "wrong-cluster"
  | "unknown";

export type AllowanceError = {
  code: AllowanceErrorCode;
  title: string;
  message: string;
  retryable: boolean;
};

export class AllowanceActionError extends Error {
  constructor(
    public readonly code: Extract<
      AllowanceErrorCode,
      "insufficient-usdc" | "wrong-cluster"
    >,
    message: string
  ) {
    super(message);
    this.name = "AllowanceActionError";
  }
}

export function classifyAllowanceError(error: unknown): AllowanceError {
  if (error instanceof AllowanceActionError) {
    if (error.code === "insufficient-usdc") {
      return {
        code: error.code,
        title: "Not enough devnet USDC",
        message: error.message,
        retryable: true,
      };
    }
    return {
      code: error.code,
      title: "Switch to devnet",
      message: error.message,
      retryable: false,
    };
  }

  const message = deepestMessage(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("user rejected") ||
    lower.includes("rejected the request") ||
    lower.includes("declined") ||
    lower.includes("wallet window was closed")
  ) {
    return {
      code: "wallet-rejected",
      title: "Signature cancelled",
      message: "Nothing was submitted. Review the allowance and try again.",
      retryable: true,
    };
  }

  if (
    lower.includes("insufficient funds") ||
    lower.includes("insufficient lamports") ||
    lower.includes("insufficientfundsforrent") ||
    lower.includes("insufficient funds for rent")
  ) {
    return {
      code: "insufficient-sol",
      title: "Not enough devnet SOL",
      message:
        "Add devnet SOL for transaction fees and account rent, then retry.",
      retryable: true,
    };
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("fetch failed")
  ) {
    return {
      code: "rpc-timeout",
      title: "Solana RPC is delayed",
      message:
        "The transaction may still confirm. Refresh the allowance state before retrying.",
      retryable: true,
    };
  }

  if (
    lower.includes("accountnotfound") ||
    lower.includes("account not found") ||
    lower.includes("invalid account data") ||
    lower.includes("already revoked")
  ) {
    return {
      code: "already-revoked",
      title: "Allowance is already revoked",
      message: "The delegation account no longer exists on this cluster.",
      retryable: false,
    };
  }

  if (
    lower.includes("unsupported cluster") ||
    lower.includes("wrong cluster")
  ) {
    return {
      code: "wrong-cluster",
      title: "Switch to devnet",
      message:
        "BudgetRail Phase 2 only creates allowances on devnet or localnet.",
      retryable: false,
    };
  }

  return {
    code: "unknown",
    title: "Allowance transaction failed",
    message: message.length > 220 ? `${message.slice(0, 220)}…` : message,
    retryable: true,
  };
}

function deepestMessage(error: unknown): string {
  let message = redactSensitiveText(
    error instanceof Error ? error.message : String(error)
  );
  let current = error;
  while (current instanceof Error && current.cause) {
    current = current.cause;
    if (current instanceof Error)
      message = redactSensitiveText(current.message);
  }
  return message || "Unknown transaction error.";
}
import { redactSensitiveText } from "../../../packages/security/src";
