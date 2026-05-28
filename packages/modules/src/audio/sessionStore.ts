import {
  startAudioCapture,
  type AudioCaptureSession,
  type WaveformFrame,
} from "./audioCapture";
import type { AudioSource } from "./config";

/**
 * Module-level singleton holding the live audio capture session. Living
 * outside any React component means the underlying MediaStream/AudioContext
 * survive when the AudioControls component unmounts (which happens every
 * time the user switches to a different module).
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

let session: AudioCaptureSession | null = null;
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

/**
 * Subscribe to session start/stop events. Returns an unsubscribe fn.
 * The listener is invoked synchronously after every state change so React
 * components can update their UI without polling.
 */
export function subscribeSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

export async function startSession(source: AudioSource): Promise<void> {
  // Tear down any existing session before starting a new one. We bypass the
  // listener notification here because the new session below will fire one.
  if (session) {
    const prev = session;
    session = null;
    activeSource = null;
    lastFrame = null;
    prev.stop();
  }

  const next = await startAudioCapture(
    source,
    (frame) => {
      lastFrame = frame;
      sink?.(frame);
    },
    () => {
      // Browser-initiated end (e.g. user stops sharing). Mirror to store
      // unless this session was already replaced by a newer one.
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
  prev.stop(); // will invoke onEnd, but session is already null so it no-ops
  notifyListeners();
}
