import { errorResponse, successResponse } from "@/lib/api-response";
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_OPTIONS,
  signAuthToken,
} from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { mapPrismaError } from "@/lib/prisma-error";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/sanitize";
import { registerSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rateLimitResponse = enforceRateLimit(req, "auth:register", {
    max: 10,
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

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Validation failed.", 422, parsed.error.flatten());
  }

  const email = normalizeEmail(parsed.data.email);

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      return errorResponse("Email is already in use.", 409);
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name.trim(),
        email,
        password: passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    const token = await signAuthToken({
      sub: user.id,
      name: user.name,
      email: user.email,
    });

    const response = successResponse({ user }, 201);
    response.cookies.set(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
    return response;
  } catch (error: unknown) {
    const prismaError = mapPrismaError(error);
    if (prismaError) {
      return errorResponse(prismaError.message, prismaError.status);
    }

    console.error("Register route failed:", error);
    return errorResponse("Failed to register user.", 500);
  }
}
