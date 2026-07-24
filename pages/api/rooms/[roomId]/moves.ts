import type { NextApiRequest, NextApiResponse } from "next";

import { redis, ROOM_TTL_SECONDS, roomKeys } from "@/common/lib/redis";
import { pusherServer, roomChannelName } from "@/common/lib/pusherServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const roomId = req.query.roomId as string;
  const keys = roomKeys(roomId);
  const channel = roomChannelName(roomId);

  if (req.method === "POST") {
    const { userId, move, socketId } = req.body as {
      userId?: string;
      move?: unknown;
      socketId?: string;
    };

    if (!userId || !move) {
      res.status(400).json({ error: "userId and move are required" });
      return;
    }

    await redis.rpush(keys.moves(userId), JSON.stringify(move));
    await redis.expire(keys.moves(userId), ROOM_TTL_SECONDS);

    await pusherServer.trigger(channel, "user_draw", { move, userId }, { socket_id: socketId });

    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    const { userId, socketId } = req.body as { userId?: string; socketId?: string };

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    await redis.rpop(keys.moves(userId));

    await pusherServer.trigger(channel, "user_undo", { userId }, { socket_id: socketId });

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).end();
}
