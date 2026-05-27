# Cubism Development Specification

## Project Overview

**Cubism** is a smart AI holographic assistant platform built around a Raspberry Pi-powered beam splitter cube display. The system has three major runtime parts:

1. **Desktop App** — a Next.js web control panel used to manage devices, modules, and commands.
2. **Renderer App** — a Next.js fullscreen kiosk app running on Raspberry Pi and rendering holographic UI.
3. **Socket Server** — a Node.js + Socket.IO backend that connects the desktop app and Raspberry Pi renderer in real time.

Cubism should be implemented as a monorepo with modular architecture so new holographic modules can be added later, such as clock, weather, AI avatar, notifications, ComfyUI-generated art, calendar, and voice assistant.

The MVP must include one working example module: **Clock Module**.

Framer Motion should be used for animation in both the desktop app and renderer app.

---

## Primary MVP Goals

Build a working skeleton where:

1. The developer can run separate commands for the desktop app, renderer app, and socket server.
2. The desktop app connects to the socket server.
3. The renderer app connects to the socket server as a device.
4. The desktop app can send a command to the renderer.
5. The renderer receives the command and displays the Clock Module.
6. The renderer uses Framer Motion animations for holographic entrance, glow, pulse, and transitions.
7. The desktop app uses Framer Motion for panel/card transitions.
8. Supabase is prepared for auth/database usage, even if MVP auth is initially mocked.
9. The codebase is modular and ready for future add-ons.

---

## Recommended Tech Stack

### Monorepo

- pnpm workspaces
- TypeScript
- Optional later: Turborepo

### Desktop App

- Next.js App Router
- TypeScript
- Tailwind CSS
- Framer Motion
- Socket.IO client
- Supabase client

### Renderer App

- Next.js App Router
- TypeScript
- Tailwind CSS
- Framer Motion
- Socket.IO client
- Chromium kiosk mode on Raspberry Pi

### Socket Server

- Node.js
- Express
- Socket.IO
- TypeScript
- tsx for development
- dotenv

### Database/Auth

- Supabase Auth
- Supabase Postgres
- Supabase Storage later for generated images/videos

### Future AI Infrastructure

- Ollama or LM Studio for LLM inference
- ComfyUI running on a desktop GPU/server
- Supabase Storage or S3-compatible storage for generated media

---

## Repository Structure

Create the following structure:

```txt
cubism/
  apps/
    desktop/
      src/
        app/
        components/
        lib/
    renderer/
      src/
        app/
        components/
        lib/
        modules/
    socket-server/
      src/
        index.ts
  packages/
    protocol/
      src/
        index.ts
    modules/
      src/
        index.ts
        types.ts
        clock.ts
    supabase/
      src/
        client.ts
        schema.sql
  pnpm-workspace.yaml
  package.json
  README.md
```

---

## Root Workspace Setup

### `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### Root `package.json`

```json
{
  "name": "cubism",
  "private": true,
  "scripts": {
    "dev:desktop": "pnpm --filter desktop dev",
    "dev:renderer": "pnpm --filter renderer dev",
    "dev:socket": "pnpm --filter socket-server dev",
    "dev": "concurrently \"pnpm dev:socket\" \"pnpm dev:desktop\" \"pnpm dev:renderer\"",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "concurrently": "latest",
    "typescript": "latest"
  }
}
```

---

## App Creation Commands

From the root folder:

```bash
pnpm init
pnpm add -D concurrently typescript

mkdir apps packages

pnpm create next-app apps/desktop --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
pnpm create next-app apps/renderer --ts --tailwind --eslint --app --src-dir --import-alias "@/*"

mkdir apps/socket-server
mkdir packages/protocol packages/modules packages/supabase
```

---

## Shared Protocol Package

The protocol package owns shared Socket.IO event types.

### `packages/protocol/package.json`

```json
{
  "name": "@cubism/protocol",
  "version": "0.0.1",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

### `packages/protocol/src/index.ts`

```ts
export type ClientRole = "desktop" | "renderer";

export type ModuleId = "clock";

export type DeviceStatus = "online" | "offline";

export type ClockModuleConfig = {
  format: "12h" | "24h";
  showSeconds: boolean;
  timezone?: string;
};

