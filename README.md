# Cubism

Smart AI holographic assistant platform built around a Raspberry Pi-powered beam splitter cube display.

Cubism is a pnpm monorepo with three runtime parts and three shared packages:

```txt
apps/
  desktop/        Next.js control panel (port 3000)
  renderer/       Next.js fullscreen hologram UI (port 3001)
  socket-server/  Node.js + Socket.IO backend (port 4000)
packages/
  protocol/       Shared Socket.IO event types
  modules/        Hologram module manifests + registry
  supabase/       Supabase clients + SQL schema
```

See [development_plan.md](./development_plan.md) for the full specification.

## Prerequisites

- Node.js 20+ (developed against Node 22)
- pnpm 9+ (`npm install -g pnpm`)

## Getting started

```bash
pnpm install

# Copy env templates
cp apps/socket-server/.env.example apps/socket-server/.env
cp apps/desktop/.env.example       apps/desktop/.env.local
cp apps/renderer/.env.example      apps/renderer/.env.local

# Start everything in parallel
pnpm dev
```

Or run apps individually:

```bash
pnpm dev:socket    # Socket.IO server on :4000
pnpm dev:desktop   # Desktop control panel on :3000
pnpm dev:renderer  # Hologram renderer on :3001
```

## MVP demo flow

1. Open <http://localhost:3000> (desktop).
2. The renderer (running at <http://localhost:3001>) registers as `pi-holo-001`.
3. The desktop shows the device as **online**.
4. Pick a clock format / toggle seconds and click **Display Clock on Hologram**.
5. The renderer animates the holographic Clock Module.

## Scripts

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `pnpm dev`         | Run socket + desktop + renderer concurrently |
| `pnpm dev:socket`  | Socket.IO server (tsx watch)                 |
| `pnpm dev:desktop` | Desktop Next.js dev server                   |
| `pnpm dev:renderer`| Renderer Next.js dev server                  |
| `pnpm build`       | Build every workspace package                |
| `pnpm typecheck`   | Type-check every workspace package           |
| `pnpm lint`        | Lint every workspace package                 |

## Raspberry Pi kiosk

On the Pi, build and serve the renderer, then launch Chromium in kiosk mode:

```bash
pnpm --filter renderer build
pnpm --filter renderer start

chromium-browser \
  --kiosk \
  --disable-infobars \
  --noerrdialogs \
  http://localhost:3001
```

A systemd service can wrap both processes for auto-start on boot.

## Architecture

Shared `@cubism/protocol` types make every Socket.IO event fully typed across desktop, server, and renderer. New hologram modules are added by registering a manifest in `@cubism/modules` and a React component in `apps/renderer/src/modules/`.

Supabase is wired up but auth stays mocked for the MVP via `NEXT_PUBLIC_DEMO_USER_ID`.
