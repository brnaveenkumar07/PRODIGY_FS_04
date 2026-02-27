"use client";

import { format } from "date-fns";
import {
  EmojiStyle,
  type EmojiClickData,
  SkinTonePickerLocation,
  SuggestionMode,
  Theme,
} from "emoji-picker-react";
import {
  FileIcon,
  Loader2Icon,
  LogOutIcon,
  PaperclipIcon,
  PlusIcon,
  SendIcon,
  SmileIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { Avatar, AvatarBadge, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getSocketClient, disconnectSocketClient } from "@/lib/socket-client";
import type {
  AckResponse,
  ChatMessage,
  PresenceEvent,
  TypingEvent,
} from "@/lib/socket-events";

type RoomSidebarItem = {
  id: string;
  name: string;
  isPrivate: boolean;
  createdAt: string;
  messageCount: number;
};

type UserSidebarItem = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  online: boolean;
};

type CurrentUser = {
  id: string;
  name: string;
  email: string;
};

type ChatClientProps = {
  currentUser: CurrentUser;
  initialRooms: RoomSidebarItem[];
  initialUsers: UserSidebarItem[];
};

type MessageResponse = {
  messages: ChatMessage[];
  nextBefore: string | null;
};

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
});

const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;
const ATTACHMENT_ACCEPT_VALUE =
  "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.json,.zip,.rar,.7z";
const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "jpg",
  "jpeg",
  "png",
  "webp",
]);
const VIDEO_EXTENSIONS = new Set(["avi", "mkv", "mov", "mp4", "webm"]);
const AUDIO_EXTENSIONS = new Set(["m4a", "mp3", "ogg", "wav"]);

type AttachmentKind = "audio" | "file" | "image" | "video";

function getFileExtension(fileUrl: string): string | null {
  const cleanUrl = fileUrl.split("#")[0]?.split("?")[0] ?? fileUrl;
  const fileName = cleanUrl.split("/").pop() ?? "";
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex <= 0 || lastDotIndex === fileName.length - 1) {
    return null;
  }
  const extension = fileName.slice(lastDotIndex + 1).toLowerCase();
  return extension && /^[a-z0-9]{1,10}$/.test(extension) ? extension : null;
}

function getAttachmentKind(fileUrl: string): AttachmentKind {
  const extension = getFileExtension(fileUrl);
  if (!extension) {
    return "file";
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }
  return "file";
}

function getAttachmentLabel(fileUrl: string): string {
  const extension = getFileExtension(fileUrl);
  return extension ? `${extension.toUpperCase()} file` : "Attachment";
}

function roomUnreadKey(roomId: string) {
  return `room:${roomId}`;
}

function dmUnreadKey(userId: string) {
  return `dm:${userId}`;
}

