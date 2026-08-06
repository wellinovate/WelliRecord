import { Server } from "socket.io";

let io = null;

// Call once, from server.js, after the http server is created.
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  // NOTE: this only checks that a token was sent, it does not verify
  // it against JWT_SECRET_KEY the way `protect` does for REST calls.
  // Anyone with any string can currently open a socket connection and
  // listen to lab_order_change events. Before this goes further than
  // internal testing, mirror the jwt.verify() call from
  // modules/auth/auth_middleware.js here so only real, valid tokens
  // are accepted.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Unauthorized"));
    }
    next();
  });

  return io;
};

export const getIO = () => io;
