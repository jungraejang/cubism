import {
  startCapture,
  type CaptureSession,
  type WaveformFrame,
} from "./capture";
import type { AudioSource } from "./config";

/**
 * Module-level singleton holding the live capture session. Living outside
 * any React component means the underlying MediaStream/AudioContext survive
 * when the VisualizerControls component unmounts (which happens every time
 * the user switches to a different module).
 *
 * The Controls component subscribes a "frame sink" on mount and clears it
 * on unmount; the capture pipeline keeps feeding the sink only while one is
 * registered. Capture is only ever torn down when:
 *   - the user explicitly clicks Stop,
 *   - a new source is started (which replaces the current session), or
 *   - the browser ends the underlying audio track (user clicks the "stop
 *     sharing" pill, closes the source tab, etc.).
 */

type FrameSink = (frame: WaveformFrame) => void;

let session: CaptureSession | null = null;
let activeSource: AudioSource | null = null;
let sink: FrameSink | null = null;
let lastFrame: WaveformFrame | null = null;
const sessionListeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of sessionListeners) {
    listener();
  }
}

export function setFrameSink(next: FrameSink | null): void {
  sink = next;
}

export function getLastFrame(): WaveformFrame | null {
  return lastFrame;
}

export function getActiveSource(): AudioSource | null {
  return activeSource;
}

export function isCapturing(): boolean {
  return session !== null;
}

export function subscribeSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

export async function startSession(source: AudioSource): Promise<void> {
  if (session) {
    const prev = session;
    session = null;
    activeSource = null;
    lastFrame = null;
    prev.stop();
  }

  const next = await startCapture(
    source,
    (frame) => {
      lastFrame = frame;
      sink?.(frame);
    },
    () => {
      if (session === next) {
        session = null;
        activeSource = null;
        lastFrame = null;
        notifyListeners();
      }
    },
  );

  session = next;
  activeSource = source;
  notifyListeners();
}

export function stopSession(): void {
  if (!session) return;
  const prev = session;
  session = null;
  activeSource = null;
  lastFrame = null;
  prev.stop();
  notifyListeners();
}
