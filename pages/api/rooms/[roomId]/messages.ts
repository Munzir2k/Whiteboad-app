import type { NextApiRequest, NextApiResponse } from "next";

import { pusherServer, roomChannelName } from "@/common/lib/pusherServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const roomId = req.query.roomId as string;
  const { userId, msg, socketId } = req.body as {
    userId?: string;
    msg?: string;
    socketId?: string;
  };

  if (!userId || !msg) {
    res.status(400).json({ error: "userId and msg are required" });
    return;
  }

  await pusherServer.trigger(roomChannelName(roomId), "new_msg", { userId, msg }, { socket_id: socketId });

  res.status(200).json({ ok: true });
}
