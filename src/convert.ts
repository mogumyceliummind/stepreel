// 瀏覽器內轉檔(D-0008 第 5 點、D-0010)。M1 用來實測各格式的大小與畫質。

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  WebMOutputFormat,
  canEncodeVideo,
  type InputVideoTrack,
  type Quality,
  type VideoCodec,
} from 'mediabunny';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { muxAnimatedWebp, type WebpFrame } from './webp-anim';

export interface VideoInfo {
  width: number;
  height: number;
  /** 秒 */
  duration: number;
  frames: number;
  codec: string | null;
}

export interface Result {
  label: string;
  blob?: Blob;
  ms?: number;
  width?: number;
  height?: number;
  /** 動圖實際寫入的格數(相同畫面合併後) */
  frames?: number;
  error?: string;
}

export type QualityName = 'medium' | 'high';
const QUALITY: Record<QualityName, Quality> = { medium: QUALITY_MEDIUM, high: QUALITY_HIGH };

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

async function openVideo(blob: Blob): Promise<{ input: Input; track: InputVideoTrack; start: number; end: number }> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('檔案裡沒有影像軌');
  const start = await track.getFirstTimestamp();
  const end = await track.computeDuration();
  return { input, track, start, end };
}

export async function probe(blob: Blob): Promise<VideoInfo> {
  const { input, track, start, end } = await openVideo(blob);
  try {
    let frames = 0;
    const sink = new CanvasSink(track, { width: 16, height: 16, fit: 'fill' });
    for await (const _ of sink.canvases()) frames++;
    return { width: track.displayWidth, height: track.displayHeight, duration: end - start, frames, codec: track.codec };
  } finally {
    input.dispose();
  }
}

