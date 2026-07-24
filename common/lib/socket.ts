import PusherClient, { Channel } from "pusher-js";
import { v4 } from "uuid";

import { getUserId } from "./userId";

/**
 * Drop-in replacement for the old socket.io-client `socket` singleton.
 * Same emit/on/off surface (see ClientToServerEvents/ServerToClientEvents in
 * common/types/global.d.ts) so every consumer keeps working unmodified, but
 * underneath it talks to Next.js API routes (persisted in Redis) + a Pusher
 * presence channel instead of a stateful custom server - both of which run
 * fine on Vercel.
 */

type AnyHandler = (...args: any[]) => void;
type PusherMember = { id: string; info?: { name?: string } };

const jsonHeaders = { "Content-Type": "application/json" };

class SocketShim {
  id: string;

  private pusher: PusherClient | null = null;

  private channel: Channel | null = null;

  private roomId: string | null = null;

  private listeners = new Map<string, Set<AnyHandler>>();

  constructor() {
    this.id = getUserId();
  }

  private emitLocal(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((handler) => handler(...args));
  }

  on(event: string, handler: AnyHandler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler?: AnyHandler) {
    if (!handler) {
      this.listeners.delete(event);
      return;
    }
    this.listeners.get(event)?.delete(handler);
  }

  private connect(roomId: string, username: string) {
    if (this.pusher && this.roomId === roomId) return;

    if (this.pusher) {
      this.pusher.disconnect();
      this.pusher = null;
      this.channel = null;
    }

    this.roomId = roomId;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      throw new Error(
        "Missing NEXT_PUBLIC_PUSHER_KEY / NEXT_PUBLIC_PUSHER_CLUSTER. Fill them in in " +
          ".env.local (see .env.example), then restart `npm run dev`."
      );
    }

    this.pusher = new PusherClient(key, {
      cluster,
      authEndpoint: "/api/pusher/auth",
      auth: { params: { user_id: this.id, username } },
    });

    const channel = this.pusher.subscribe(`presence-room-${roomId}`);
    this.channel = channel;

    channel.bind("pusher:member_added", (member: PusherMember) => {
      this.emitLocal("new_user", member.id, member.info?.name || "Anonymous");
    });

    channel.bind("pusher:member_removed", (member: PusherMember) => {
      this.emitLocal("user_disconnected", member.id);
    });

    channel.bind("user_draw", (data: { move: unknown; userId: string }) => {
      this.emitLocal("user_draw", data.move, data.userId);
    });

    channel.bind("user_undo", (data: { userId: string }) => {
      this.emitLocal("user_undo", data.userId);
    });

    channel.bind("new_msg", (data: { userId: string; msg: string }) => {
      this.emitLocal("new_msg", data.userId, data.msg);
    });

    channel.bind(
      "client-mouse_move",
      (data: { x: number; y: number }, metadata?: { user_id: string }) => {
        if (metadata?.user_id) this.emitLocal("mouse_moved", data.x, data.y, metadata.user_id);
      }
    );
  }

  private disconnect() {
    if (this.pusher) {
      this.pusher.disconnect();
      this.pusher = null;
      this.channel = null;
    }
    this.roomId = null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async emit(event: string, ...args: any[]) {
    switch (event) {
      case "create_room": {
        const [username] = args as [string];

        const res = await fetch("/api/rooms", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ username, userId: this.id }),
        });
        const data = await res.json();

        if (data.roomId) {
          this.connect(data.roomId, username);
          this.emitLocal("created", data.roomId);
        }
        break;
      }

      case "join_room": {
        const [roomId, username] = args as [string, string];

        const res = await fetch(`/api/rooms/${roomId}/join`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ username, userId: this.id }),
        });
        const data = await res.json();

        if (data.joined) {
          this.connect(roomId, username);
          this.emitLocal("joined", roomId);
        } else {
          this.emitLocal("joined", roomId, true);
        }
        break;
      }

      case "check_room": {
        const [roomId] = args as [string];

        const res = await fetch(`/api/rooms/${roomId}`);
        const data = await res.json();

        this.emitLocal("room_exists", !!data.exists);
        break;
      }

      case "joined_room": {
        if (!this.roomId) break;

        const res = await fetch(`/api/rooms/${this.roomId}`);
        const data = await res.json();

        if (data.exists) {
          this.emitLocal(
            "room",
            { drawed: data.drawed },
            JSON.stringify(data.usersMoves),
            JSON.stringify(data.users)
          );
        }
        break;
      }

      case "draw": {
        const [move] = args as [Move];
        if (!this.roomId) break;

        if (!move.id) move.id = v4();
        move.timestamp = Date.now();

        this.emitLocal("your_move", move);

        fetch(`/api/rooms/${this.roomId}/moves`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            userId: this.id,
            move,
            socketId: this.pusher?.connection.socket_id,
          }),
        });
        break;
      }

      case "undo": {
        if (!this.roomId) break;

        fetch(`/api/rooms/${this.roomId}/moves`, {
          method: "DELETE",
          headers: jsonHeaders,
          body: JSON.stringify({
            userId: this.id,
            socketId: this.pusher?.connection.socket_id,
          }),
        });
        break;
      }

      case "send_msg": {
        const [msg] = args as [string];
        if (!this.roomId) break;

        fetch(`/api/rooms/${this.roomId}/messages`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            userId: this.id,
            msg,
            socketId: this.pusher?.connection.socket_id,
          }),
        });
        break;
      }

      case "mouse_move": {
        const [x, y] = args as [number, number];

        this.channel?.trigger("client-mouse_move", { x, y });
        break;
      }

      case "leave_room": {
        const roomId = this.roomId;

        if (roomId) {
          fetch(`/api/rooms/${roomId}/leave`, {
            method: "POST",
            headers: jsonHeaders,
            keepalive: true,
            body: JSON.stringify({ userId: this.id }),
          });
        }

        this.disconnect();
        break;
      }

      default:
        break;
    }
  }
}

export const socket = new SocketShim() as unknown as Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

interface Socket<S, C> {
  id: string;
  emit<K extends keyof C>(event: K, ...args: Parameters<Extract<C[K], (...a: any) => any>>): void;
  on<K extends keyof S>(event: K, handler: S[K]): void;
  off<K extends keyof S>(event: K, handler?: S[K]): void;
}
