import Pusher from "pusher";

const { PUSHER_APP_ID: appId, PUSHER_KEY: key, PUSHER_SECRET: secret, PUSHER_CLUSTER: cluster } =
  process.env;

if (!appId || !key || !secret || !cluster) {
  throw new Error(
    "Missing PUSHER_APP_ID / PUSHER_KEY / PUSHER_SECRET / PUSHER_CLUSTER. Fill them in in " +
      ".env.local (see .env.example) with values from your Pusher app's \"App Keys\" tab, " +
      "then restart `npm run dev`."
  );
}

export const pusherServer = new Pusher({ appId, key, secret, cluster, useTLS: true });

export const roomChannelName = (roomId: string) => `presence-room-${roomId}`;
