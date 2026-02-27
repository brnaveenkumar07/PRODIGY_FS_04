import type { Prisma } from "@prisma/client";

import { errorResponse, successResponse } from "@/lib/api-response";
import { getAuthPayloadFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sanitizeMessageContent } from "@/lib/sanitize";
import {
  messageHistoryQuerySchema,
  privateMessageSchema,
  sendRoomMessageSchema,
} from "@/lib/validators";

function mapMessage(message: {
  id: string;
  content: string;
  fileUrl: string | null;
  senderId: string;
  roomId: string | null;
  receiverId: string | null;
  createdAt: Date;
  sender: { id: string; name: string };
}) {
  return {
    id: message.id,
    content: message.content,
    fileUrl: message.fileUrl,
    senderId: message.senderId,
    senderName: message.sender.name,
    roomId: message.roomId,
    receiverId: message.receiverId,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const rateLimitResponse = enforceRateLimit(req, "messages:list", {
    max: 240,
    windowMs: 60_000,
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const authPayload = await getAuthPayloadFromRequest(req);
  if (!authPayload) {
    return errorResponse("Unauthorized.", 401);
  }

  const url = new URL(req.url);
  const parsed = messageHistoryQuerySchema.safeParse({
    roomId: url.searchParams.get("roomId") ?? undefined,
    receiverId: url.searchParams.get("receiverId") ?? undefined,
    before: url.searchParams.get("before") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse("Validation failed.", 422, parsed.error.flatten());
  }

  const beforeDate = parsed.data.before ? new Date(parsed.data.before) : undefined;
  const where: Prisma.MessageWhereInput = {};

  if (parsed.data.roomId) {
    const room = await prisma.room.findUnique({
      where: { id: parsed.data.roomId },
      select: { id: true, isPrivate: true, creatorId: true },
    });

    if (!room) {
      return errorResponse("Room not found.", 404);
    }

    if (room.isPrivate && room.creatorId !== authPayload.sub) {
      return errorResponse("Forbidden.", 403);
    }

    where.roomId = room.id;
  }

  if (parsed.data.receiverId) {
    where.OR = [
      {
        senderId: authPayload.sub,
        receiverId: parsed.data.receiverId,
      },
      {
        senderId: parsed.data.receiverId,
        receiverId: authPayload.sub,
      },
    ];
  }

  if (beforeDate) {
    where.createdAt = { lt: beforeDate };
  }

  const rows = await prisma.message.findMany({
    where,
    include: {
      sender: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: parsed.data.limit + 1,
  });

  const hasMore = rows.length > parsed.data.limit;
  const slicedRows = hasMore ? rows.slice(0, parsed.data.limit) : rows;
  const nextBefore = hasMore
    ? slicedRows[slicedRows.length - 1]?.createdAt.toISOString() ?? null
    : null;

  return successResponse({
    messages: slicedRows.reverse().map(mapMessage),
    nextBefore,
  });
}

export async function POST(req: Request) {
  const rateLimitResponse = enforceRateLimit(req, "messages:create", {
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse("Invalid JSON body.");
  }

  const isRoomMessage = typeof body.roomId === "string";

  if (isRoomMessage) {
    const parsed = sendRoomMessageSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Validation failed.", 422, parsed.error.flatten());
    }

    const room = await prisma.room.findUnique({
      where: { id: parsed.data.roomId },
      select: { id: true, isPrivate: true, creatorId: true },
    });
    if (!room) {
      return errorResponse("Room not found.", 404);
    }
    if (room.isPrivate && room.creatorId !== authPayload.sub) {
      return errorResponse("Forbidden.", 403);
    }

    const content = sanitizeMessageContent(parsed.data.content ?? "");
    const message = await prisma.message.create({
      data: {
        senderId: authPayload.sub,
        roomId: room.id,
        content: content || (parsed.data.fileUrl ? "Shared a file" : ""),
        fileUrl: parsed.data.fileUrl ?? null,
      },
      include: {
        sender: {
          select: { id: true, name: true },
        },
      },
    });

    return successResponse({ message: mapMessage(message) }, 201);
  }

  const parsed = privateMessageSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Validation failed.", 422, parsed.error.flatten());
  }

  const recipient = await prisma.user.findUnique({
    where: { id: parsed.data.receiverId },
    select: { id: true },
  });
  if (!recipient) {
    return errorResponse("Recipient not found.", 404);
  }

  const content = sanitizeMessageContent(parsed.data.content ?? "");
  const message = await prisma.message.create({
    data: {
      senderId: authPayload.sub,
      receiverId: recipient.id,
      content: content || (parsed.data.fileUrl ? "Shared a file" : ""),
      fileUrl: parsed.data.fileUrl ?? null,
    },
    include: {
      sender: {
        select: { id: true, name: true },
      },
    },
  });

  return successResponse({ message: mapMessage(message) }, 201);
}
