type PrismaErrorResponse = {
  status: number;
  message: string;
};

export function mapPrismaError(error: unknown): PrismaErrorResponse | null {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : undefined;

  if (code === "P2002") {
    return {
      status: 409,
      message: "Email is already in use.",
    };
  }

  if (code === "P1000") {
    return {
      status: 503,
      message:
        "Database authentication failed. Update DATABASE_URL/DIRECT_URL in .env.",
    };
  }

  if (code === "P1001") {
    return {
      status: 503,
      message:
        "Database is unreachable. Verify Neon endpoint, network, and firewall.",
    };
  }

  if (error instanceof Error) {
    if (error.message.includes("P1000")) {
      return {
        status: 503,
        message:
          "Database authentication failed. Update DATABASE_URL/DIRECT_URL in .env.",
      };
    }

    if (error.message.includes("P1001")) {
      return {
        status: 503,
        message:
          "Database is unreachable. Verify Neon endpoint, network, and firewall.",
      };
    }
  }

  return null;
}