export type ModuleConfigMap = {
  clock: ClockModuleConfig;
};

export type ServerToClientEvents = {
  "device:status": (payload: {
    deviceId: string;
    status: DeviceStatus;
    lastSeenAt: string;
  }) => void;

  "module:display": <TModuleId extends ModuleId>(payload: {
    commandId: string;
    moduleId: TModuleId;
    config: ModuleConfigMap[TModuleId];
  }) => void;

  "command:ack": (payload: {
    commandId: string;
    deviceId: string;
    status: "received" | "running" | "complete" | "error";
    error?: string;
  }) => void;
};

export type ClientToServerEvents = {
  "client:register": (payload: {
    role: ClientRole;
    deviceId?: string;
    userId?: string;
  }) => void;

  "device:heartbeat": (payload: {
    deviceId: string;
    currentModuleId?: ModuleId;
    timestamp: string;
  }) => void;

  "module:send-to-device": <TModuleId extends ModuleId>(payload: {
    commandId: string;
    deviceId: string;
    moduleId: TModuleId;
    config: ModuleConfigMap[TModuleId];
  }) => void;
};

export type InterServerEvents = Record<string, never>;

export type SocketData = {
  role?: ClientRole;
  deviceId?: string;
  userId?: string;
};
```

---

## Shared Modules Package

The modules package defines module metadata and default configs. React components should stay in renderer-specific code.

### `packages/modules/package.json`

```json
{
  "name": "@cubism/modules",
  "version": "0.0.1",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@cubism/protocol": "workspace:*"
  }
}
```

### `packages/modules/src/types.ts`

```ts
import type { ModuleId, ModuleConfigMap } from "@cubism/protocol";

export type ModulePermission =
  | "network"
  | "microphone"
  | "camera"
  | "supabase"
  | "comfyui"
  | "storage";

export type HologramModuleManifest<TModuleId extends ModuleId> = {
  id: TModuleId;
  name: string;
  description: string;
  version: string;
  defaultConfig: ModuleConfigMap[TModuleId];
  rendererComponentName: string;
  permissions: ModulePermission[];
};
```

### `packages/modules/src/clock.ts`

```ts
import type { HologramModuleManifest } from "./types";

export const clockModule = {
  id: "clock",
  name: "Clock",
  description: "Displays a holographic animated clock.",
  version: "0.0.1",
  rendererComponentName: "ClockModule",
  permissions: [],
  defaultConfig: {
    format: "12h",
    showSeconds: true,
    timezone: undefined,
  },
} satisfies HologramModuleManifest<"clock">;
```

### `packages/modules/src/index.ts`

```ts
import { clockModule } from "./clock";

export const moduleRegistry = {
  clock: clockModule,
};

export type RegisteredModuleId = keyof typeof moduleRegistry;

export function getModule(moduleId: RegisteredModuleId) {
  return moduleRegistry[moduleId];
}

export * from "./types";
export * from "./clock";
```

---

## Socket Server App

### Dependencies

Install in `apps/socket-server`:

```bash
pnpm add express socket.io cors dotenv tsx @cubism/protocol --filter socket-server
pnpm add -D typescript @types/node @types/express @types/cors --filter socket-server
```

### `apps/socket-server/package.json`

```json
{
  "name": "socket-server",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@cubism/protocol": "workspace:*",
    "cors": "latest",
    "dotenv": "latest",
    "express": "latest",
    "socket.io": "latest",
    "tsx": "latest"
  },
  "devDependencies": {
    "@types/cors": "latest",
    "@types/express": "latest",
    "@types/node": "latest",
    "typescript": "latest"
  }
}
```

### `apps/socket-server/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### `apps/socket-server/.env.example`

```env
PORT=4000
DESKTOP_APP_URL=http://localhost:3000
RENDERER_APP_URL=http://localhost:3001
```

### `apps/socket-server/src/index.ts`

```ts
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
```

---

## Desktop App

The desktop app is the user-facing control panel.

### Dependencies

Install in `apps/desktop`:

```bash
pnpm add socket.io-client framer-motion @cubism/protocol @cubism/modules @supabase/supabase-js --filter desktop
```

### `apps/desktop/.env.example`

