# Cubism

Smart AI holographic assistant platform built around a Raspberry Pi-powered beam splitter cube display.

Cubism is a pnpm monorepo with two runtime apps and three shared packages:

```txt
apps/
  desktop/        Next.js control panel + Socket.IO bridge (port 3000)
  renderer/       Next.js fullscreen hologram UI (port 3001)
packages/
  protocol/       Shared Socket.IO event types
  modules/        Hologram module manifests + registry
  supabase/       Supabase clients + SQL schema
```

The desktop app runs a custom Next.js server ([apps/desktop/server.ts](./apps/desktop/server.ts)) that serves the control panel UI **and** the Socket.IO bridge from the same Node process on a single port. The Raspberry Pi renderer connects back to that port over the LAN.

See [development_plan.md](./development_plan.md) for the original specification.

## Prerequisites

- Node.js 20+ (developed against Node 22)
- pnpm 9+ (`npm install -g pnpm`)

## Getting started

```bash
pnpm install

# Copy env templates
cp apps/desktop/.env.example  apps/desktop/.env.local
cp apps/renderer/.env.example apps/renderer/.env.local

# Start everything in parallel
pnpm dev
```

Or run apps individually:

```bash
pnpm dev:desktop   # Desktop UI + Socket.IO on :3000
pnpm dev:renderer  # Hologram renderer on :3001
```

Visit <http://localhost:3000> to verify the bridge is up (or hit `http://localhost:3000/api/health` for a JSON health probe).

## MVP demo flow

