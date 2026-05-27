"use client";

import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@cubism/protocol";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket() {
  if (!socket) {
    // The Socket.IO server lives in the same Node process as Next.js, so by
    // default we connect to the page's own origin. NEXT_PUBLIC_SOCKET_URL can
    // still override this if you ever split the bridge onto a separate host.
    const url = process.env.NEXT_PUBLIC_SOCKET_URL;

    socket = url
      ? io(url, { autoConnect: false })
      : io({ autoConnect: false });
  }

  return socket;
}