```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
NEXT_PUBLIC_DEMO_USER_ID=demo-user
NEXT_PUBLIC_DEMO_DEVICE_ID=pi-holo-001
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Desktop Requirements

The desktop app should:

1. Connect to Socket.IO server.
2. Register as role `desktop`.
3. Display socket connection status.
4. Display renderer device status.
5. Provide Clock Module controls:
   - 12h or 24h format.
   - Show/hide seconds.

6. Send `module:send-to-device` event when user clicks button.
7. Use Framer Motion for:
   - Page entry animation.
   - Card fade/slide transitions.
   - Button tap animation.
   - Status indicator pulse.

### `apps/desktop/src/lib/socket.ts`

```ts
"use client";

import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@cubism/protocol";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      autoConnect: false,
    });
  }

  return socket;
}
```

### `apps/desktop/src/app/page.tsx`

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getSocket } from "@/lib/socket";

type DeviceStatus = "online" | "offline" | "unknown";

export default function DesktopHomePage() {
  const socket = useMemo(() => getSocket(), []);
  const [connected, setConnected] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("unknown");
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [format, setFormat] = useState<"12h" | "24h">("12h");
  const [showSeconds, setShowSeconds] = useState(true);

  const userId = process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "demo-user";
  const deviceId = process.env.NEXT_PUBLIC_DEMO_DEVICE_ID ?? "pi-holo-001";

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("client:register", {
        role: "desktop",
        userId,
      });
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("device:status", (payload) => {
      if (payload.deviceId !== deviceId) return;
      setDeviceStatus(payload.status);
      setLastSeenAt(payload.lastSeenAt);
    });

    socket.on("command:ack", (payload) => {
      console.log("Command ack:", payload);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("device:status");
      socket.off("command:ack");
      socket.disconnect();
    };
  }, [socket, userId, deviceId]);

  function sendClockModule() {
    socket.emit("module:send-to-device", {
      commandId: crypto.randomUUID(),
      deviceId,
      moduleId: "clock",
      config: {
        format,
        showSeconds,
      },
    });
  }

  return (
    <main className="min-h-screen overflow-hidden bg-zinc-950 text-white">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mx-auto flex max-w-4xl flex-col gap-6 p-8"
      >
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
            Cubism
          </p>
          <h1 className="mt-3 text-4xl font-bold">Desktop Control Panel</h1>
          <p className="mt-2 text-zinc-400">
            Control your Raspberry Pi-powered holographic assistant.
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl"
        >
          <h2 className="text-xl font-semibold">Connection</h2>

          <div className="mt-4 grid gap-3 text-sm text-zinc-300">
            <div className="flex items-center gap-3">
              <motion.span
                animate={{ scale: connected ? [1, 1.25, 1] : 1 }}
                transition={{ repeat: connected ? Infinity : 0, duration: 1.5 }}
                className={`h-3 w-3 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`}
              />
              <span>
                Socket server: {connected ? "Connected" : "Disconnected"}
              </span>
            </div>

            <p>
              Device <span className="font-mono">{deviceId}</span>:{" "}
              {deviceStatus}
            </p>

            {lastSeenAt && (
              <p className="text-zinc-500">
                Last seen: {new Date(lastSeenAt).toLocaleString()}
              </p>
            )}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-cyan-400/20 bg-zinc-900/80 p-6 shadow-[0_0_40px_rgba(34,211,238,0.08)]"
        >
          <h2 className="text-xl font-semibold">Clock Module</h2>

          <div className="mt-4 flex flex-col gap-4">
            <label className="flex items-center gap-3">
              <span className="w-32 text-zinc-400">Format</span>
              <select
                className="rounded-lg bg-zinc-800 px-3 py-2 text-white"
                value={format}
                onChange={(event) =>
                  setFormat(event.target.value as "12h" | "24h")
                }
              >
                <option value="12h">12 hour</option>
                <option value="24h">24 hour</option>
              </select>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={showSeconds}
                onChange={(event) => setShowSeconds(event.target.checked)}
              />
              <span>Show seconds</span>
            </label>

            <motion.button
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.02 }}
              onClick={sendClockModule}
              className="w-fit rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-zinc-950 hover:bg-cyan-300"
            >
              Display Clock on Hologram
            </motion.button>
          </div>
        </motion.section>
      </motion.div>
    </main>
  );
}
```

