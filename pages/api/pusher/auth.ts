import type { NextApiRequest, NextApiResponse } from "next";

import { pusherServer } from "@/common/lib/pusherServer";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const { socket_id: socketId, channel_name: channel, user_id: userId, username } = req.body;

  if (!socketId || !channel || !userId) {
    res.status(400).json({ error: "socket_id, channel_name and user_id are required" });
    return;
  }

  const auth = pusherServer.authorizeChannel(socketId, channel, {
    user_id: userId,
    user_info: { name: username || "Anonymous" },
  });

  res.status(200).json(auth);
}
