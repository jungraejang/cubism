# @cubism/pi-controller

A small Node.js sidecar that runs on the Raspberry Pi alongside the
renderer. It reads `/dev/input/event*` directly to capture volume-knob
rotations from the 3-key macropad (USB VID:PID `1189:8890`), then forwards
the events to the desktop's Socket.IO server so the control panel can
advance the active Cubism module.

```
Knob -> /dev/input/eventN -> pi-controller -> socket -> desktop UI -> renderer
```

Turning the knob left emits `prev`, turning right emits `next`. The 3 macro
keys and the knob press are intentionally ignored for now — extend
`KEY_*` handling in [`src/index.ts`](src/index.ts) when you want them.

## Why a sidecar?

`KEY_VOLUMEUP` / `KEY_VOLUMEDOWN` are normally consumed by the Pi's desktop
environment for system volume long before any browser sees them. Reading
`/dev/input` directly bypasses that completely; the kernel still hands the
events to the OS volume daemon in parallel, which is harmless because the
hologram doesn't use audio output.

## Install on the Pi

1. **Pick up the latest code on the Pi:**
   ```bash
   cd ~/Documents/Projects/cubism
   git pull
   pnpm install
   pnpm --filter @cubism/pi-controller build
   ```

2. **Grant read access to the device** (so we don't need root):
   ```bash
   sudo cp apps/pi-controller/udev/99-cubism-controller.rules /etc/udev/rules.d/
   sudo udevadm control --reload-rules
   sudo udevadm trigger
   sudo usermod -aG input pi   # log out + back in afterwards
   ```

3. **Install the systemd unit:**
   ```bash
   sudo cp apps/pi-controller/systemd/cubism-controller.service /etc/systemd/system/
   sudo nano /etc/systemd/system/cubism-controller.service
   # -> set CUBISM_SERVER_URL to your desktop's LAN address
   # -> double-check WorkingDirectory / ExecStart paths
   sudo systemctl daemon-reload
   sudo systemctl enable --now cubism-controller
   ```

   The default `ExecStart` uses `/bin/bash -lc 'exec node ...'`, which means
   systemd launches a login shell as the `pi` user so it can find Node via
   nvm/fnm/Volta/apt — whichever you used to install it. If you prefer a
   hardcoded path, run `which node` as the `pi` user (after activating
   nvm/fnm if applicable) and replace the `ExecStart` line with that
   absolute path, e.g. `ExecStart=/home/pi/.nvm/versions/node/v22.0.0/bin/node /home/pi/.../dist/index.js`.

4. **Check it's running:**
   ```bash
   systemctl status cubism-controller
   journalctl -u cubism-controller -f
   ```

   You should see `connected as <id>; registering` followed by
   `watching /dev/input/eventN (HID 1189:8890)`. Turn the knob and watch
   the desktop control panel switch modules.

## Configuration

All settings come from environment variables (override in the systemd
unit file):

| Variable | Default | Purpose |
| --- | --- | --- |
| `CUBISM_SERVER_URL` | `http://127.0.0.1:3000` | Desktop Socket.IO endpoint |
| `CUBISM_DEVICE_ID` | `pi-holo-001` | Which renderer the knob belongs to |
| `CUBISM_USER_ID` | `demo-user` | Routes events to the right desktop room |
| `CUBISM_CONTROLLER_VID` | `1189` | USB vendor ID of the macropad |
| `CUBISM_CONTROLLER_PID` | `8890` | USB product ID of the macropad |

If you swap to a different keyboard, change VID/PID and rebuild.

## Local development

You can run the sidecar straight out of the repo on the Pi without
building:

```bash
pnpm --filter @cubism/pi-controller dev
```

`tsx watch` reloads on source changes. Use `Ctrl+C` to stop.

## Notes & caveats

- The parser assumes 64-bit Raspberry Pi OS (24-byte `input_event` structs).
  32-bit Pi OS uses 16-byte structs; this is detected automatically via
  `process.arch === "arm"`.
- Volume keys still affect Pi system volume in parallel. The hologram has
  no speakers so this is fine. To suppress, use `EVIOCGRAB` — but that
  also blocks the 3 macro keys from typing normally.
- The sidecar reconnects automatically on socket drop and re-scans for the
  device on USB unplug/replug.
