import {
  FREQUENCY_BIN_COUNT,
  WAVEFORM_SAMPLE_COUNT,
  type AudioSource,
} from "./config";

/**
 * Active audio-capture session. Owns the MediaStream, AudioContext and an
 * AnalyserNode; exposes a `start(onFrame)` callback that fires at ~60Hz
 * with both the latest downsampled waveform and the log-spaced frequency
 * spectrum.
 *
 * The capture pipeline:
 *   getDisplayMedia / getUserMedia
 *     -> MediaStreamSource
 *     -> AnalyserNode (fftSize 2048)
 *     -> Worker-driven tick (~60 Hz, unthrottled in background tabs)
 *        -> downsample to WAVEFORM_SAMPLE_COUNT (time domain)
 *        -> log-bucket to FREQUENCY_BIN_COUNT (frequency domain)
 *        -> onFrame({ samples, freqs, peak })
 *
 * The loop runs from a Web Worker timer (not requestAnimationFrame) so the
 * renderer keeps receiving frames even while the desktop control panel is
 * in a background tab.
 *
 * Downsample notes:
 *  - Time-domain bins use "max deviation" so transients aren't averaged away.
 *  - Frequency-domain bins use log spacing so the radial visualizer has a
 *    perceptually-flat distribution across the audible range.
 */
export type CaptureSession = {
  stop: () => void;
  source: AudioSource;
};

