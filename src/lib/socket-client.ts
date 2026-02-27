"use client";

import { io, type Socket } from "socket.io-client";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/lib/socket-events";

let socketInstance: Socket<ServerToClientEvents, ClientToServerEvents> | null =
  null;

export function getSocketClient(): Socket<
  ServerToClientEvents,
  ClientToServerEvents
> {
  if (!socketInstance) {
    socketInstance = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
      autoConnect: false,
    });
  }

  return socketInstance;
}

export function disconnectSocketClient() {
  if (!socketInstance) {
    return;
  }

  socketInstance.disconnect();
}