/** 重新編碼成 MP4 / WebM,保留原本每一格的時間(螢幕錄影的格率不固定)。 */
export async function encodeVideo(
  blob: Blob,
  label: string,
  codec: VideoCodec,
  container: 'mp4' | 'webm',
  qualityName: QualityName,
): Promise<Result> {
  const t0 = performance.now();
  const { input, track, start } = await openVideo(blob);
  try {
    const width = even(track.displayWidth);
    const height = even(track.displayHeight);
    const quality = QUALITY[qualityName];
    if (!(await canEncodeVideo(codec, { width, height, quality }))) {
      return { label, error: `這個瀏覽器不能編碼 ${codec}(${width}×${height})` };
    }
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('無法建立 2D canvas');

    const target = new BufferTarget();
    const output = new Output({
      format: container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
      target,
    });
    const source = new CanvasSource(canvas, { codec, quality });
    output.addVideoTrack(source);
    await output.start();

    const sink = new CanvasSink(track, { width, height, fit: 'fill', poolSize: 2 });
    for await (const frame of sink.canvases()) {
      ctx.drawImage(frame.canvas, 0, 0);
      await source.add(frame.timestamp - start, frame.duration);
    }
    await output.finalize();
    if (!target.buffer) throw new Error('編碼沒有產生輸出');
    return {
      label,
      blob: new Blob([target.buffer], { type: container === 'mp4' ? 'video/mp4' : 'video/webm' }),
      ms: performance.now() - t0,
      width,
      height,
    };
  } catch (e) {
    return { label, error: e instanceof Error ? e.message : String(e) };
  } finally {
    input.dispose();
  }
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SampledFrame {
  image: ImageData;
  /** 和前一格不同的範圍;第一格是整個畫面;和前一格完全相同時是 null */
  dirty: Rect | null;
}

/** 和前一格比對,找出有變動的範圍(位置往外取偶數,給 WebP 用)。 */
function diffRect(prev: Uint32Array, cur: Uint32Array, w: number, h: number): Rect | null {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (prev[row + x] !== cur[row + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const x = minX - (minX % 2);
  const y = minY - (minY % 2);
  return { x, y, width: maxX + 1 - x, height: maxY + 1 - y };
}

/** 以固定格率取樣(動圖不支援不固定格率),縮放後逐格回傳。 */
async function* sampleFrames(blob: Blob, fps: number, scale: number): AsyncGenerator<SampledFrame & { width: number; height: number }> {
  const { input, track, start, end } = await openVideo(blob);
  try {
    const width = even(track.displayWidth * scale);
    const height = even(track.displayHeight * scale);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!ctx) throw new Error('無法建立 2D canvas');
    const times: number[] = [];
    for (let t = start; t < end; t += 1 / fps) times.push(t);

    const sink = new CanvasSink(track, { width, height, fit: 'fill', poolSize: 2 });
    let prev: Uint32Array | null = null;
    for await (const frame of sink.canvasesAtTimestamps(times)) {
      if (frame) ctx.drawImage(frame.canvas, 0, 0);
      else {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
      }
      const image = ctx.getImageData(0, 0, width, height);
      const cur = new Uint32Array(image.data.buffer);
      const dirty = prev ? diffRect(prev, cur, width, height) : { x: 0, y: 0, width, height };
      prev = cur;
      yield { image, dirty, width, height };
    }
  } finally {
    input.dispose();
  }
}

/** 動態 WebP:每格只編碼變動的範圍,相同的格合併成較長的一格。 */
export async function encodeWebp(blob: Blob, label: string, fps: number, scale: number, quality: number): Promise<Result> {
  const t0 = performance.now();
  try {
    const step = 1000 / fps;
    const frames: WebpFrame[] = [];
    let size = { width: 0, height: 0 };
    const full = new OffscreenCanvas(1, 1);
    const fullCtx = full.getContext('2d', { alpha: false });
    if (!fullCtx) throw new Error('無法建立 2D canvas');

    for await (const f of sampleFrames(blob, fps, scale)) {
      size = { width: f.width, height: f.height };
      const last = frames.at(-1);
      if (!f.dirty && last) {
        last.duration += step;
        continue;
      }
      const r = f.dirty ?? { x: 0, y: 0, width: f.width, height: f.height };
      const part = new OffscreenCanvas(r.width, r.height);
      const partCtx = part.getContext('2d', { alpha: false });
      if (!partCtx) throw new Error('無法建立 2D canvas');
      partCtx.putImageData(f.image, -r.x, -r.y, r.x, r.y, r.width, r.height);
      const out = await part.convertToBlob({ type: 'image/webp', quality });
      if (out.type !== 'image/webp') return { label, error: '這個瀏覽器不能編碼 WebP' };
      frames.push({ image: new Uint8Array(await out.arrayBuffer()), ...r, duration: step });
    }
    if (frames.length === 0) throw new Error('沒有任何畫面');
    const bytes = muxAnimatedWebp(size.width, size.height, frames);
    return {
      label,
      blob: new Blob([bytes], { type: 'image/webp' }),
      ms: performance.now() - t0,
      ...size,
      frames: frames.length,
    };
  } catch (e) {
    return { label, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * GIF:每格 256 色。gifenc 不支援只寫部分範圍,所以每格都是整個畫面;
 * 相同的格合併成較長的一格。
 */
export async function encodeGif(blob: Blob, label: string, fps: number, scale: number): Promise<Result> {
  const t0 = performance.now();
  try {
    const step = 1000 / fps;
    const gif = GIFEncoder();
    let size = { width: 0, height: 0 };
    let pending: { index: Uint8Array; palette: number[][]; duration: number } | null = null;
    let written = 0;
    const flush = () => {
      if (!pending) return;
      gif.writeFrame(pending.index, size.width, size.height, { palette: pending.palette, delay: pending.duration });
      written++;
    };

    for await (const f of sampleFrames(blob, fps, scale)) {
      size = { width: f.width, height: f.height };
      if (!f.dirty && pending) {
        pending.duration += step;
        continue;
      }
      flush();
      const palette = quantize(f.image.data, 256, { format: 'rgb565' });
      pending = { index: applyPalette(f.image.data, palette, 'rgb565'), palette, duration: step };
    }
    flush();
    if (written === 0) throw new Error('沒有任何畫面');
    gif.finish();
    return {
      label,
      blob: new Blob([gif.bytes()], { type: 'image/gif' }),
      ms: performance.now() - t0,
      ...size,
      frames: written,
    };
  } catch (e) {
    return { label, error: e instanceof Error ? e.message : String(e) };
  }
}
