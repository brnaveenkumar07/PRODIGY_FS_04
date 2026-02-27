import type { Server as HttpServer } from "node:http";

import { Server as SocketIOServer, type Socket } from "socket.io";

import {
  extractAuthTokenFromCookieHeader,
  type AuthPayload,
  verifyAuthToken,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  type BasicAck,
  type ChatMessage,
  type ClientToServerEvents,
  type JoinRoomPayload,
  type LeaveRoomPayload,
  type MessageAck,
  type PrivateMessagePayload,
  type SendRoomMessagePayload,
  type ServerToClientEvents,
  type TypingPayload,
} from "@/lib/socket-events";
import { sanitizeMessageContent } from "@/lib/sanitize";
import { privateMessageSchema, sendRoomMessageSchema } from "@/lib/validators";

type SocketData = {
  user: AuthPayload;
};

type ChatSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type ChatSocketServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type GlobalSocketState = typeof globalThis & {
  __chatIo?: ChatSocketServer;
  __chatOnlineUsers?: Map<string, Set<string>>;
};

const globalSocketState = globalThis as GlobalSocketState;
const onlineUsers = globalSocketState.__chatOnlineUsers ?? new Map<string, Set<string>>();

if (!globalSocketState.__chatOnlineUsers) {
  globalSocketState.__chatOnlineUsers = onlineUsers;
}

function addOnlineUser(userId: string, socketId: string) {
  const existing = onlineUsers.get(userId);
  if (!existing) {
    onlineUsers.set(userId, new Set([socketId]));
    return;
  }
  existing.add(socketId);
}

function removeOnlineUser(userId: string, socketId: string): boolean {
  const existing = onlineUsers.get(userId);
  if (!existing) {
    return false;
  }

  existing.delete(socketId);
  if (existing.size === 0) {
    onlineUsers.delete(userId);
    return true;
  }

  return false;
}

export function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers.keys());
}

function mapMessage(message: {
  id: string;
  content: string;
  fileUrl: string | null;
  senderId: string;
  roomId: string | null;
  receiverId: string | null;
  createdAt: Date;
  sender: { name: string };
}): ChatMessage {
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

function emitPresence(
  io: ChatSocketServer,
  event: "user_online" | "user_offline",
  userId: string
) {
  io.emit(event, {
    userId,
    onlineUserIds: getOnlineUserIds(),
  });
}

async function createRoomMessage(
  user: AuthPayload,
  payload: SendRoomMessagePayload
): Promise<ChatMessage> {
  const parsed = sendRoomMessageSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid room message payload.");
  }

  const room = await prisma.room.findUnique({
    where: { id: parsed.data.roomId },
    select: { id: true },
  });

  if (!room) {
    throw new Error("Room not found.");
  }

  const sanitizedContent = sanitizeMessageContent(parsed.data.content ?? "");
  const message = await prisma.message.create({
    data: {
      roomId: room.id,
      senderId: user.sub,
      content: sanitizedContent || (parsed.data.fileUrl ? "Shared a file" : ""),
      fileUrl: parsed.data.fileUrl ?? null,
    },
    include: {
      sender: {
        select: { name: true },
      },
    },
  });

  return mapMessage(message);
}

async function createPrivateMessage(
  user: AuthPayload,
  payload: PrivateMessagePayload
): Promise<ChatMessage> {
  const parsed = privateMessageSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid private message payload."
    );
  }

  const recipient = await prisma.user.findUnique({
    where: { id: parsed.data.receiverId },
    select: { id: true },
  });

  if (!recipient) {
    throw new Error("Recipient not found.");
  }

  const sanitizedContent = sanitizeMessageContent(parsed.data.content ?? "");
  const message = await prisma.message.create({
    data: {
      senderId: user.sub,
      receiverId: recipient.id,
      content: sanitizedContent || (parsed.data.fileUrl ? "Shared a file" : ""),
      fileUrl: parsed.data.fileUrl ?? null,
    },
    include: {
      sender: {
        select: { name: true },
      },
    },
  });

  return mapMessage(message);
}

export function initSocketServer(httpServer: HttpServer): ChatSocketServer {
  if (globalSocketState.__chatIo) {
    return globalSocketState.__chatIo;
  }

  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    path: "/socket.io",
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL ?? true,
      credentials: true,
    },
  });

  io.use(async (socket: ChatSocket, next: (error?: Error) => void) => {
    const authToken =
      typeof socket.handshake.auth.token === "string"
        ? socket.handshake.auth.token
        : null;
    const cookieToken = extractAuthTokenFromCookieHeader(
      socket.handshake.headers.cookie
    );
    const token = authToken ?? cookieToken;

    if (!token) {
      return next(new Error("Unauthorized."));
    }

    const authPayload = await verifyAuthToken(token);
    if (!authPayload) {
      return next(new Error("Unauthorized."));
    }

    socket.data.user = authPayload;
    return next();
  });

  io.on("connection", (socket: ChatSocket) => {
    const user = socket.data.user;
    addOnlineUser(user.sub, socket.id);
    socket.join(`user:${user.sub}`);
    emitPresence(io, "user_online", user.sub);

    socket.on("join_room", async (payload: JoinRoomPayload, ack?: BasicAck) => {
      socket.join(`room:${payload.roomId}`);
      ack?.({ ok: true });
    });

    socket.on(
      "leave_room",
      async (payload: LeaveRoomPayload, ack?: BasicAck) => {
      socket.leave(`room:${payload.roomId}`);
      ack?.({ ok: true });
      }
    );

    socket.on("typing", (payload: TypingPayload) => {
      if (payload.roomId) {
        socket.to(`room:${payload.roomId}`).emit("typing", {
          roomId: payload.roomId,
          userId: user.sub,
          userName: user.name,
          isTyping: payload.isTyping,
        });
      }

      if (payload.receiverId) {
        socket.to(`user:${payload.receiverId}`).emit("typing", {
          receiverId: payload.receiverId,
          userId: user.sub,
          userName: user.name,
          isTyping: payload.isTyping,
        });
      }
    });

    socket.on(
      "send_message",
      async (payload: SendRoomMessagePayload, ack?: MessageAck) => {
      try {
        const message = await createRoomMessage(user, payload);
        if (!message.roomId) {
          ack?.({ ok: false, error: "Invalid room message." });
          return;
        }
        io.to(`room:${message.roomId}`).emit("new_message", message);
        ack?.({ ok: true, data: message });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to send message.";
        ack?.({ ok: false, error: message });
      }
      }
    );

    socket.on(
      "private_message",
      async (payload: PrivateMessagePayload, ack?: MessageAck) => {
      try {
        const message = await createPrivateMessage(user, payload);
        if (!message.receiverId) {
          ack?.({ ok: false, error: "Invalid private message." });
          return;
        }
        io.to(`user:${message.senderId}`).emit("new_message", message);
        io.to(`user:${message.receiverId}`).emit("new_message", message);
        ack?.({ ok: true, data: message });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to send message.";
        ack?.({ ok: false, error: message });
      }
      }
    );

    socket.on("disconnect", () => {
      const becameOffline = removeOnlineUser(user.sub, socket.id);
      if (becameOffline) {
        emitPresence(io, "user_offline", user.sub);
      }
    });
  });

  globalSocketState.__chatIo = io;
  return io;
}