export type WaveformFrame = {
  /** Time-domain Uint8 samples; 128 is silence, 0/255 are extremes. */
  samples: Uint8Array;
  /** Frequency-domain Uint8 magnitudes (log-spaced, 0 = silent, 255 = peak). */
  freqs: Uint8Array;
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
export type StartCaptureOptions = {
  /**
   * Interval (ms) between analyser reads / frame emits. Defaults to ~60Hz.
   * Performance mode passes ~33ms (30Hz) to halve the desktop's per-frame
   * analyser-read + downsample work (and, paired with the Controls emit
   * throttle, the wire rate too).
   */
  tickIntervalMs?: number;
};

export async function startCapture(
  source: AudioSource,
  onFrame: (frame: WaveformFrame) => void,
  onEnd?: () => void,
  options?: StartCaptureOptions,
): Promise<CaptureSession> {
  const tickIntervalMs = options?.tickIntervalMs ?? 16;
  const stream = await acquireStream(source);

  // Some browsers fire `getDisplayMedia` and return without an audio track if
  // the user forgot to tick the "share audio" checkbox. Detect that early.
  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(
      source === "display"
        ? 'No audio in the captured stream — re-share and tick "Share audio".'
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
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => undefined);
  }

  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  // Light smoothing for the radial spectrum so bar heights aren't jittery.
  // The oscilloscope cares about raw shape, but with 0 smoothing the bars
  // look like noise. 0.6 is a good compromise that keeps transients but
  // damps frame-to-frame flicker.
  analyser.smoothingTimeConstant = 0.6;
  src.connect(analyser);
  // We deliberately do NOT connect to ctx.destination — playing audio back
  // would cause feedback when source is mic, and double-playback for tab.

  const rawTime = new Uint8Array(analyser.fftSize);
  const rawFreq = new Uint8Array(analyser.frequencyBinCount);
  const downsampledTime = new Uint8Array(WAVEFORM_SAMPLE_COUNT);
  const downsampledFreq = new Uint8Array(FREQUENCY_BIN_COUNT);
  const timeBucket = analyser.fftSize / WAVEFORM_SAMPLE_COUNT;

  /*
   * Precompute log-spaced frequency-bin ranges.
   *
   * With fftSize=2048 the analyser returns 1024 linear bins covering
   * 0 .. sampleRate/2 Hz (Nyquist). Mapping our 128 bars uniformly
   * across the entire spectrum sounds reasonable but in practice
   * creates a "dead zone": almost no realistic audio source — music,
   * speech, tab audio — contains meaningful energy above ~12 kHz, so
   * the upper third of bars sits permanently at 0 and the visualizer
   * develops a flat trailing edge that breaks symmetric shapes.
   *
   * Solution: confine the log mapping to a perceptually-relevant
   * window of [FREQ_LO_HZ, FREQ_HI_HZ]. Converting Hz to bin index
   * is `bin = freqHz * fftSize / sampleRate`, computed from the
   * actual `ctx.sampleRate` so it adapts to whatever the platform
   * picks (44.1 / 48 / 96 kHz, etc.).
   *
   * Tune the bounds if you ever target very low rumble (lower
   * FREQ_LO_HZ) or content with crisp high-end like cymbals (raise
   * FREQ_HI_HZ). Empirically 40 Hz → 12 kHz covers the energy
   * envelope of practically every consumer audio source.
   */
  const FREQ_LO_HZ = 40;
  const FREQ_HI_HZ = 12_000;
  const nyquist = ctx.sampleRate / 2;
  // `bin = freqHz * fftSize / sampleRate`. Clamp to [1, lastBin] so
  // exotic sample rates can't crash by indexing past `rawFreq`.
  const hzToBin = (hz: number) =>
    Math.max(
      1,
      Math.min(
        analyser.frequencyBinCount - 1,
        (hz * analyser.fftSize) / ctx.sampleRate,
      ),
    );
  const minBin = Math.floor(hzToBin(FREQ_LO_HZ));
  // If the platform Nyquist is below our target ceiling (rare —
  // would need an 8 kHz AudioContext) clamp to it so we never run
  // out of bins to map.
  const maxBin = Math.floor(hzToBin(Math.min(FREQ_HI_HZ, nyquist)));
  const freqRanges: Array<[number, number]> = [];
  for (let i = 0; i < FREQUENCY_BIN_COUNT; i++) {
    const t1 = i / FREQUENCY_BIN_COUNT;
    const t2 = (i + 1) / FREQUENCY_BIN_COUNT;
    const lo = minBin * Math.pow(maxBin / minBin, t1);
    const hi = minBin * Math.pow(maxBin / minBin, t2);
    freqRanges.push([
      Math.floor(lo),
      Math.max(Math.floor(lo) + 1, Math.ceil(hi)),
    ]);
  }

  let stopped = false;

  function tick() {
    if (stopped) return;

    // --- Time domain (oscilloscope) ----------------------------------
    analyser.getByteTimeDomainData(rawTime);
    let peak = 0;
    for (let i = 0; i < WAVEFORM_SAMPLE_COUNT; i++) {
      const start = Math.floor(i * timeBucket);
      const end = Math.floor((i + 1) * timeBucket);
      let best = 128;
      let bestDeviation = 0;
      for (let j = start; j < end; j++) {
        const dev = Math.abs(rawTime[j] - 128);
        if (dev > bestDeviation) {
          bestDeviation = dev;
          best = rawTime[j];
        }
      }
      downsampledTime[i] = best;
      if (bestDeviation > peak) peak = bestDeviation;
    }

    // --- Frequency domain (radial-spectrum) --------------------------
    analyser.getByteFrequencyData(rawFreq);
    for (let i = 0; i < FREQUENCY_BIN_COUNT; i++) {
      const [lo, hi] = freqRanges[i];
      let sum = 0;
      let count = 0;
      for (let j = lo; j < hi && j < rawFreq.length; j++) {
        sum += rawFreq[j];
        count++;
      }
      downsampledFreq[i] = count > 0 ? Math.floor(sum / count) : 0;
    }

    // Copy so the consumer is free to retain the buffers.
    onFrame({
      samples: new Uint8Array(downsampledTime),
      freqs: new Uint8Array(downsampledFreq),
      peak: peak / 128,
    });
  }

  const ticker = createBackgroundTicker(tickIntervalMs, tick);

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
    // Chrome requires a video track alongside audio; we immediately stop
    // the video track since we don't need it.
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
