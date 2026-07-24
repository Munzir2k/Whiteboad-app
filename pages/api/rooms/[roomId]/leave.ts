import type { NextApiRequest, NextApiResponse } from "next";

import { redis, roomKeys } from "@/common/lib/redis";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const roomId = req.query.roomId as string;
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const keys = roomKeys(roomId);

  const moves = await redis.lrange<string>(keys.moves(userId), 0, -1);

  if (moves.length) await redis.rpush(keys.drawed, ...moves);

  await redis.del(keys.moves(userId));
  await redis.hdel(keys.users, userId);

  res.status(200).json({ ok: true });
}
