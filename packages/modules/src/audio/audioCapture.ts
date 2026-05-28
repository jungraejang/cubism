import { WAVEFORM_SAMPLE_COUNT, type AudioSource } from "./config";

/**
 * Active audio-capture session. Owns the MediaStream, AudioContext and an
 * AnalyserNode; exposes a `start(onFrame)` callback that fires at the
 * browser's animation cadence with the latest downsampled waveform.
 *
 * The capture pipeline:
 *   getDisplayMedia / getUserMedia
 *     -> MediaStreamSource
 *     -> AnalyserNode (fftSize 2048, byteTimeDomainData = Uint8 [0,255])
 *     -> Worker-driven tick (~60 Hz, unthrottled in background tabs)
 *        -> downsample to WAVEFORM_SAMPLE_COUNT
 *        -> onFrame(samples, peak)
 *
 * We deliberately drive the loop from a dedicated Web Worker rather than
 * `requestAnimationFrame`, because rAF is paused (or throttled to ~1 Hz)
 * in background tabs. The user expects the renderer to keep displaying
 * waveforms even when the desktop control panel isn't the active tab, so
 * we need a timer source that the browser doesn't throttle. Worker
 * `setInterval` keeps firing while the tab is hidden.
 *
 * The downsample step picks max-deviation samples per bucket so transients
 * aren't averaged away on quiet music.
 */
export type AudioCaptureSession = {
  stop: () => void;
  source: AudioSource;
};

export type WaveformFrame = {
  /** Uint8 samples; 128 is silence, 0/255 are extremes. */
  samples: Uint8Array;
  /** Largest absolute deviation from 128 in this frame, normalized to [0,1]. */
  peak: number;
};

/**
 * Start capturing audio from the chosen source. Returns a session handle.
 * Throws if the user denies permission or the source isn't available.
 *
 * `onEnd` is called once when capture is fully torn down — either because
 * the caller invoked `session.stop()` or because the browser ended the
 * underlying audio track (user clicked "stop sharing" in the pill, closed
 * the source tab, etc.). Useful for keeping external state in sync.
 */
export async function startAudioCapture(
  source: AudioSource,
  onFrame: (frame: WaveformFrame) => void,
  onEnd?: () => void,
): Promise<AudioCaptureSession> {
  const stream = await acquireStream(source);

  // Some browsers fire `getDisplayMedia` and return without an audio track if
  // the user forgot to tick the "share audio" checkbox. Detect that early.
  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(
      source === "display"
        ? "No audio in the captured stream — re-share and tick \"Share audio\"."
        : "Microphone permission granted but no audio track was returned.",
    );
  }

  const AudioCtor =
    (typeof AudioContext !== "undefined" && AudioContext) ||
    (
      window as unknown as {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!AudioCtor) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("Web Audio API is not available in this browser.");
  }

  const ctx = new AudioCtor();
  // Resume in case of autoplay-policy suspended state.
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => undefined);
  }

  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0; // raw oscilloscope, no smoothing
  src.connect(analyser);
  // We deliberately do NOT connect to ctx.destination — playing audio back
  // would cause feedback when source is mic, and double-playback for tab.

  const raw = new Uint8Array(analyser.fftSize);
  const downsampled = new Uint8Array(WAVEFORM_SAMPLE_COUNT);
  const bucketSize = analyser.fftSize / WAVEFORM_SAMPLE_COUNT;

  let stopped = false;

  function tick() {
    if (stopped) return;
    analyser.getByteTimeDomainData(raw);

    /*
     * Downsample by picking the sample with the largest deviation from the
     * 128 midpoint in each bucket. Average would dampen real waveform shape.
     */
    let peak = 0;
    for (let i = 0; i < WAVEFORM_SAMPLE_COUNT; i++) {
      const start = Math.floor(i * bucketSize);
      const end = Math.floor((i + 1) * bucketSize);
      let best = 128;
      let bestDeviation = 0;
      for (let j = start; j < end; j++) {
        const dev = Math.abs(raw[j] - 128);
        if (dev > bestDeviation) {
          bestDeviation = dev;
          best = raw[j];
        }
      }
      downsampled[i] = best;
      if (bestDeviation > peak) peak = bestDeviation;
    }

    // Copy so the consumer is free to retain the buffer.
    const out = new Uint8Array(downsampled);
    onFrame({ samples: out, peak: peak / 128 });
  }

  /*
   * Background-tab-safe ticker. The worker's setInterval keeps firing at
   * the requested rate regardless of whether the page is the foreground
   * tab. ~16 ms target ≈ 60 Hz.
   */
  const ticker = createBackgroundTicker(16, tick);

  function stop() {
    if (stopped) return;
    stopped = true;
    ticker.stop();
    try {
      src.disconnect();
    } catch {
      // ignore
    }
    void ctx.close().catch(() => undefined);
    stream.getTracks().forEach((t) => t.stop());
    onEnd?.();
  }

  /*
   * If the user revokes capture from the browser's "sharing" pill, the audio
   * tracks fire `ended`. Auto-clean up so we don't keep spinning the RAF.
   */
  stream.getAudioTracks().forEach((track) => {
    track.addEventListener("ended", () => stop());
  });

  return { stop, source };
}

type BackgroundTicker = {
  stop: () => void;
};

/**
 * Drives a tick callback at roughly the requested interval (ms) using a
 * Web Worker so the browser doesn't throttle it when the tab is in the
 * background. Falls back to setInterval on the main thread if Workers are
 * unavailable for any reason (still better than rAF, which fully pauses).
 *
 * The worker's only job is to post a message every N ms; the actual
 * analyser read still happens on the main thread because AudioContext nodes
 * aren't transferable to workers.
 */
function createBackgroundTicker(
  intervalMs: number,
  onTick: () => void,
): BackgroundTicker {
  if (typeof Worker === "undefined") {
    const id = window.setInterval(onTick, intervalMs);
    return { stop: () => window.clearInterval(id) };
  }

  const workerSource = `
    let id = 0;
    self.onmessage = (e) => {
      const data = e.data;
      if (data && data.type === "start") {
        if (id) clearInterval(id);
        id = setInterval(() => self.postMessage("tick"), data.interval);
      } else if (data && data.type === "stop") {
        if (id) clearInterval(id);
        id = 0;
      }
    };
  `;
  let worker: Worker;
  let blobUrl: string | null = null;
  try {
    const blob = new Blob([workerSource], { type: "application/javascript" });
    blobUrl = URL.createObjectURL(blob);
    worker = new Worker(blobUrl);
  } catch {
    // CSP can block blob: workers in some environments. Fall back.
    const id = window.setInterval(onTick, intervalMs);
    return { stop: () => window.clearInterval(id) };
  }

  worker.onmessage = () => onTick();
  worker.postMessage({ type: "start", interval: intervalMs });

  return {
    stop: () => {
      try {
        worker.postMessage({ type: "stop" });
        worker.terminate();
      } catch {
        // ignore
      }
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    },
  };
}

async function acquireStream(source: AudioSource): Promise<MediaStream> {
  if (source === "display") {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error(
        "Display capture is not supported in this browser. Try Microphone.",
      );
    }
    // Chrome requires a video track to be requested alongside audio; we
    // immediately stop the video track since we don't need it.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: { channelCount: 2 },
      video: true,
    });
    stream.getVideoTracks().forEach((t) => t.stop());
    return stream;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone capture is not supported in this browser.");
  }
  return navigator.mediaDevices.getUserMedia({ audio: true });
}
