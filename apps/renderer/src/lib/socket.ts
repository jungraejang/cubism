"use client";

import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@cubism/protocol";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket() {
  if (!socket) {
    // The Pi renderer must always point at the desktop process, never at its
    // own origin (which is :3001 and has no Socket.IO handler). Fall back to
    // localhost:3000 so the dev experience works without an .env.local, but
    // the Pi is expected to override this with the laptop's LAN address.
    const url =
      process.env.NEXT_PUBLIC_SOCKET_URL && process.env.NEXT_PUBLIC_SOCKET_URL.length > 0
        ? process.env.NEXT_PUBLIC_SOCKET_URL
        : "http://localhost:3000";

    socket = io(url, {
      autoConnect: false,
      reconnection: true,
    });
  }

  return socket;
}