---

## Renderer App

The renderer app runs on Raspberry Pi in fullscreen kiosk mode.

### Dependencies

Install in `apps/renderer`:

```bash
pnpm add socket.io-client framer-motion @cubism/protocol @cubism/modules --filter renderer
```

### `apps/renderer/.env.example`

```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
NEXT_PUBLIC_DEVICE_ID=pi-holo-001
```

### `apps/renderer/package.json`

Make sure the renderer uses port `3001`:

```json
{
  "name": "renderer",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  }
}
```

### Renderer Requirements

The renderer app should:

1. Connect to Socket.IO server.
2. Register as role `renderer` with `deviceId`.
3. Send heartbeat every 10 seconds.
4. Listen for `module:display` events.
5. Render active module.
6. Default to Clock Module when no command has been received.
7. Use Framer Motion for:
   - Initial hologram materialization.
   - Clock pulse effect.
   - Rotating or orbiting rings.
   - Smooth module transitions.
   - Connection screen fade.

### `apps/renderer/src/lib/socket.ts`

```ts
"use client";

import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@cubism/protocol";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      autoConnect: false,
      reconnection: true,
    });
  }

  return socket;
}
```

### `apps/renderer/src/modules/ClockModule.tsx`

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { ClockModuleConfig } from "@cubism/protocol";

type Props = {
  config: ClockModuleConfig;
};

