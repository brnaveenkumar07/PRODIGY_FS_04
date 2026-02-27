import { NextResponse } from "next/server";

type RateLimitOptions = {
  max: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type GlobalRateLimitState = typeof globalThis & {
  __chatRateLimitStore?: Map<string, RateLimitEntry>;
};

const globalRateLimitState = globalThis as GlobalRateLimitState;
const store = globalRateLimitState.__chatRateLimitStore ?? new Map();

if (!globalRateLimitState.__chatRateLimitStore) {
  globalRateLimitState.__chatRateLimitStore = store;
}

function cleanupExpiredEntries(now: number) {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

function resolveClientIp(req: Request): string {
  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return req.headers.get("x-real-ip") ?? "unknown";
}

function evaluateRateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now();
  cleanupExpiredEntries(now);

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    const nextEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + options.windowMs,
    };
    store.set(key, nextEntry);

    return {
      ok: true,
      remaining: Math.max(0, options.max - 1),
      resetAt: nextEntry.resetAt,
    };
  }

  existing.count += 1;
  store.set(key, existing);

  return {
    ok: existing.count <= options.max,
    remaining: Math.max(0, options.max - existing.count),
    resetAt: existing.resetAt,
  };
}

export function enforceRateLimit(
  req: Request,
  scope: string,
  options: RateLimitOptions
): NextResponse | null {
  const ip = resolveClientIp(req);
  const key = `${scope}:${ip}`;
  const decision = evaluateRateLimit(key, options);
  if (decision.ok) {
    return null;
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((decision.resetAt - Date.now()) / 1000)
  );

  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(options.max),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(decision.resetAt),
      },
    }
  );
}
