import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.warn("⚠️ REDIS_URL is not set. Redis connection will be skipped.");
}

const redisClient = redisUrl
  ? createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy(retries) {
          if (retries > 5) {
            console.error("❌ Redis reconnect attempts exceeded.");
            return new Error("Redis retry limit reached");
          }
          return Math.min(retries * 500, 3000);
        },
      },
    })
  : null;

if (redisClient) {
  redisClient.on("error", (err) => {
    console.error("Redis Client Error:", err.message);
  });

  redisClient.on("connect", () => {
    console.log("✅ Redis connected");
  });

  redisClient.on("reconnecting", () => {
    console.log("🔄 Redis reconnecting...");
  });
}

export const connectRedis = async () => {
  try {
    if (!redisClient) {
      console.warn("⚠️ Redis client not created because REDIS_URL is missing.");
      return;
    }

    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (error) {
    console.error("❌ Redis connection failed:", error.message);
  }
};

export default redisClient;