export function ChatClient({
  currentUser,
  initialRooms,
  initialUsers,
}: ChatClientProps) {
  const router = useRouter();

  const [rooms, setRooms] = useState<RoomSidebarItem[]>(initialRooms);
  const [users, setUsers] = useState<UserSidebarItem[]>(initialUsers);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(
    initialRooms[0]?.id ?? null
  );
  const [activeDmUserId, setActiveDmUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [unreadByTarget, setUnreadByTarget] = useState<Record<string, number>>(
    {}
  );
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomPrivate, setNewRoomPrivate] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRoomIdRef = useRef<string | null>(activeRoomId);
  const activeDmUserIdRef = useRef<string | null>(activeDmUserId);

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
    activeDmUserIdRef.current = activeDmUserId;
  }, [activeRoomId, activeDmUserId]);

  const activeDmUser = useMemo(
    () => users.find((user) => user.id === activeDmUserId) ?? null,
    [activeDmUserId, users]
  );

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) ?? null,
    [activeRoomId, rooms]
  );

  const activeTargetLabel = useMemo(() => {
    if (activeRoom) {
      return activeRoom.name;
    }
    if (activeDmUser) {
      return `${activeDmUser.name} (Direct Message)`;
    }
    return "Select a room or user";
  }, [activeRoom, activeDmUser]);

  const typingDisplay = useMemo(() => {
    const names = Object.values(typingUsers);
    if (names.length === 0) {
      return null;
    }
    if (names.length === 1) {
      return `${names[0]} is typing...`;
    }
    return `${names.join(", ")} are typing...`;
  }, [typingUsers]);

  const getScrollViewport = useCallback(() => {
    const root = document.getElementById("chat-message-scroll");
    return root?.querySelector<HTMLDivElement>(
      "[data-slot='scroll-area-viewport']"
    ) ?? null;
  }, []);

  const scrollToBottom = useCallback(() => {
    const viewport = getScrollViewport();
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [getScrollViewport]);

  const loadMessages = useCallback(
    async (loadMore: boolean) => {
      if (!activeRoomIdRef.current && !activeDmUserIdRef.current) {
        setMessages([]);
        setNextBefore(null);
        return;
      }

      if (loadMore && !nextBefore) {
        return;
      }

      if (loadMore) {
        setLoadingMoreMessages(true);
      } else {
        setLoadingMessages(true);
      }

      const viewport = getScrollViewport();
      const previousHeight = viewport?.scrollHeight ?? 0;
      const previousScrollTop = viewport?.scrollTop ?? 0;

      const params = new URLSearchParams();
      if (activeRoomIdRef.current) {
        params.set("roomId", activeRoomIdRef.current);
      }
      if (activeDmUserIdRef.current) {
        params.set("receiverId", activeDmUserIdRef.current);
      }
      params.set("limit", "20");
      if (loadMore && nextBefore) {
        params.set("before", nextBefore);
      }

      try {
        const response = await fetch(`/api/messages?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as MessageResponse & {
          error?: string;
        };

        if (!response.ok) {
          toast.error(payload.error ?? "Failed to load messages.");
          return;
        }

        if (loadMore) {
          setMessages((current) => {
            const dedupedOlder = payload.messages.filter(
              (incomingMessage) =>
                !current.some(
                  (existingMessage) => existingMessage.id === incomingMessage.id
                )
            );
            return [...dedupedOlder, ...current];
          });
          setNextBefore(payload.nextBefore);
          requestAnimationFrame(() => {
            const currentViewport = getScrollViewport();
            if (!currentViewport) {
              return;
            }
            const nextHeight = currentViewport.scrollHeight;
            currentViewport.scrollTop =
              nextHeight - previousHeight + previousScrollTop;
          });
        } else {
          setMessages(payload.messages);
          setNextBefore(payload.nextBefore);
          requestAnimationFrame(() => {
            scrollToBottom();
          });
        }
      } catch {
        toast.error("Unexpected error while loading messages.");
      } finally {
        if (loadMore) {
          setLoadingMoreMessages(false);
        } else {
          setLoadingMessages(false);
        }
      }
    },
    [getScrollViewport, nextBefore, scrollToBottom]
  );

  function clearActiveUnread() {
    const roomId = activeRoomIdRef.current;
    if (roomId) {
      setUnreadByTarget((current) => ({
        ...current,
        [roomUnreadKey(roomId)]: 0,
      }));
    }

    const dmUserId = activeDmUserIdRef.current;
    if (dmUserId) {
      setUnreadByTarget((current) => ({
        ...current,
        [dmUnreadKey(dmUserId)]: 0,
      }));
    }
  }

  function applyPresence(payload: PresenceEvent) {
    const onlineIdSet = new Set(payload.onlineUserIds);
    setUsers((current) =>
      current.map((user) => ({
        ...user,
        online: onlineIdSet.has(user.id),
      }))
    );
  }

  const isMessageForActiveConversation = useCallback(
    (message: ChatMessage): boolean => {
      if (activeRoomIdRef.current) {
        return message.roomId === activeRoomIdRef.current;
      }

      if (activeDmUserIdRef.current) {
        const directId = activeDmUserIdRef.current;
        const isIncoming =
          message.senderId === directId && message.receiverId === currentUser.id;
        const isOutgoing =
          message.senderId === currentUser.id && message.receiverId === directId;
        return isIncoming || isOutgoing;
      }

      return false;
    },
    [currentUser.id]
  );

  const trackUnreadMessage = useCallback(
    (message: ChatMessage) => {
      if (message.roomId) {
        const key = roomUnreadKey(message.roomId);
        setUnreadByTarget((current) => ({
          ...current,
          [key]: (current[key] ?? 0) + 1,
        }));
        return;
      }

      const dmPeerId =
        message.senderId === currentUser.id ? message.receiverId : message.senderId;
      if (!dmPeerId) {
        return;
      }
      const key = dmUnreadKey(dmPeerId);
      setUnreadByTarget((current) => ({
        ...current,
        [key]: (current[key] ?? 0) + 1,
      }));
    },
    [currentUser.id]
  );

  useEffect(() => {
    const socket = getSocketClient();
    socket.connect();

    const handleNewMessage = (message: ChatMessage) => {
      if (isMessageForActiveConversation(message)) {
        setMessages((current) => {
          if (current.some((existingMessage) => existingMessage.id === message.id)) {
            return current;
          }
          return [...current, message];
        });
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      } else if (message.senderId !== currentUser.id) {
        trackUnreadMessage(message);
      }

      if (message.senderId !== currentUser.id) {
        toast.message(`New message from ${message.senderName}`, {
          description: message.content || "Shared an attachment.",
        });
      }
    };

    const handleTyping = (payload: TypingEvent) => {
      const roomMatch =
        payload.roomId && payload.roomId === activeRoomIdRef.current;
      const dmMatch =
        payload.receiverId &&
        payload.receiverId === currentUser.id &&
        payload.userId === activeDmUserIdRef.current;

      if (!roomMatch && !dmMatch) {
        return;
      }

      setTypingUsers((current) => {
        const next = { ...current };
        if (payload.isTyping) {
          next[payload.userId] = payload.userName;
        } else {
          delete next[payload.userId];
        }
        return next;
      });
    };

    const handleUserOnline = (payload: PresenceEvent) => {
      applyPresence(payload);
    };

    const handleUserOffline = (payload: PresenceEvent) => {
      applyPresence(payload);
    };

    socket.on("new_message", handleNewMessage);
    socket.on("typing", handleTyping);
    socket.on("user_online", handleUserOnline);
    socket.on("user_offline", handleUserOffline);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("typing", handleTyping);
      socket.off("user_online", handleUserOnline);
      socket.off("user_offline", handleUserOffline);
      disconnectSocketClient();
    };
  }, [
    currentUser.id,
    isMessageForActiveConversation,
    scrollToBottom,
    trackUnreadMessage,
  ]);

  useEffect(() => {
    setTypingUsers({});
    clearActiveUnread();
    void loadMessages(false);
  }, [activeDmUserId, activeRoomId, loadMessages]);

  useEffect(() => {
    const socket = getSocketClient();
    if (!socket.connected || !activeRoomId) {
      return;
    }

    socket.emit("join_room", { roomId: activeRoomId });
    return () => {
      socket.emit("leave_room", { roomId: activeRoomId });
    };
  }, [activeRoomId]);

  useEffect(() => {
    const viewport = getScrollViewport();
    if (!viewport) {
      return;
    }

    const onScroll = () => {
      if (
        viewport.scrollTop < 120 &&
        nextBefore &&
        !loadingMessages &&
        !loadingMoreMessages
      ) {
        void loadMessages(true);
      }
    };

    viewport.addEventListener("scroll", onScroll);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
    };
  }, [getScrollViewport, loadMessages, loadingMessages, loadingMoreMessages, nextBefore]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  function emitTypingState(isTyping: boolean) {
    const socket = getSocketClient();
    if (!socket.connected) {
      return;
    }

    if (activeRoomIdRef.current) {
      socket.emit("typing", {
        roomId: activeRoomIdRef.current,
        isTyping,
      });
      return;
    }

    if (activeDmUserIdRef.current) {
      socket.emit("typing", {
        receiverId: activeDmUserIdRef.current,
        isTyping,
      });
    }
  }

  function handleMessageInputChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setMessageInput(value);

    emitTypingState(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      emitTypingState(false);
    }, 800);
  }

  function insertEmojiAtCursor(emoji: string) {
    const input = messageInputRef.current;
    if (!input) {
      setMessageInput((current) => `${current}${emoji}`);
      return;
    }

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;

    setMessageInput((current) => {
      const safeStart = Math.min(start, current.length);
      const safeEnd = Math.min(end, current.length);
      return `${current.slice(0, safeStart)}${emoji}${current.slice(safeEnd)}`;
    });

    emitTypingState(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      emitTypingState(false);
    }, 800);

    requestAnimationFrame(() => {
      const nextCursorPosition = start + emoji.length;
      input.focus();
      input.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  }

  async function sendMessage(options?: { fileUrl?: string; content?: string }) {
    const content = (options?.content ?? messageInput).trim();
    const fileUrl = options?.fileUrl;

    if (!content && !fileUrl) {
      return;
    }

    const activeRoom = activeRoomIdRef.current;
    const activeDm = activeDmUserIdRef.current;
    if (!activeRoom && !activeDm) {
      toast.error("Select a room or user first.");
      return;
    }

    setMessageInput("");
    emitTypingState(false);

    const tempMessageId = `temp-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const optimisticMessage: ChatMessage = {
      id: tempMessageId,
      content,
      fileUrl: fileUrl ?? null,
      senderId: currentUser.id,
      senderName: currentUser.name,
      roomId: activeRoom ?? null,
      receiverId: activeDm ?? null,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimisticMessage]);
    requestAnimationFrame(() => {
      scrollToBottom();
    });

    const socket = getSocketClient();

    const resolveAck = (ack: AckResponse<ChatMessage>) => {
      if (!ack.ok) {
        setMessages((current) =>
          current.filter((message) => message.id !== tempMessageId)
        );
        toast.error(ack.error);
        return;
      }

      setMessages((current) => {
        const withoutTemp = current.filter(
          (message) => message.id !== tempMessageId
        );
        if (withoutTemp.some((message) => message.id === ack.data.id)) {
          return withoutTemp;
        }
        return [...withoutTemp, ack.data];
      });
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    };

    if (socket.connected) {
      if (activeRoom) {
        socket.emit(
          "send_message",
          {
            roomId: activeRoom,
            content,
            ...(fileUrl ? { fileUrl } : {}),
          },
          resolveAck
        );
      } else if (activeDm) {
        socket.emit(
          "private_message",
          {
            receiverId: activeDm,
            content,
            ...(fileUrl ? { fileUrl } : {}),
          },
          resolveAck
        );
      }
      return;
    }

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          activeRoom
            ? {
                roomId: activeRoom,
                content,
                ...(fileUrl ? { fileUrl } : {}),
              }
            : {
                receiverId: activeDm,
                content,
                ...(fileUrl ? { fileUrl } : {}),
              }
        ),
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: ChatMessage;
      };

      if (!response.ok || !payload.message) {
        setMessages((current) =>
          current.filter((message) => message.id !== tempMessageId)
        );
        toast.error(payload.error ?? "Failed to send message.");
        return;
      }

      setMessages((current) => {
        const withoutTemp = current.filter(
          (message) => message.id !== tempMessageId
        );
        return [...withoutTemp, payload.message as ChatMessage];
      });
    } catch {
      setMessages((current) =>
        current.filter((message) => message.id !== tempMessageId)
      );
      toast.error("Failed to send message.");
    }
  }

  async function handleMessageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage();
  }

  async function handleCreateRoom() {
    const roomName = newRoomName.trim();
    if (roomName.length < 2) {
      toast.error("Room name must be at least 2 characters.");
      return;
    }

    setCreatingRoom(true);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: roomName,
          isPrivate: newRoomPrivate,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        room?: {
          id: string;
          name: string;
          isPrivate: boolean;
          createdAt: string;
        };
      };

      if (!response.ok || !payload.room) {
        toast.error(payload.error ?? "Failed to create room.");
        return;
      }

      const createdRoom: RoomSidebarItem = {
        id: payload.room.id,
        name: payload.room.name,
        isPrivate: payload.room.isPrivate,
        createdAt: payload.room.createdAt,
        messageCount: 0,
      };

      setRooms((current) => [...current, createdRoom]);
      setActiveRoomId(createdRoom.id);
      setActiveDmUserId(null);
      setCreateRoomOpen(false);
      setNewRoomName("");
      setNewRoomPrivate(false);
      toast.success("Room created.");
    } catch {
      toast.error("Unexpected error while creating room.");
    } finally {
      setCreatingRoom(false);
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      disconnectSocketClient();
      router.replace("/login");
      router.refresh();
      setIsLoggingOut(false);
    }
  }

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      toast.error("File size exceeds 25 MB limit.");
      event.target.value = "";
      return;
    }

    setUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        url?: string;
        name?: string;
        size?: number;
        mimeType?: string | null;
      };

      if (!response.ok || !payload.url) {
        toast.error(payload.error ?? "Failed to upload attachment.");
        return;
      }

      await sendMessage({
        fileUrl: payload.url,
      });
      toast.success("Attachment uploaded.");
    } catch {
      toast.error("Unexpected error while uploading attachment.");
    } finally {
      setUploadingAttachment(false);
      event.target.value = "";
    }
  }

  return (
    <>
      <div className="grid h-full w-full grid-cols-1 gap-3 p-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-full min-h-0 py-0">
          <CardHeader className="border-b py-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Chat Rooms</CardTitle>
                <CardDescription>{currentUser.name}</CardDescription>
              </div>
              <HoverCard openDelay={0} closeDelay={180}>
                <HoverCardTrigger asChild>
                  <Button
                    aria-label="Sign out"
                    size="icon-sm"
                    variant="outline"
                  >
                    <LogOutIcon className="size-4" />
                  </Button>
                </HoverCardTrigger>
                <HoverCardContent
                  align="end"
                  className="w-36 p-1"
                  side="bottom"
                >
                  <Button
                    className="h-8 w-full justify-center rounded-sm px-2 text-sm"
                    onClick={() => {
                      void handleLogout();
                    }}
                    disabled={isLoggingOut}
                    variant="ghost"
                  >
                    {isLoggingOut ? "Signing out..." : "Sign out"}
                  </Button>
                </HoverCardContent>
              </HoverCard>
            </div>
            <Button
              className="w-full"
              onClick={() => setCreateRoomOpen(true)}
              variant="secondary"
            >
              <PlusIcon className="size-4" />
              Create Room
            </Button>
          </CardHeader>

          <CardContent className="grid h-full min-h-0 grid-rows-[1fr_1fr] gap-3 p-3">
            <div className="flex min-h-0 flex-col rounded-md border">
              <div className="border-b px-3 py-2 text-sm font-semibold">Rooms</div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-1 p-2">
                  {rooms.map((room) => {
                    const unreadCount = unreadByTarget[roomUnreadKey(room.id)] ?? 0;
                    const isActive = activeRoomId === room.id && !activeDmUserId;

                    return (
                      <button
                        key={room.id}
                        className={cn(
                          "hover:bg-muted w-full rounded-md px-3 py-2 text-left text-sm",
                          isActive && "bg-muted font-medium"
                        )}
                        type="button"
                        onClick={() => {
                          setActiveRoomId(room.id);
                          setActiveDmUserId(null);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate">{room.name}</div>
                          <div className="flex items-center gap-2">
                            {room.isPrivate ? (
                              <Badge variant="outline">Private</Badge>
                            ) : null}
                            {unreadCount > 0 ? <Badge>{unreadCount}</Badge> : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {rooms.length === 0 ? (
                    <p className="text-muted-foreground px-2 py-3 text-sm">
                      No rooms available.
                    </p>
                  ) : null}
                </div>
              </ScrollArea>
            </div>

            <div className="flex min-h-0 flex-col rounded-md border">
              <div className="border-b px-3 py-2 text-sm font-semibold">Online Users</div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-1 p-2">
                  {users.map((user) => {
                    const unreadCount = unreadByTarget[dmUnreadKey(user.id)] ?? 0;
                    const isActive = activeDmUserId === user.id && !activeRoomId;

                    return (
                      <button
                        key={user.id}
                        className={cn(
                          "hover:bg-muted w-full rounded-md px-3 py-2 text-left text-sm",
                          isActive && "bg-muted font-medium"
                        )}
                        type="button"
                        onClick={() => {
                          setActiveDmUserId(user.id);
                          setActiveRoomId(null);
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <Avatar size="sm">
                              <AvatarFallback>
                                {user.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                              <AvatarBadge
                                className={cn(
                                  user.online ? "bg-emerald-500" : "bg-zinc-400"
                                )}
                              />
                            </Avatar>
                            <span className="truncate">{user.name}</span>
                          </div>
                          {unreadCount > 0 ? <Badge>{unreadCount}</Badge> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full min-h-0 py-0">
          <CardHeader className="border-b py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <CardTitle className="truncate">{activeTargetLabel}</CardTitle>
                <CardDescription>
                  {typingDisplay ?? "Real-time and persistent message history"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid h-full min-h-0 grid-rows-[1fr_auto] gap-3 p-3">
            <ScrollArea id="chat-message-scroll" className="h-full min-h-0 rounded-md border">
              <div className="space-y-3 p-3">
                {loadingMoreMessages ? (
                  <div className="text-muted-foreground flex items-center justify-center gap-2 py-2 text-xs">
                    <Loader2Icon className="size-3 animate-spin" />
                    Loading older messages...
                  </div>
                ) : null}

                {loadingMessages ? (
                  <div className="text-muted-foreground flex items-center justify-center gap-2 py-4 text-sm">
                    <Loader2Icon className="size-4 animate-spin" />
                    Loading messages...
                  </div>
                ) : null}

                {!loadingMessages && messages.length === 0 ? (
                  <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
                    No messages yet.
                  </div>
                ) : null}

                {messages.map((message) => {
                  const isMine = message.senderId === currentUser.id;
                  const isOptimistic = message.id.startsWith("temp-");

                  return (
                    <div
                      key={message.id}
                      className={cn("flex", isMine ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] space-y-1 rounded-lg px-3 py-2 text-sm",
                          isMine
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        )}
                      >
                        <div className="text-[11px] opacity-80">
                          {isMine ? "You" : message.senderName}
                        </div>
                        {message.content ? (
                          <p className="whitespace-pre-wrap break-words">
                            {message.content}
                          </p>
                        ) : null}
                        {message.fileUrl ? (
                          (() => {
                            const attachmentKind = getAttachmentKind(message.fileUrl);

                            if (attachmentKind === "image") {
                              return (
                                <a href={message.fileUrl} target="_blank" rel="noreferrer">
                                  <Image
                                    alt="Shared attachment"
                                    className="max-h-56 rounded-md object-cover"
                                    src={message.fileUrl}
                                    width={360}
                                    height={260}
                                  />
                                </a>
                              );
                            }

                            if (attachmentKind === "video") {
                              return (
                                <video
                                  className="max-h-64 w-full rounded-md"
                                  controls
                                  preload="metadata"
                                >
                                  <source src={message.fileUrl} />
                                  Your browser cannot play this video.
                                </video>
                              );
                            }

                            if (attachmentKind === "audio") {
                              return (
                                <audio className="w-full min-w-56" controls preload="metadata">
                                  <source src={message.fileUrl} />
                                  Your browser cannot play this audio.
                                </audio>
                              );
                            }

                            return (
                              <a
                                href={message.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={cn(
                                  "flex items-center gap-2 rounded-md border px-3 py-2",
                                  isMine
                                    ? "border-white/30 bg-white/10"
                                    : "border-border bg-background/70"
                                )}
                              >
                                <FileIcon className="size-4" />
                                <span className="text-xs font-medium">
                                  Open {getAttachmentLabel(message.fileUrl)}
                                </span>
                              </a>
                            );
                          })()
                        ) : null}
                        <div className="text-[10px] opacity-70">
                          {format(new Date(message.createdAt), "p")}
                          {isOptimistic ? " - sending" : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <form className="flex items-center gap-2" onSubmit={handleMessageSubmit}>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" size="icon-sm" variant="outline">
                    <SmileIcon className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-auto border-0 bg-transparent p-0 shadow-none"
                  side="top"
                >
                  <EmojiPicker
                    autoFocusSearch={false}
                    emojiStyle={EmojiStyle.NATIVE}
                    height={380}
                    lazyLoadEmojis
                    onEmojiClick={(emojiData: EmojiClickData) => {
                      insertEmojiAtCursor(emojiData.emoji);
                    }}
                    previewConfig={{ showPreview: false }}
                    searchPlaceholder="Search emojis"
                    skinTonePickerLocation={SkinTonePickerLocation.PREVIEW}
                    suggestedEmojisMode={SuggestionMode.RECENT}
                    theme={Theme.AUTO}
                    width="min(92vw, 360px)"
                  />
                </PopoverContent>
              </Popover>

              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAttachment}
                className="shrink-0 gap-2 px-3"
              >
                {uploadingAttachment ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <PaperclipIcon className="size-4" />
                )}
                <span className="hidden sm:inline">
                  {uploadingAttachment ? "Uploading..." : "Attach File"}
                </span>
                <span className="sm:hidden">
                  {uploadingAttachment ? "..." : "Attach"}
                </span>
              </Button>

              <Input
                ref={messageInputRef}
                placeholder="Type your message..."
                value={messageInput}
                onChange={handleMessageInputChange}
                disabled={uploadingAttachment}
              />

              <Button type="submit">
                <SendIcon className="size-4" />
                Send
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={ATTACHMENT_ACCEPT_VALUE}
        onChange={(event) => {
          void handleFileSelection(event);
        }}
      />

      <Dialog open={createRoomOpen} onOpenChange={setCreateRoomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a New Room</DialogTitle>
            <DialogDescription>
              Rooms support real-time messaging and persisted history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                placeholder="Room name"
                value={newRoomName}
                onChange={(event) => setNewRoomName(event.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={newRoomPrivate}
                onCheckedChange={(checked) => setNewRoomPrivate(Boolean(checked))}
              />
              Private room
            </label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateRoomOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateRoom} disabled={creatingRoom}>
              {creatingRoom ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
