import { errorResponse, successResponse } from "@/lib/api-response";
import { getAuthPayloadFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getOnlineUserIds } from "@/lib/socket";

export async function GET(req: Request) {
  const rateLimitResponse = enforceRateLimit(req, "users:list", {
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

  const onlineUserIds = new Set(getOnlineUserIds());

  const users = await prisma.user.findMany({
    where: {
      NOT: { id: authPayload.sub },
    },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return successResponse({
    users: users.map((user: { id: string; name: string; email: string; createdAt: Date }) => ({
      ...user,
      online: onlineUserIds.has(user.id),
    })),
  });
}
