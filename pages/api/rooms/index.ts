import type { NextApiRequest, NextApiResponse } from "next";

import { redis, ROOM_TTL_SECONDS, roomKeys } from "@/common/lib/redis";

const generateRoomId = () => Math.random().toString(36).substring(2, 6);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const { username, userId } = req.body as { username?: string; userId?: string };

  if (!username || !userId) {
    res.status(400).json({ error: "username and userId are required" });
    return;
  }

  let roomId = generateRoomId();
  let attempts = 0;

  while ((await redis.exists(roomKeys(roomId).meta)) && attempts < 50) {
    roomId = generateRoomId();
    attempts += 1;
  }

  const keys = roomKeys(roomId);

  await redis.hset(keys.meta, { createdAt: Date.now() });
  await redis.hset(keys.users, { [userId]: username });
  await redis.expire(keys.meta, ROOM_TTL_SECONDS);
  await redis.expire(keys.users, ROOM_TTL_SECONDS);

  res.status(200).json({ roomId });
}
