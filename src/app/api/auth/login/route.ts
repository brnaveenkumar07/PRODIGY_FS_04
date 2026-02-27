import { errorResponse, successResponse } from "@/lib/api-response";
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_OPTIONS,
  signAuthToken,
} from "@/lib/auth";
import { comparePassword } from "@/lib/password";
import { mapPrismaError } from "@/lib/prisma-error";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/sanitize";
import { loginSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rateLimitResponse = enforceRateLimit(req, "auth:login", {
    max: 15,
    windowMs: 60_000,
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body.");
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Validation failed.", 422, parsed.error.flatten());
  }

  const email = normalizeEmail(parsed.data.email);
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        createdAt: true,
      },
    });

    if (!user) {
      return errorResponse("Invalid email or password.", 401);
    }

    const passwordMatches = await comparePassword(parsed.data.password, user.password);
    if (!passwordMatches) {
      return errorResponse("Invalid email or password.", 401);
    }

    const token = await signAuthToken({
      sub: user.id,
      name: user.name,
      email: user.email,
    });

    const response = successResponse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
    response.cookies.set(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
    return response;
  } catch (error: unknown) {
    const prismaError = mapPrismaError(error);
    if (prismaError) {
      return errorResponse(prismaError.message, prismaError.status);
    }

    console.error("Login route failed:", error);
    return errorResponse("Failed to login.", 500);
  }
}
