import type { NextApiRequest, NextApiResponse } from "next";

import { redis, ROOM_TTL_SECONDS, roomKeys } from "@/common/lib/redis";

const MAX_USERS = 12;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const roomId = req.query.roomId as string;
  const { username, userId } = req.body as { username?: string; userId?: string };

  if (!username || !userId) {
    res.status(400).json({ error: "username and userId are required" });
    return;
  }

  const keys = roomKeys(roomId);

  const exists = await redis.exists(keys.meta);

  if (!exists) {
    res.status(200).json({ joined: false });
    return;
  }

  const usersMap = ((await redis.hgetall(keys.users)) as Record<string, string> | null) || {};

  if (Object.keys(usersMap).length >= MAX_USERS && !usersMap[userId]) {
    res.status(200).json({ joined: false });
    return;
  }

  await redis.hset(keys.users, { [userId]: username });
  await redis.expire(keys.meta, ROOM_TTL_SECONDS);
  await redis.expire(keys.users, ROOM_TTL_SECONDS);

  res.status(200).json({ joined: true });
}
