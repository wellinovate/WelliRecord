import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

let io = null;

// Call once, from server.js, after the http server is created.
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  // Mirrors the same jwt.verify() check as modules/auth/auth_middleware.js's
  // `protect` middleware, so a socket connection requires the same real,
  // signed, unexpired token as a REST request — not just any non-empty
  // string. The decoded payload is attached to socket.data.user so future
  // handlers (e.g. per-organization room scoping) can read it.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Unauthorized"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY, {
        issuer: "wellirecord-api",
        audience: "wellirecord-client",
      });
      socket.data.user = decoded;
      next();
    } catch (error) {
      next(new Error("Invalid or expired token"));
    }
  });

  return io;
};

export const getIO = () => io;
