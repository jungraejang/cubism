/**
 * Push-to-talk MediaRecorder wrapper for the AI Assistant module.
 *
 * Design goals:
 *  - Lazy permission: mic permission is only requested on first record, not
 *    when the module mounts. Re-using the same `MediaStream` across record
 *    cycles means subsequent prompts don't blink the permission UI.
 *  - Single-shot result: `stop()` returns the encoded blob as ArrayBuffer +
 *    mime so the caller can ship it over Socket.IO without extra glue.
 *  - Live audio level: the analyser feeding `getLevel()` lets the renderer
 *    paint a meter while the user is talking.
 *  - Idempotent teardown: `dispose()` is safe to call multiple times and
 *    handles partial init states (e.g. permission denied before the
 *    recorder ever ran).
 */

export type RecorderResult = {
  audio: ArrayBuffer;
  mime: string;
  durationMs: number;
};

type ActiveRecording = {
  recorder: MediaRecorder;
  chunks: Blob[];
  mime: string;
  startedAt: number;
};

/**
 * Pick the first MediaRecorder mime type the browser actually supports.
 * Whisper handles webm/opus, ogg/opus, and mp4 natively, so we just try
 * common ones in preference order. Falling back to the empty string lets
 * the browser pick its default.
 */
function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

export class PushToTalkRecorder {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private active: ActiveRecording | null = null;
  /**
   * Buffer reused across `getLevel()` calls. Typed with the explicit
   * `ArrayBuffer` generic (not the wider `ArrayBufferLike`) so it matches
   * the `getByteTimeDomainData` overload's expectation. `new Uint8Array(N)`
   * narrows correctly when allocated, so storing it as the wider type
   * loses information.
   */
  private levelBuf: Uint8Array<ArrayBuffer> | null = null;

  /** Ensure mic permission and the persistent stream/analyser are ready. */
  async prepare(): Promise<void> {
    if (this.stream) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      throw new Error("Microphone API is not available in this environment.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    this.stream = stream;

    // The analyser lets the UI draw a live level meter. We feed the same
    // stream into both the analyser (for visualisation) and the
    // MediaRecorder (for shipping the audio to the server) — they read
    // independently.
    const ACtor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new ACtor();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);

    this.audioCtx = ctx;
    this.source = source;
    this.analyser = analyser;
    this.levelBuf = new Uint8Array(analyser.fftSize);
  }

  /**
   * True 0..1 RMS level for the most recent analyser frame. Returns 0
   * while not recording / before `prepare()` finishes.
   */
  getLevel(): number {
    const analyser = this.analyser;
    const buf = this.levelBuf;
    if (!analyser || !buf) return 0;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / buf.length) * 2);
  }

  isRecording(): boolean {
    return this.active !== null;
  }

  async start(): Promise<void> {
    await this.prepare();
    if (!this.stream) throw new Error("Microphone stream unavailable.");
    if (this.active) return;

    const mime = pickMime();
    const recorder = mime
      ? new MediaRecorder(this.stream, { mimeType: mime })
      : new MediaRecorder(this.stream);
    const chunks: Blob[] = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    });
    this.active = {
      recorder,
      chunks,
      mime: recorder.mimeType || mime || "audio/webm",
      startedAt: performance.now(),
    };
    // 250ms timeslice gives us partial chunks even on very short presses.
    recorder.start(250);
  }

  /**
   * Stop the in-flight recording and resolve with the encoded blob. Throws
   * if no recording is in progress.
   */
  stop(): Promise<RecorderResult> {
    const active = this.active;
    if (!active) {
      return Promise.reject(new Error("No active recording."));
    }
    return new Promise((resolve, reject) => {
      active.recorder.addEventListener(
        "stop",
        async () => {
          try {
            const blob = new Blob(active.chunks, { type: active.mime });
            const audio = await blob.arrayBuffer();
            this.active = null;
            resolve({
              audio,
              mime: active.mime,
              durationMs: performance.now() - active.startedAt,
            });
          } catch (err) {
            this.active = null;
            reject(err);
          }
        },
        { once: true },
      );
      active.recorder.addEventListener(
        "error",
        (event) => {
          this.active = null;
          reject(
            (event as unknown as { error?: Error }).error ??
              new Error("MediaRecorder error"),
          );
        },
        { once: true },
      );
      try {
        active.recorder.stop();
      } catch (err) {
        this.active = null;
        reject(err);
      }
    });
  }

  /** Tear everything down — call from the Renderer's unmount cleanup. */
  dispose(): void {
    if (this.active) {
      try {
        this.active.recorder.stop();
      } catch {
        /* ignore — we're shutting down */
      }
      this.active = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        /* ignore */
      }
      this.source = null;
    }
    this.analyser = null;
    this.levelBuf = null;
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => undefined);
      this.audioCtx = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
  }
}
