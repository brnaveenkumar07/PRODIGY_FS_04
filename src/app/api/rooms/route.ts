import { errorResponse, successResponse } from "@/lib/api-response";
import { getAuthPayloadFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createRoomSchema } from "@/lib/validators";

export async function GET(req: Request) {
  const rateLimitResponse = enforceRateLimit(req, "rooms:list", {
    max: 120,
    windowMs: 60_000,
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const authPayload = await getAuthPayloadFromRequest(req);
  if (!authPayload) {
    return errorResponse("Unauthorized.", 401);
  }

  const rooms = await prisma.room.findMany({
    where: {
      OR: [{ isPrivate: false }, { creatorId: authPayload.sub }],
    },
    select: {
      id: true,
      name: true,
      isPrivate: true,
      createdAt: true,
      _count: {
        select: { messages: true },
      },
    },
    orderBy: [{ isPrivate: "asc" }, { createdAt: "asc" }],
  });

  return successResponse({ rooms });
}

export async function POST(req: Request) {
  const rateLimitResponse = enforceRateLimit(req, "rooms:create", {
    max: 30,
    windowMs: 60_000,
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const authPayload = await getAuthPayloadFromRequest(req);
  if (!authPayload) {
    return errorResponse("Unauthorized.", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body.");
  }

  const parsed = createRoomSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Validation failed.", 422, parsed.error.flatten());
  }

  const room = await prisma.room.create({
    data: {
      name: parsed.data.name.trim(),
      isPrivate: parsed.data.isPrivate,
      creatorId: authPayload.sub,
    },
    select: {
      id: true,
      name: true,
      isPrivate: true,
      createdAt: true,
    },
  });

  return successResponse({ room }, 201);
}
