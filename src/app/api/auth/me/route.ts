import { errorResponse, successResponse } from "@/lib/api-response";
import { getAuthPayloadFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const authPayload = await getAuthPayloadFromRequest(req);
  if (!authPayload) {
    return errorResponse("Unauthorized.", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: authPayload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    return errorResponse("User not found.", 404);
  }

  return successResponse({ user });
}