export function ClockModule({ config }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const time = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: config.showSeconds ? "2-digit" : undefined,
      hour12: config.format === "12h",
      timeZone: config.timezone,
    }).format(now);
  }, [now, config]);

  const date = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: config.timezone,
    }).format(now);
  }, [now, config]);

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black text-cyan-200">
      <motion.div
        initial={{ opacity: 0, scale: 0.7, filter: "blur(18px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.8, filter: "blur(12px)" }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        className="relative flex h-[80vmin] w-[80vmin] items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/5 shadow-[0_0_80px_rgba(34,211,238,0.35)]"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute inset-8 rounded-full border border-dashed border-cyan-300/20"
        />

        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
          className="absolute inset-20 rounded-full border border-cyan-300/10"
        />

        <motion.div
          animate={{
            scale: [1, 1.035, 1],
            opacity: [0.8, 1, 0.8],
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          className="text-center"
        >
          <div className="text-[12vmin] font-bold tracking-tight drop-shadow-[0_0_30px_rgba(103,232,249,0.9)]">
            {time}
          </div>
          <div className="mt-4 text-[3vmin] uppercase tracking-[0.5em] text-cyan-100/70">
            {date}
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        animate={{ opacity: [0.15, 0.35, 0.15] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(34,211,238,0.2),transparent_55%)]"
      />
    </div>
  );
}
```

### `apps/renderer/src/app/page.tsx`

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getSocket } from "@/lib/socket";
import { ClockModule } from "@/modules/ClockModule";
import type { ClockModuleConfig, ModuleId } from "@cubism/protocol";

type ActiveModule = {
  moduleId: "clock";
  config: ClockModuleConfig;
} | null;

export default function RendererHomePage() {
  const socket = useMemo(() => getSocket(), []);
  const [connected, setConnected] = useState(false);
  const [activeModule, setActiveModule] = useState<ActiveModule>({
    moduleId: "clock",
    config: {
      format: "12h",
      showSeconds: true,
    },
  });

  const deviceId = process.env.NEXT_PUBLIC_DEVICE_ID ?? "pi-holo-001";

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      setConnected(true);

      socket.emit("client:register", {
        role: "renderer",
        deviceId,
      });
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("module:display", (payload) => {
      if (payload.moduleId === "clock") {
        setActiveModule({
          moduleId: "clock",
          config: payload.config,
        });

        socket.emit("device:heartbeat", {
          deviceId,
          currentModuleId: payload.moduleId as ModuleId,
          timestamp: new Date().toISOString(),
        });
      }
    });

    const heartbeatInterval = window.setInterval(() => {
      socket.emit("device:heartbeat", {
        deviceId,
        currentModuleId: activeModule?.moduleId,
        timestamp: new Date().toISOString(),
      });
    }, 10_000);

    return () => {
      window.clearInterval(heartbeatInterval);
      socket.off("connect");
      socket.off("disconnect");
      socket.off("module:display");
      socket.disconnect();
    };
  }, [socket, deviceId, activeModule?.moduleId]);

  if (!connected) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-black text-cyan-200">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-4xl font-bold"
          >
            Cubism Renderer
          </motion.div>
          <div className="mt-4 text-cyan-100/60">
            Connecting to socket server...
          </div>
        </motion.div>
      </main>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {activeModule?.moduleId === "clock" ? (
        <ClockModule key="clock" config={activeModule.config} />
      ) : (
        <motion.main
          key="empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex h-screen w-screen items-center justify-center bg-black text-white"
        >
          No active module
        </motion.main>
      )}
    </AnimatePresence>
  );
}
```

---

## Supabase Package

### Dependencies

```bash
pnpm add @supabase/supabase-js --filter @cubism/supabase
```

### `packages/supabase/package.json`

```json
{
  "name": "@cubism/supabase",
  "version": "0.0.1",
  "private": true,
  "main": "src/client.ts",
  "types": "src/client.ts",
  "dependencies": {
    "@supabase/supabase-js": "latest"
  }
}
```

### `packages/supabase/src/client.ts`

```ts
import { createClient } from "@supabase/supabase-js";

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing browser Supabase environment variables.");
  }

  return createClient(url, anonKey);
}

export function createServiceSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing service Supabase environment variables.");
  }

  return createClient(url, serviceRoleKey);
}
```

### `packages/supabase/src/schema.sql`

```sql
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  device_key text unique not null,
  name text not null,
  status text not null default 'offline',
  last_seen_at timestamptz null,
  created_at timestamptz not null default now()
);

create table public.device_modules (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.devices(id) on delete cascade,
  module_id text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.command_logs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.devices(id) on delete cascade,
  command_id text not null,
  command_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'created',
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);
```

---

## Module Management Scheme

Use a manifest-based architecture.

### Principle

The module package should define:

- Module ID
- Name
- Description
- Version
- Default config
- Required permissions
- Renderer component name

The renderer app should define:

- React component implementation
- Animation style
- Visual layout
- Device-specific behavior

The desktop app should define:

- Control panel UI for each module
- Config editor
- Send command button

The socket server should not know module UI details. It only routes typed commands.

---

## Recommended Future Module Folder Pattern

```txt
packages/modules/src/
  types.ts
  registry.ts
  clock/
    manifest.ts
    defaultConfig.ts
  weather/
    manifest.ts
    defaultConfig.ts
  ai-avatar/
    manifest.ts
    defaultConfig.ts

apps/renderer/src/modules/
  ClockModule.tsx
  WeatherModule.tsx
  AiAvatarModule.tsx

apps/desktop/src/modules/
  ClockModulePanel.tsx
  WeatherModulePanel.tsx
  AiAvatarModulePanel.tsx
```

---

## Future Module Ideas

### Core Modules

- Clock
- Weather
- Calendar
- Notifications
- System Status

### AI Modules

- AI Avatar
- Chat Assistant
- Voice Assistant
- ComfyUI Art Generator
- Image Gallery
- Daily Summary

### IoT Modules

- Smart Home Control
- Sensor Dashboard
- Doorbell Alert
- Camera Alert

### Fun Modules

- Hologram Pet
- Ambient Cyberpunk City
- Music Visualizer
- Focus Timer
- Pomodoro Companion

---

## Raspberry Pi Runtime Plan

The Raspberry Pi should run the renderer app in Chromium kiosk mode.

### Local renderer commands

```bash
pnpm --filter renderer build
pnpm --filter renderer start
```

### Chromium kiosk launch

```bash
chromium-browser \
  --kiosk \
  --disable-infobars \
  --noerrdialogs \
  http://localhost:3001
```

---

## Recommended MVP Implementation Order

Use this exact task order for an AI coding agent.

### Phase 1 — Monorepo Setup

1. Create `cubism` monorepo.
2. Add pnpm workspace config.
3. Add root scripts.
4. Create Next.js desktop app.
5. Create Next.js renderer app.
6. Create socket-server app.
7. Create shared protocol package.
8. Create shared modules package.
9. Create shared Supabase package.

### Phase 2 — Socket Server

1. Implement Express health endpoint.
2. Implement Socket.IO server.
3. Implement `client:register`.
4. Implement renderer device room: `device:{deviceId}`.
5. Implement `device:heartbeat`.
6. Implement `module:send-to-device` forwarding.
7. Implement device online/offline status events.

### Phase 3 — Renderer App

1. Add socket client.
2. Register renderer with `NEXT_PUBLIC_DEVICE_ID`.
3. Send heartbeat every 10 seconds.
4. Listen for `module:display` event.
5. Render Clock Module.
6. Add Framer Motion hologram animation.
7. Add connection screen animation.

### Phase 4 — Desktop App

1. Add socket client.
2. Register desktop with demo user ID.
3. Display socket connection status.
4. Display device status.
5. Build Clock Module control panel.
6. Send module command to renderer.
7. Add Framer Motion card and button animations.

### Phase 5 — Supabase Preparation

1. Add schema SQL.
2. Add browser Supabase client.
3. Add service Supabase client.
4. Keep auth mocked for MVP unless specifically requested.
5. Later add real Supabase Auth and RLS.

### Phase 6 — Raspberry Pi Deployment Prep

1. Build renderer app.
2. Run renderer app on port `3001`.
3. Open Chromium in kiosk mode.
4. Create systemd service later.
5. Add auto-start later.

---

## Acceptance Criteria

The MVP is successful when:

1. `pnpm dev:socket` starts the socket server on port `4000`.
2. `pnpm dev:desktop` starts the desktop app on port `3000`.
3. `pnpm dev:renderer` starts the renderer app on port `3001`.
4. Renderer registers as device `pi-holo-001`.
5. Desktop shows the renderer as online.
6. Clicking `Display Clock on Hologram` sends a socket event.
7. Renderer receives the event and displays the animated Clock Module.
8. Clock Module updates every second.
9. Framer Motion animations are visible in both desktop and renderer apps.
10. Code is TypeScript-safe and shared protocol types are used by all apps.

---

## Important Deployment Notes

### Desktop App

The desktop Next.js app can be deployed to Vercel.

### Socket Server

The socket server should not be deployed as a normal Vercel serverless function because Socket.IO needs a long-running server process.

Recommended deployment targets:

- Railway
- Fly.io
- Render
- DigitalOcean App Platform
- DigitalOcean Droplet
- Home server with Tailscale/VPN

### Renderer App

The renderer app runs locally on Raspberry Pi.

In production:

- Build with `pnpm --filter renderer build`.
- Start with `pnpm --filter renderer start`.
- Launch Chromium in kiosk mode.
- Use systemd to restart app on failure.

---

## Future AI/ComfyUI Architecture

Do not implement ComfyUI in the MVP skeleton.

Future design:

```txt
Desktop prompt input
→ Socket/API server creates AI job
→ ComfyUI worker receives workflow
→ Generated image/video saved to Supabase Storage
→ Socket server sends DISPLAY_ASSET command
→ Renderer displays generated media as hologram scene
```

Future modules:

```txt
comfyui-art
ai-avatar
voice-assistant
image-gallery
```

---

## Coding Style Requirements

1. Use strict TypeScript.
2. Keep socket event types in `@cubism/protocol`.
3. Do not duplicate event type definitions inside apps.
4. Keep module metadata in `@cubism/modules`.
5. Keep renderer UI components inside `apps/renderer`.
6. Keep desktop control panels inside `apps/desktop`.
7. Use Framer Motion for visible transitions.
8. Use Tailwind CSS for styling.
9. Avoid premature complexity.
10. Keep Supabase integration prepared but optional in the first skeleton.

---

## Agent Instruction Summary

Build Cubism as a pnpm monorepo with three apps: `desktop`, `renderer`, and `socket-server`. Add shared packages for `protocol`, `modules`, and `supabase`. Implement a Socket.IO connection between the desktop app and renderer app through the socket server. Implement a Clock Module as the first module. The desktop app should control the clock settings and send them to the renderer. The renderer should display an animated holographic clock using Framer Motion. Prepare Supabase schema and clients, but do not require full auth for the first MVP.
