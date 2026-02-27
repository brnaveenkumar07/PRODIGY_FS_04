export type ChatMessage = {
  id: string;
  content: string;
  fileUrl: string | null;
  senderId: string;
  senderName: string;
  roomId: string | null;
  receiverId: string | null;
  createdAt: string;
};

export type PresenceEvent = {
  userId: string;
  onlineUserIds: string[];
};

export type TypingEvent = {
  roomId?: string;
  receiverId?: string;
  userId: string;
  userName: string;
  isTyping: boolean;
};

export type AckSuccess<T = undefined> = T extends undefined
  ? { ok: true }
  : { ok: true; data: T };

export type AckError = {
  ok: false;
  error: string;
};

export type AckResponse<T = undefined> = AckSuccess<T> | AckError;

export type JoinRoomPayload = {
  roomId: string;
};

export type LeaveRoomPayload = {
  roomId: string;
};

export type SendRoomMessagePayload = {
  roomId: string;
  content?: string;
  fileUrl?: string;
};

export type PrivateMessagePayload = {
  receiverId: string;
  content?: string;
  fileUrl?: string;
};

export type TypingPayload = {
  roomId?: string;
  receiverId?: string;
  isTyping: boolean;
};

export type BasicAck = (response: AckResponse) => void;
export type MessageAck = (response: AckResponse<ChatMessage>) => void;

export type ServerToClientEvents = {
  new_message: (message: ChatMessage) => void;
  typing: (payload: TypingEvent) => void;
  user_online: (payload: PresenceEvent) => void;
  user_offline: (payload: PresenceEvent) => void;
  socket_error: (payload: { message: string }) => void;
};

export type ClientToServerEvents = {
  join_room: (payload: JoinRoomPayload, ack?: BasicAck) => void;
  leave_room: (payload: LeaveRoomPayload, ack?: BasicAck) => void;
  send_message: (payload: SendRoomMessagePayload, ack?: MessageAck) => void;
  private_message: (payload: PrivateMessagePayload, ack?: MessageAck) => void;
  typing: (payload: TypingPayload) => void;
};
