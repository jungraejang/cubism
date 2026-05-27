import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@cubism/protocol";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// In dev (or when ALLOWED_ORIGINS is empty) reflect the request origin so
// the renderer running on :3001 and any LAN device can connect during setup.
const corsOrigin: string[] | true =
  allowedOrigins.length > 0 ? allowedOrigins : true;

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("[socket] connected:", socket.id);

    socket.on("client:register", (payload) => {
      socket.data.role = payload.role;
      socket.data.deviceId = payload.deviceId;
      socket.data.userId = payload.userId;

      if (payload.role === "renderer" && payload.deviceId) {
        socket.join(`device:${payload.deviceId}`);

        io.emit("device:status", {
          deviceId: payload.deviceId,
          status: "online",
          lastSeenAt: new Date().toISOString(),
        });

        console.log(`[socket] renderer registered: ${payload.deviceId}`);
      }

      if (payload.role === "desktop" && payload.userId) {
        socket.join(`user:${payload.userId}`);
        console.log(`[socket] desktop registered for user: ${payload.userId}`);
      }
    });

    socket.on("device:heartbeat", (payload) => {
      io.emit("device:status", {
        deviceId: payload.deviceId,
        status: "online",
        lastSeenAt: payload.timestamp,
      });
    });

    socket.on("module:send-to-device", (payload) => {
      console.log("[socket] module command:", payload);

      io.to(`device:${payload.deviceId}`).emit("module:display", {
        commandId: payload.commandId,
        moduleId: payload.moduleId,
        config: payload.config,
      });

      io.emit("command:ack", {
        commandId: payload.commandId,
        deviceId: payload.deviceId,
        status: "received",
      });
    });

    socket.on("disconnect", () => {
      console.log("[socket] disconnected:", socket.id);

      if (socket.data.role === "renderer" && socket.data.deviceId) {
        io.emit("device:status", {
          deviceId: socket.data.deviceId,
          status: "offline",
          lastSeenAt: new Date().toISOString(),
        });
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(
      `> Cubism desktop + socket bridge ready on http://${hostname}:${port}`,
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
