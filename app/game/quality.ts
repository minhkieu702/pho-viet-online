/** Graphics presets and the frame-pacing monitor that drives automatic quality. */
export type QualityMode = 'auto' | 'high' | 'medium' | 'low';
export type QualityLevel = { label: string; shadows: boolean; shadowSize: number; maxDpr: number; scale: number };

// Ordered from best looking to fastest; automatic mode steps one level at a time.
export const QUALITY_LEVELS: QualityLevel[] = [
  { label: 'Cao', shadows: true, shadowSize: 2048, maxDpr: 1.75, scale: 1 },
  { label: 'Cân bằng', shadows: true, shadowSize: 1024, maxDpr: 1.25, scale: 1 },
  { label: 'Cân bằng', shadows: true, shadowSize: 1024, maxDpr: 1.25, scale: 0.85 },
  { label: 'Hiệu năng', shadows: false, shadowSize: 0, maxDpr: 1, scale: 0.9 },
  { label: 'Hiệu năng', shadows: false, shadowSize: 0, maxDpr: 1, scale: 0.75 },
  { label: 'Tối thiểu', shadows: false, shadowSize: 0, maxDpr: 1, scale: 0.6 },
];

export const MODE_LEVEL: Record<Exclude<QualityMode, 'auto'>, number> = { high: 0, medium: 1, low: 4 };

/** True when WebGL fell back to a CPU rasteriser because hardware acceleration is off or blocked. */
export function isSoftwareGpu(name: string) {
  return /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(name);
}

/** Reads the GPU name the browser exposes for a WebGL context. */
export function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
}

/** Picks a starting level from the GPU name and device class so weak machines never start on the heaviest preset. */
export function detectStartLevel() {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const cores = nav.hardwareConcurrency || 4;
    const memory = nav.deviceMemory ?? 8;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    let gpu = '';
    if (gl) {
      gpu = gpuName(gl).toLowerCase();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    if (isSoftwareGpu(gpu)) return 5;
    const discrete = /nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m\d (pro|max|ultra)/.test(gpu);
    const weak = /intel.*(hd|uhd)|mali|adreno [1-5]|powervr|videocore/.test(gpu) || cores <= 4 || memory <= 4;
    if (discrete && !coarse && cores >= 6) return 0;
    if (weak || coarse) return 3;
    return 1;
  } catch {
    return 2;
  }
}

const REFRESH_RATES = [60, 75, 90, 100, 120, 144, 165, 240];

/**
 * Compares each second of frame intervals against the display refresh rate guessed from the fastest frames.
 * `sample` returns -1 when frames are being dropped, +1 after several clean seconds, otherwise 0.
 */
export function createFrameMonitor() {
  const samples: number[] = [];
  let windowStart = 0;
  let frames = 0;
  let fps = 0;
  let clean = 0;
  return {
    get fps() { return fps; },
    sample(now: number, interval: number) {
      if (!windowStart) windowStart = now;
      frames++;
      if (interval > 0 && interval < 100) samples.push(interval);
      if (now - windowStart < 1000) return 0;
      fps = Math.round(frames * 1000 / (now - windowStart));
      windowStart = now;
      frames = 0;
      if (samples.length < 20) {
        samples.length = 0;
        return 0;
      }
      samples.sort((a, b) => a - b);
      const fastest = samples[Math.floor(samples.length * 0.1)];
      const median = samples[Math.floor(samples.length * 0.5)];
      samples.length = 0;
      const guess = 1000 / fastest;
      const refresh = REFRESH_RATES.find((rate) => Math.abs(rate - guess) / rate < 0.09) ?? 120;
      const budget = 1000 / refresh;
      if (median > budget * 1.2 || median > 1000 / 50) {
        clean = 0;
        return -1;
      }
      clean = median <= budget * 1.06 ? clean + 1 : 0;
      if (clean >= 4) {
        clean = 0;
        return 1;
      }
      return 0;
    },
  };
}
