import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

import { getEnv } from "@/lib/env";

export const AUTH_COOKIE_NAME = "chat_token";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
};

const authPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(80),
});

export type AuthPayload = z.infer<typeof authPayloadSchema>;

function getSecretKey() {
  return new TextEncoder().encode(getEnv().JWT_SECRET);
}

export async function signAuthToken(payload: AuthPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function verifyAuthToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const parsed = authPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function extractAuthTokenFromCookieHeader(
  cookieHeader: string | null | undefined
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookiePairs = cookieHeader.split(";");
  for (const cookiePair of cookiePairs) {
    const [rawName, ...rawValueParts] = cookiePair.trim().split("=");
    if (!rawName || rawValueParts.length === 0) {
      continue;
    }

    if (rawName !== AUTH_COOKIE_NAME) {
      continue;
    }

    const rawValue = rawValueParts.join("=");
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

export async function getAuthPayloadFromRequest(
  req: Request
): Promise<AuthPayload | null> {
  const token = extractAuthTokenFromCookieHeader(req.headers.get("cookie"));
  if (!token) {
    return null;
  }

  return verifyAuthToken(token);
}
