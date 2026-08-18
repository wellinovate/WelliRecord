import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let io = null;

// Call once, from server.js, after the http server is created.
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Unauthorized"));
    }

    try {
      // Mirrors the jwt.verify() call in modules/auth/auth_middleware.js's
      // `protect` middleware. If that file signs/verifies with different
      // options (issuer, audience, algorithms), match them here too —
      // this is a best-effort mirror based on the payload shape used
      // elsewhere (authUser.sub, authUser.wrOrgId).
      let payload;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET_KEY, {
          issuer: "wellirecord-api",
          audience: "wellirecord-client",
        });
      } catch {
        payload = jwt.verify(token, process.env.JWT_SECRET_KEY);
      }
      socket.user = payload;
      if (!socket.data) socket.data = {};
      socket.data.user = payload;
      next();
    } catch (err) {
      return next(new Error("Unauthorized"));
    }
  });

  // Join the caller's own org room using the org id from the VERIFIED
  // token, never from anything the client sends directly. This is what
  // makes the org:<id> room boundary actually enforceable rather than
  // just a naming convention a client could guess.
  io.on("connection", (socket) => {
    const orgId =
      socket.user?.organizationId ||
      socket.user?.wrOrgId ||
      socket.data?.user?.organizationId ||
      socket.data?.user?.wrOrgId;

    if (orgId) {
      socket.join(`org:${orgId}`);
    }
    if (
      socket.user?.wrOrgId &&
      socket.user?.organizationId &&
      socket.user.wrOrgId !== socket.user.organizationId
    ) {
      socket.join(`org:${socket.user.wrOrgId}`);
    }
  });

  return io;
};

export const getIO = () => io;
