import { createClient } from "redis";

// const redisClient = createClient({
//   url: process.env.REDIS_URL || "redis://localhost:6379",
// });
const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
})

redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err);
});

export const connectRedis = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log("✅ Redis connected");
    }
  } catch (error) {
    console.error("❌ Redis connection failed:", error.message);
  }
};

export default redisClient;