1. Open <http://localhost:3000> (desktop).
2. The renderer (running at <http://localhost:3001>) registers as `pi-holo-001`.
3. The desktop shows the device as **online**.
4. Pick a clock format / toggle seconds and click **Display Clock on Hologram**.
5. The renderer animates the holographic Clock Module.

## Scripts

| Command            | Description                                       |
| ------------------ | ------------------------------------------------- |
| `pnpm dev`         | Run desktop + renderer concurrently               |
| `pnpm dev:desktop` | Custom Next.js server (UI + Socket.IO) via `tsx`  |
| `pnpm dev:renderer`| Renderer Next.js dev server                       |
| `pnpm build`       | Build every workspace package                     |
| `pnpm typecheck`   | Type-check every workspace package                |
| `pnpm lint`        | Lint every workspace package                      |

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

In `apps/renderer/.env.local` on the Pi, set `NEXT_PUBLIC_SOCKET_URL` to the LAN address of the machine running the desktop app — e.g. `http://192.168.1.42:3000`. Open port 3000 in the desktop machine's firewall.

A systemd service can wrap both processes for auto-start on boot.

## Architecture

```mermaid
flowchart LR
    DesktopUI["Desktop UI<br/>(browser)"]
    DesktopProc["Desktop process<br/>(Next.js + Socket.IO)<br/>:3000"]
    Renderer["Renderer<br/>Raspberry Pi<br/>:3001"]

    DesktopUI -- "HTTP + Socket.IO<br/>(same origin)" --> DesktopProc
    Renderer -- "Socket.IO" --> DesktopProc
    DesktopProc -- "module:display" --> Renderer
    DesktopProc -- "device:status" --> DesktopUI
```

Shared `@cubism/protocol` types make every Socket.IO event fully typed across desktop and renderer (modules ship opaque `unknown` configs over the wire and are validated against each module's Zod schema on receive). New hologram modules are added by creating one folder under `packages/modules/src/<id>/` containing the manifest, Zod schema, `Controls` component, and `Renderer` component, then registering it in `packages/modules/src/index.ts`. Both apps consume the registry automatically — no app-side edits required.

Supabase is wired up but auth stays mocked for the MVP via `NEXT_PUBLIC_DEMO_USER_ID`.

### Environment variables

`apps/desktop/.env.local`:

| Variable                       | Purpose                                                                |
| ------------------------------ | ---------------------------------------------------------------------- |
| `PORT`                         | Port the combined Next.js + Socket.IO process binds to (default 3000). |
| `ALLOWED_ORIGINS`              | Comma-separated CORS allow-list. Empty = reflect any origin.           |
| `NEXT_PUBLIC_SOCKET_URL`       | Optional override; defaults to the page origin.                        |
| `NEXT_PUBLIC_DEMO_USER_ID`     | Mock user id used by the control panel.                                |
| `NEXT_PUBLIC_DEMO_DEVICE_ID`   | Device id the desktop sends commands to.                               |
| `NEXT_PUBLIC_SUPABASE_*`       | Optional Supabase credentials.                                         |

`apps/renderer/.env.local`:

| Variable                  | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_SOCKET_URL`  | URL of the desktop process (e.g. `http://laptop:3000`).  |
| `NEXT_PUBLIC_DEVICE_ID`   | Stable id for this hologram device.                      |

## AI Assistant setup

The AI Assistant module turns the hologram into a push-to-talk voice agent: the Pi captures audio from a USB mic, the desktop process transcribes it via a local Whisper service, pipes the transcript through LM Studio for a response, then plays the response on the desktop's speakers while showing it on the hologram.

Four pieces need to be running on the desktop machine alongside `pnpm dev`:

1. **LM Studio** with at least one chat model loaded. Enable **Local Server** under **Developer → Local Server** so its OpenAI-compatible API binds to `http://127.0.0.1:1234`.
2. **Whisper STT** — any OpenAI-compatible `/v1/audio/transcriptions` server. The easiest is `faster-whisper-server` via Docker:

   ```bash
   docker run --rm -p 8000:8000 \
     -v ~/.cache/huggingface:/root/.cache/huggingface \
     --name faster-whisper-server \
     fedirz/faster-whisper-server:latest-cpu
   ```

   (Drop `-cpu` for GPU images.) First request downloads the model; subsequent calls are fast.
3. **Piper TTS** (optional but recommended) — any OpenAI-compatible `/v1/audio/speech` server. Easiest is [OpenedAI Speech](https://github.com/matatonic/openedai-speech), which wraps Piper voices behind the OpenAI TTS API. The English-only minimal image is ~150 MB:

   ```bash
   docker run -d --rm -p 8001:8000 \
     --name openedai-speech \
     ghcr.io/matatonic/openedai-speech-min:latest
   ```

   Voice names accept either OpenAI aliases (`alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`) or Piper voice ids (`en_US-amy-medium`, etc., if you run the full `openedai-speech:latest` image). If you skip this step or disable TTS in the Controls panel, the desktop browser's built-in Web Speech voice is used as a fallback — it works but sounds noticeably more robotic.

4. A USB mic plugged into the Pi. The renderer prompts for mic permission the first time you press the center key — accept it, and it remembers for future sessions.

Then open the desktop control panel, pick **AI Assistant** from Modules, hit **Test** on the LM Studio, Whisper, and Piper TTS fields, and press the center macropad key (or `Space` / `Enter` on the Pi's keyboard) to talk. Press it again to stop and send.

The defaults in `apps/desktop/.env.example` (`CUBISM_LMSTUDIO_URL`, `CUBISM_WHISPER_URL`, `CUBISM_WHISPER_MODEL`, `CUBISM_TTS_URL`, `CUBISM_TTS_VOICE`, `CUBISM_TTS_MODEL`, `CUBISM_AI_SYSTEM_PROMPT`, `CUBISM_AI_MAX_TURNS`) all point at the URLs above and can be overridden at runtime from the Controls panel.

### Giving the assistant web search (or other MCP tools)

LM Studio's MCP integration only runs inside its chat UI by default — calls to the OpenAI-compatible `/v1/chat/completions` endpoint ignore `mcp.json`. To let the assistant in this app use MCP servers (Brave Search, fetch, playwright, …):

1. Configure the MCP server in LM Studio (**Program → Edit mcp.json**), e.g. for Brave:

   ```json
   {
     "mcpServers": {
       "brave-search": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-brave-search"],
         "env": { "BRAVE_API_KEY": "your-key-here" }
       }
     }
   }
   ```

2. In LM Studio → **Settings → Local Server**:
   - Enable **Allow calling servers from mcp.json**.
   - Enable **Authentication** and copy the generated bearer token into `LM_STUDIO_API_KEY` in `apps/desktop/.env.local`.

3. Set `CUBISM_LM_INTEGRATIONS` in `apps/desktop/.env.local` to the plugin id(s) you want active, comma-separated:

   ```env
   CUBISM_LM_INTEGRATIONS=mcp/brave-search
   ```

4. Restart `pnpm dev`. The startup log will show `mcp=mcp/brave-search` next to the LM Studio line, confirming the app is now routing through LM Studio's `/api/v1/chat` Responses-style endpoint instead of the plain OpenAI one.

5. Use a model that supports tool calling (look for the hammer / "Tools" badge in LM Studio's model list). Gemma 3 / Qwen 2.5 / Llama 3.1 with tool use all work. Phrase questions naturally — "what's the latest …" or "search for …" — to nudge the model toward calling the tool.
