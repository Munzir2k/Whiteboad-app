import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error(
    "Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. Fill them in in .env.local " +
      "(see .env.example) with values from your Upstash Redis database's REST API section, " +
      "then restart `npm run dev`."
  );
}

export const redis = new Redis({ url, token });

export const ROOM_TTL_SECONDS = 60 * 60 * 24;

export const roomKeys = (roomId: string) => ({
  meta: `room:${roomId}:meta`,
  users: `room:${roomId}:users`,
  drawed: `room:${roomId}:drawed`,
  moves: (userId: string) => `room:${roomId}:moves:${userId}`,
});
