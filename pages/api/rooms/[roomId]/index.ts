import type { NextApiRequest, NextApiResponse } from "next";

import { redis, ROOM_TTL_SECONDS, roomKeys } from "@/common/lib/redis";
import { pusherServer, roomChannelName } from "@/common/lib/pusherServer";

const getPresentUserIds = async (roomId: string) => {
  try {
    const response = await pusherServer.get({
      path: `/channels/${roomChannelName(roomId)}/users`,
      params: {},
    });

    if (response.status !== 200) return null;

    const body = (await response.json()) as { users: { id: string }[] };

    return body.users.map((user) => user.id);
  } catch {
    return null;
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }

  const roomId = req.query.roomId as string;
  const keys = roomKeys(roomId);

  const exists = await redis.exists(keys.meta);

  if (!exists) {
    res.status(200).json({ exists: false });
    return;
  }

  const usersMap = ((await redis.hgetall(keys.users)) as Record<string, string> | null) || {};

  const presentIds = (await getPresentUserIds(roomId)) ?? Object.keys(usersMap);

  const staleIds = Object.keys(usersMap).filter((id) => !presentIds.includes(id));
  const activeIds = Object.keys(usersMap).filter((id) => presentIds.includes(id));

  // Lazily fold moves from users who are no longer present into `drawed`,
  // mirroring the old server's `leaveRoom` cleanup that used to run on disconnect.
  await Promise.all(
    staleIds.map(async (id) => {
      const raw = await redis.lrange<string>(keys.moves(id), 0, -1);

      if (raw.length) await redis.rpush(keys.drawed, ...raw);

      await redis.del(keys.moves(id));
      await redis.hdel(keys.users, id);
    })
  );

  const usersMoves: [string, unknown[]][] = await Promise.all(
    activeIds.map(async (id) => {
      const raw = await redis.lrange<string>(keys.moves(id), 0, -1);

      return [id, raw.map((move) => JSON.parse(move))] as [string, unknown[]];
    })
  );

  const drawedRaw = await redis.lrange<string>(keys.drawed, 0, -1);
  const drawed = drawedRaw.map((move) => JSON.parse(move));

  await redis.expire(keys.meta, ROOM_TTL_SECONDS);

  res.status(200).json({
    exists: true,
    drawed,
    usersMoves,
    users: activeIds.map((id) => [id, usersMap[id]]),
  });
}
