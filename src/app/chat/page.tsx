import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";
import { getOnlineUserIds } from "@/lib/socket";

import { ChatClient } from "./chat-client";

export default async function ChatPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const [rooms, users] = await Promise.all([
    prisma.room.findMany({
      where: {
        OR: [{ isPrivate: false }, { creatorId: currentUser.id }],
      },
      select: {
        id: true,
        name: true,
        isPrivate: true,
        createdAt: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: [{ isPrivate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.user.findMany({
      where: {
        NOT: { id: currentUser.id },
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
    }),
  ]);

  const onlineUserIdSet = new Set(getOnlineUserIds());

  return (
    <main className="bg-muted/40 h-dvh w-screen overflow-hidden">
      <ChatClient
        currentUser={{
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
        }}
        initialRooms={rooms.map((room: {
          id: string;
          name: string;
          isPrivate: boolean;
          createdAt: Date;
          _count: { messages: number };
        }) => ({
          id: room.id,
          name: room.name,
          isPrivate: room.isPrivate,
          createdAt: room.createdAt.toISOString(),
          messageCount: room._count.messages,
        }))}
        initialUsers={users.map((user: {
          id: string;
          name: string;
          email: string;
          createdAt: Date;
        }) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt.toISOString(),
          online: onlineUserIdSet.has(user.id),
        }))}
      />
    </main>
  );
}
