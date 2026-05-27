import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "@cubism/protocol";

const PORT = Number(process.env.PORT ?? 4000);

const allowedOrigins = [
  process.env.DESKTOP_APP_URL ?? "http://localhost:3000",
  process.env.RENDERER_APP_URL ?? "http://localhost:3001",
];

const app = express();

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "cubism-socket-server",
    timestamp: new Date().toISOString(),
  });
});

const server = http.createServer(app);

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

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

      console.log(`Renderer registered: ${payload.deviceId}`);
    }

    if (payload.role === "desktop" && payload.userId) {
      socket.join(`user:${payload.userId}`);
      console.log(`Desktop registered for user: ${payload.userId}`);
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
    console.log("Sending module command:", payload);

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
    console.log("Socket disconnected:", socket.id);

    if (socket.data.role === "renderer" && socket.data.deviceId) {
      io.emit("device:status", {
        deviceId: socket.data.deviceId,
        status: "offline",
        lastSeenAt: new Date().toISOString(),
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Cubism socket server running on http://localhost:${PORT}`);
});
