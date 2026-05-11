import rateLimit from "express-rate-limit";

const isProduction = process.env.NODE_ENV === "production";

export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute

  // Low in development so you can actually test it
  limit: isProduction ? 300 : 10,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many requests. Please slow down and try again shortly.",
  },

  skip: (req) => {
    // Do not rate-limit CORS preflight requests
    if (req.method === "OPTIONS") return true;

    // Do not rate-limit health checks
    if (req.path === "/health" || req.path === "/api/health") return true;

    return false;
  },

  handler: (req, res) => {
    console.warn("🚫 RATE LIMITED:", {
      ip: req.ip,
      method: req.method,
      path: req.originalUrl,
    });

    return res.status(429).json({
      success: false,
      message: "Too many requests. Please slow down and try again shortly.",
    });
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProduction ? 10 : 5,

  standardHeaders: true,
  legacyHeaders: false,

  skip: (req) => req.method === "OPTIONS",

  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
  },

  handler: (req, res) => {
    console.warn("🚫 AUTH RATE LIMITED:", {
      ip: req.ip,
      method: req.method,
      path: req.originalUrl,
    });

    return res.status(429).json({
      success: false,
      message: "Too many authentication attempts. Please try again later.",
    });
  },
});