/**
 * Shared canvas drawing routine for the oscilloscope waveform. Used by both
 * the desktop's preview canvas and the renderer's full-screen visualizer so
 * styling stays in sync.
 */
export type DrawWaveformOptions = {
  width: number;
  height: number;
  lineColor: string;
  glowColor: string;
  gridColor: string;
  lineWidth: number;
  /** Multiplier applied to each sample's vertical deflection. */
  sensitivity: number;
  showGrid: boolean;
  /**
   * Skip the `shadowBlur` glow pass on Pi-class hardware. Canvas
   * `shadowBlur` is the single most expensive 2D operation on the Pi's
   * software rasterizer; in perf mode we fake the glow with a wider
   * translucent underlay stroke (a couple of cheap strokes) which reads
   * almost identically on a 1080p panel but costs a fraction as much.
   */
  performanceMode?: boolean;
};

export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  samples: Uint8Array,
  opts: DrawWaveformOptions,
): void {
  const {
    width,
    height,
    lineColor,
    glowColor,
    gridColor,
    lineWidth,
    sensitivity,
    showGrid,
    performanceMode = false,
  } = opts;

  ctx.clearRect(0, 0, width, height);

  if (showGrid) {
    ctx.save();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    const verticalLines = 8;
    for (let i = 1; i < verticalLines; i++) {
      const x = (width * i) / verticalLines;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    [0.5, 0.25, 0.75].forEach((t) => {
      ctx.beginPath();
      ctx.globalAlpha = t === 0.5 ? 0.9 : 0.4;
      ctx.moveTo(0, height * t);
      ctx.lineTo(width, height * t);
      ctx.stroke();
    });
    ctx.restore();
  }

  if (samples.length === 0) return;

  // Trace the waveform straight onto the context path rather than into a
  // throwaway `Path2D` — saves one allocation every frame and lets us
  // re-stroke the same path for the glow passes without rebuilding it.
  const mid = height / 2;
  const step = width / (samples.length - 1);
  ctx.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const v = (samples[i] - 128) / 128;
    const y = mid - v * mid * sensitivity;
    const x = i * step;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (performanceMode) {
    // Fake glow: one wide, translucent underlay stroke instead of
    // `shadowBlur`. No blur kernel means the rasterizer only fills a
    // fatter line — cheap enough to stay real-time on the Pi.
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = lineWidth * 2.5;
    ctx.globalAlpha = 0.25;
    ctx.stroke();
  } else {
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = lineWidth * 3;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = lineWidth * 6;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.globalAlpha = 1;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}
