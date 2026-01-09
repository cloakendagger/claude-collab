/**
 * Shared types for the collaborative Claude session system
 */

export interface Session {
  id: string;
  token: string;
  createdAt: number;
  hostConnected: boolean;
}

export interface Message {
  id: string;
  sessionId: string;
  type: 'prompt' | 'response' | 'system';
  content: string;
  author?: string;
  timestamp: number;
}

export interface Participant {
  userId: string;
  username: string;
  connectionId: string;
  isHost: boolean;
  connectedAt: number;
}

export interface LockState {
  holder: string | null; // userId
  username: string | null;
  grantedAt: number | null;
  lastHeartbeat: number | null;
}

// WebSocket message types - Client to Server
export type ClientMessage =
  | { type: 'host.connect'; sessionId: string }
  | { type: 'client.join'; sessionId: string; token: string; username: string }
  | { type: 'lock.request'; sessionId: string; userId: string }
  | { type: 'lock.release'; sessionId: string; userId: string }
  | { type: 'lock.heartbeat'; sessionId: string; userId: string }
  | { type: 'typing.update'; sessionId: string; userId: string; isTyping: boolean }
  | { type: 'message.prompt'; sessionId: string; userId: string; content: string }
  | { type: 'lock.force_release'; sessionId: string; userId: string }; // Host only

// WebSocket message types - Server to Client
export type ServerMessage =
  | { type: 'session.state'; sessionId: string; messages: Message[]; participants: Participant[]; lock: LockState }
  | { type: 'lock.granted'; userId: string; username: string }
  | { type: 'lock.released' }
  | { type: 'lock.denied'; reason: string }
  | { type: 'message.prompt'; id: string; author: string; content: string; timestamp: number }
  | { type: 'message.response'; id: string; content: string; timestamp: number; streaming: boolean }
  | { type: 'message.system'; id: string; content: string; timestamp: number }
  | { type: 'typing.update'; userId: string; username: string; isTyping: boolean }
  | { type: 'user.joined'; userId: string; username: string }
  | { type: 'user.left'; userId: string; username: string }
  | { type: 'error'; message: string; code: string };

export const LOCK_TIMEOUT_MS = 30000; // 30 seconds idle timeout
export const LOCK_HEARTBEAT_INTERVAL_MS = 5000; // Heartbeat every 5 seconds
export const DISCONNECT_GRACE_PERIOD_MS = 3000; // 3 seconds to reconnect before releasing lock
