import { createReadStream } from "node:fs";

/**
 * Minimal Linux evdev reader.
 *
 * We deliberately avoid a native dependency (node-hid / node-evdev) — those
 * need build toolchains on the Pi and only add complexity. The kernel emits
 * fixed-size structs to `/dev/input/eventN`, so a tiny stream parser is
 * enough for our needs.
 *
 * `struct input_event` on 64-bit Linux (Raspberry Pi OS 64-bit, the default
 * for Pi 4) is 24 bytes:
 *   struct timeval time;   // 16 bytes (two 8-byte longs)
 *   __u16 type;            // 2 bytes
 *   __u16 code;            // 2 bytes
 *   __s32 value;           // 4 bytes
 *
 * On 32-bit ARM userspace the timeval shrinks to 8 bytes and the total to
 * 16. We detect at runtime via `process.arch`.
 */

const EVENT_SIZE_64 = 24;
const EVENT_SIZE_32 = 16;

const IS_64_BIT_ARCH = process.arch === "arm64" || process.arch === "x64";

export const EVENT_SIZE = IS_64_BIT_ARCH ? EVENT_SIZE_64 : EVENT_SIZE_32;
const TYPE_OFFSET = IS_64_BIT_ARCH ? 16 : 8;
const CODE_OFFSET = TYPE_OFFSET + 2;
const VALUE_OFFSET = CODE_OFFSET + 2;

export type InputEvent = {
  type: number;
  code: number;
  value: number;
};

// Selected EV_/KEY_ constants we actually use. Full list is in
// <linux/input-event-codes.h>.
export const EV_KEY = 0x01;
export const KEY_VOLUMEDOWN = 114;
export const KEY_VOLUMEUP = 115;
export const KEY_MUTE = 113;

export type EvdevWatcher = {
  close: () => void;
};

/**
 * Open `path` and invoke `onEvent` for each `input_event` struct read.
 * The stream is held open until `close()` is called, or the file ends
 * (e.g. device unplugged), at which point `onClose(reason)` fires so the
 * caller can re-discover the device and try again.
 */
export function watchEvdev(
  path: string,
  onEvent: (event: InputEvent) => void,
  onClose: (reason: "end" | "error", error?: Error) => void,
): EvdevWatcher {
  const stream = createReadStream(path, { highWaterMark: EVENT_SIZE * 16 });

  /*
   * The OS doesn't guarantee that each `read` returns a whole number of
   * structs, so we buffer leftover bytes between chunks.
   */
  let leftover: Buffer = Buffer.alloc(0);

  stream.on("data", (chunk) => {
    const chunkBuf =
      typeof chunk === "string" ? Buffer.from(chunk, "binary") : chunk;
    const buf =
      leftover.length > 0 ? Buffer.concat([leftover, chunkBuf]) : chunkBuf;
    let offset = 0;
    while (buf.length - offset >= EVENT_SIZE) {
      const type = buf.readUInt16LE(offset + TYPE_OFFSET);
      const code = buf.readUInt16LE(offset + CODE_OFFSET);
      const value = buf.readInt32LE(offset + VALUE_OFFSET);
      onEvent({ type, code, value });
      offset += EVENT_SIZE;
    }
    leftover = offset < buf.length ? buf.subarray(offset) : Buffer.alloc(0);
  });

  let closed = false;
  function closeOnce(reason: "end" | "error", error?: Error) {
    if (closed) return;
    closed = true;
    onClose(reason, error);
  }

  stream.on("end", () => closeOnce("end"));
  stream.on("error", (err) => closeOnce("error", err));

  return {
    close: () => {
      if (closed) return;
      closed = true;
      stream.destroy();
    },
  };
}
