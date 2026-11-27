// 錄製:螢幕分享 → 框選裁切 → MediaRecorder(D-0008 第 2 點)

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 選分頁、視窗或整個螢幕。不收音(影片是無聲的,D-0008 第 3 點)。 */
export async function pickScreen(frameRate: number): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: frameRate } },
    audio: false,
  });
}

/**
 * 改變來源的格率上限。螢幕分享只在畫面有變動時送新格,畫面靜止時實際格率會低很多。
 * 失敗時(瀏覽器不接受)維持原本的格率,回傳 false。
 */
export async function setFrameRate(track: MediaStreamVideoTrack, frameRate: number): Promise<boolean> {
  try {
    await track.applyConstraints({ frameRate: { ideal: frameRate, max: frameRate } });
    return true;
  } catch {
    return false;
  }
}

/** H.264 等編碼器要求寬高與位移是偶數;框選範圍往內取偶數,並限制在畫面內。 */
export function evenRect(r: Rect, maxW: number, maxH: number): Rect {
  const x = Math.max(0, Math.min(maxW - 2, Math.ceil(r.x / 2) * 2));
  const y = Math.max(0, Math.min(maxH - 2, Math.ceil(r.y / 2) * 2));
  const width = Math.max(2, Math.floor(Math.min(r.width - (x - r.x), maxW - x) / 2) * 2);
  const height = Math.max(2, Math.floor(Math.min(r.height - (y - r.y), maxH - y) / 2) * 2);
  return { x, y, width, height };
}

/** 依序找出瀏覽器支援的錄製格式。M1 要實測 Chrome 能否直接錄 MP4(D-0008 第 7 點)。 */
export const RECORDER_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=av01',
  'video/webm;codecs=vp8',
  'video/webm;codecs=h264',
  'video/mp4;codecs=avc1',
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=av01',
  'video/mp4;codecs=vp9',
  'video/mp4',
] as const;

export function recorderSupport(): { type: string; supported: boolean }[] {
  return RECORDER_TYPES.map((type) => ({
    type,
    supported: typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
  }));
}

/**
 * 只留框內畫面的影像軌。
 *
 * 用 MediaStreamTrackProcessor 逐格讀取,而不是 requestAnimationFrame 畫 canvas:
 * 錄別的視窗時本頁常在背景,rAF 會被瀏覽器降頻或暫停,錄出來會掉格。
 */
export function croppedTrack(
  source: MediaStreamVideoTrack,
  crop: Rect,
  scale = 1,
): { track: MediaStreamTrack; stop: () => void } {
  const processor = new MediaStreamTrackProcessor({ track: source });
  const generator = new MediaStreamTrackGenerator({ kind: 'video' });
  const canvas = new OffscreenCanvas(crop.width * scale, crop.height * scale);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('無法建立 2D canvas');
  // 放大時每個像素直接複製成 scale×scale,不內插:目的是讓影片的 4:2:0 色度取樣
  // 落在放大後的格子上,縮回原尺寸看時顏色接近完整解析度
  ctx.imageSmoothingEnabled = false;

  const abort = new AbortController();
  const transform = new TransformStream<VideoFrame, VideoFrame>({
    transform(frame, controller) {
      try {
        ctx.drawImage(frame, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
        controller.enqueue(new VideoFrame(canvas, { timestamp: frame.timestamp }));
      } finally {
        frame.close();
      }
    },
  });
  processor.readable
    .pipeThrough(transform, { signal: abort.signal })
    .pipeTo(generator.writable, { signal: abort.signal })
    .catch(() => {
      // 停止錄影時中斷管線,預期會丟出 AbortError
    });

  return {
    track: generator,
    stop: () => {
      abort.abort();
      generator.stop();
    },
  };
}

export interface Recording {
  blob: Blob;
  mimeType: string;
  /** 從按下開始到停止的實際時間(秒);MediaRecorder 的 WebM 不一定寫入長度 */
  wallSeconds: number;
}

/**
 * 一次錄一段。`onstop` 在開始時就掛上：使用者按瀏覽器的「停止共用」時，來源軌結束,
 * MediaRecorder 會自己停止，不經過 `stop()`;這時 `finished` 一樣會收到錄好的影片。
 */
export class Recorder {
  private recorder: MediaRecorder | null = null;
  private done: Promise<Recording> | null = null;

  /** 已開始、還沒收尾(包含 MediaRecorder 已自己停止、正在整理輸出的那一刻) */
  get active(): boolean {
    return this.recorder !== null;
  }

  /** 這一段錄完時 resolve;沒有在錄時是 null */
  get finished(): Promise<Recording> | null {
    return this.done;
  }

  /** `scale`:錄製放大倍數(1 或 2) */
  start(source: MediaStreamVideoTrack, crop: Rect, mimeType: string, bitsPerSecond: number, scale = 1): void {
    if (this.recorder) throw new Error('已經在錄影');
    const { track, stop } = croppedTrack(source, crop, scale);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(new MediaStream([track]), { mimeType, videoBitsPerSecond: bitsPerSecond });
    } catch (e) {
      stop();
      throw e;
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const startedAt = performance.now();
    this.done = new Promise((resolve) => {
      recorder.onstop = () => {
        stop();
        this.recorder = null;
        this.done = null;
        resolve({
          blob: new Blob(chunks, { type: recorder.mimeType }),
          mimeType: recorder.mimeType,
          wallSeconds: (performance.now() - startedAt) / 1000,
        });
      };
    });
    this.recorder = recorder;
    try {
      recorder.start(1000);
    } catch (e) {
      stop();
      this.recorder = null;
      this.done = null;
      throw e;
    }
  }

  stop(): Promise<Recording> {
    const { recorder, done } = this;
    if (!recorder || !done) return Promise.reject(new Error('沒有在錄影'));
    if (recorder.state !== 'inactive') recorder.stop();
    return done;
  }
}
