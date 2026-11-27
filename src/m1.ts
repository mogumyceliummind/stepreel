// M1 格式實測頁(D-0008 第 7 點)。錄製頁在 index.html(D-0013 第 4 點),這頁留給補測。

import './style.css';
import { Recorder, evenRect, pickScreen, recorderSupport, setFrameRate, type Rect } from './capture';
import { encodeGif, encodeVideo, encodeWebp, probe, type QualityName, type Result, type VideoInfo } from './convert';

const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 不存在`);
  return el as T;
};

const pickBtn = $<HTMLButtonElement>('pick');
const recBtn = $<HTMLButtonElement>('rec');
const recState = $('rec-state');
const mimeSel = $<HTMLSelectElement>('mime');
const bitrateSel = $<HTMLSelectElement>('bitrate');
const recFpsSel = $<HTMLSelectElement>('rec-fps');
const recScaleSel = $<HTMLSelectElement>('rec-scale');
const stage = $('stage');
const preview = $<HTMLVideoElement>('preview');
const cropBox = $('crop-box');
const cropInfo = $('crop-info');
const fileInput = $<HTMLInputElement>('file');
const convertSec = $('convert');
const sourceInfo = $('source-info');
const runBtn = $<HTMLButtonElement>('run');
const runState = $('run-state');
const results = $('results');
const copyBtn = $<HTMLButtonElement>('copy');
const md = $('md');

// ---- 錄製格式 ----

const support = recorderSupport();
$('support').innerHTML = support.map((s) => `<li>${s.supported ? '✅' : '❌'} <code>${s.type}</code></li>`).join('');
for (const s of support.filter((s) => s.supported)) {
  mimeSel.add(new Option(s.type, s.type));
}
if (mimeSel.options.length === 0) {
  mimeSel.add(new Option('(不支援 MediaRecorder)', ''));
  pickBtn.disabled = true;
}

// ---- 選畫面、框選 ----

let stream: MediaStream | null = null;
let crop: Rect | null = null;

function videoSize() {
  return { w: preview.videoWidth, h: preview.videoHeight };
}

function showCrop() {
  const { w, h } = videoSize();
  if (!crop || !w) {
    cropBox.hidden = true;
    cropInfo.textContent = w ? `整個畫面 ${w}×${h}` : '';
    return;
  }
  const k = preview.clientWidth / w;
  Object.assign(cropBox.style, {
    left: `${crop.x * k}px`,
    top: `${crop.y * k}px`,
    width: `${crop.width * k}px`,
    height: `${crop.height * k}px`,
  });
  cropBox.hidden = false;
  cropInfo.textContent = `框選 ${crop.width}×${crop.height}(位置 ${crop.x}, ${crop.y};畫面 ${w}×${h})。重新拖拉可以改。`;
}

pickBtn.onclick = async () => {
  try {
    stream?.getTracks().forEach((t) => t.stop());
    stream = await pickScreen(Number(recFpsSel.value));
    crop = null;
    preview.srcObject = stream;
    await preview.play();
    stage.hidden = false;
    recBtn.disabled = false;
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      // 按了瀏覽器的「停止共用」:MediaRecorder 會自己停止，這裡負責收尾
      recBtn.disabled = true;
      if (recorder.active) void stopRecording();
    });
    showCrop();
  } catch (e) {
    recState.textContent = `沒有選到畫面:${e instanceof Error ? e.message : e}`;
  }
};
preview.addEventListener('resize', showCrop);
window.addEventListener('resize', showCrop);

let dragFrom: { x: number; y: number } | null = null;
function toVideo(e: PointerEvent) {
  const r = preview.getBoundingClientRect();
  const k = videoSize().w / r.width;
  return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
}
stage.addEventListener('pointerdown', (e) => {
  if (recorder.active) return;
  dragFrom = toVideo(e);
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', (e) => {
  if (!dragFrom) return;
  const p = toVideo(e);
  const { w, h } = videoSize();
  const raw = {
    x: Math.min(dragFrom.x, p.x),
    y: Math.min(dragFrom.y, p.y),
    width: Math.abs(p.x - dragFrom.x),
    height: Math.abs(p.y - dragFrom.y),
  };
  crop = raw.width < 16 || raw.height < 16 ? null : evenRect(raw, w, h);
  showCrop();
});
stage.addEventListener('pointerup', () => {
  dragFrom = null;
});

// ---- 錄影 ----

const recorder = new Recorder();
let timer = 0;

let stopping = false;
/** 這一段開始錄影時的設定(錄影中改選單不影響這一段) */
let recSettings = { bitrate: 0, fps: 30, scale: 1 };

async function stopRecording() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  let rec;
  try {
    rec = await recorder.stop();
  } finally {
    stopping = false;
    recBtn.textContent = '開始錄影';
  }
  recState.textContent = `錄好了:${rec.mimeType},${fmtBytes(rec.blob.size)},約 ${rec.wallSeconds.toFixed(1)} 秒`;
  const s = recSettings;
  await setSource(rec.blob, `錄影(${rec.mimeType},${s.bitrate / 1e6} Mbps,${s.fps} fps,放大 ${s.scale}×)`, s.scale);
}

recBtn.onclick = async () => {
  if (recorder.active) return stopRecording();
  const track = stream?.getVideoTracks()[0];
  if (!track) return;
  const { w, h } = videoSize();
  const area = crop ?? evenRect({ x: 0, y: 0, width: w, height: h }, w, h);
  recSettings = { bitrate: Number(bitrateSel.value), fps: Number(recFpsSel.value), scale: Number(recScaleSel.value) };
  await setFrameRate(track, recSettings.fps);
  // 記錄實際套用的上限(瀏覽器可能不接受或調整),標籤與 Markdown 才不會寫錯
  const applied = track.getSettings().frameRate;
  if (applied) recSettings.fps = Math.round(applied);
  try {
    recorder.start(track, area, mimeSel.value, recSettings.bitrate, recSettings.scale);
  } catch (e) {
    recState.textContent = `無法開始錄影:${e instanceof Error ? e.message : e}`;
    return;
  }
  recBtn.textContent = '停止';
  const t0 = performance.now();
  timer = window.setInterval(() => {
    recState.textContent = `錄影中 ${((performance.now() - t0) / 1000).toFixed(0)} 秒`;
  }, 250);
};

// ---- 來源 ----

/** `scale`:錄製放大倍數;選檔案時是 1 */
let source: { blob: Blob; label: string; info: VideoInfo; scale: number } | null = null;
let lastResults: Result[] = [];

fileInput.onchange = () => {
  const f = fileInput.files?.[0];
  if (f) void setSource(f, `檔案(${f.type || '未知格式'})`, 1);
};

async function setSource(blob: Blob, label: string, scale: number) {
  sourceInfo.textContent = '讀取中…';
  convertSec.hidden = false;
  try {
    const info = await probe(blob);
    source = { blob, label, info, scale };
    sourceInfo.textContent = `來源:${label},${info.width}×${info.height},${info.duration.toFixed(2)} 秒,${info.frames} 格(平均 ${avgFps(info)} fps),編碼 ${info.codec ?? '未知'},${fmtBytes(blob.size)}`;
    runBtn.disabled = false;
  } catch (e) {
    source = null;
    sourceInfo.textContent = `讀不了這個檔案:${e instanceof Error ? e.message : e}`;
    runBtn.disabled = true;
  }
}

// ---- 轉檔 ----

runBtn.onclick = async () => {
  if (!source) return;
  const { blob, label, info, scale: recScale } = source;
  const quality = $<HTMLSelectElement>('quality').value as QualityName;
  const fps = Number($<HTMLSelectElement>('fps').value);
  const scale = Number($<HTMLSelectElement>('scale').value);
  const webpQ = Number($<HTMLSelectElement>('webp-q').value);
  const qName = quality === 'high' ? '高' : '中';

  runBtn.disabled = true;
  copyBtn.disabled = true;
  results.innerHTML = '';
  lastResults = [];
  const original: Result = { label: `原始錄影:${label}`, blob, width: info.width, height: info.height };
  addResult(original, info.duration, recScale);
  // 動圖縮放以原尺寸(放大前)為 100%
  const gifScale = scale / recScale;

  const jobs: [string, () => Promise<Result>][] = [
    [`MP4 H.264(畫質${qName})`, () => encodeVideo(blob, `MP4 H.264(畫質${qName})`, 'avc', 'mp4', quality)],
    [`WebM VP9(畫質${qName})`, () => encodeVideo(blob, `WebM VP9(畫質${qName})`, 'vp9', 'webm', quality)],
    [`WebM AV1(畫質${qName})`, () => encodeVideo(blob, `WebM AV1(畫質${qName})`, 'av1', 'webm', quality)],
    [
      `動態 WebP(${fps} fps,${scale * 100}%,品質 ${webpQ * 100})`,
      () => encodeWebp(blob, `動態 WebP(${fps} fps,${scale * 100}%,品質 ${webpQ * 100})`, fps, gifScale, webpQ),
    ],
    [`GIF(${fps} fps,${scale * 100}%)`, () => encodeGif(blob, `GIF(${fps} fps,${scale * 100}%)`, fps, gifScale)],
  ];
  for (const [name, job] of jobs) {
    runState.textContent = `轉檔中:${name}…`;
    const r = await job();
    addResult(r, info.duration, r.blob?.type.startsWith('image/') ? 1 : recScale);
  }
  runState.textContent = '完成';
  runBtn.disabled = false;
  copyBtn.disabled = false;
  md.textContent = toMarkdown(info, { quality: qName, fps, scale, webpQ, recScale });
  md.hidden = false;
};

/** `shrink`:顯示時縮小的倍數(錄製放大 2× 的影片縮回原尺寸看) */
function addResult(r: Result, duration: number, shrink: number) {
  lastResults.push(r);
  const card = document.createElement('article');
  card.className = 'result';
  const h = document.createElement('h3');
  h.textContent = r.label;
  card.append(h);
  if (r.error || !r.blob) {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = r.error ?? '沒有輸出';
    card.append(p);
  } else {
    const url = URL.createObjectURL(r.blob);
    const media = r.blob.type.startsWith('image/') ? document.createElement('img') : document.createElement('video');
    if (media instanceof HTMLVideoElement) Object.assign(media, { muted: true, loop: true, autoplay: true, playsInline: true });
    media.src = url;
    if (shrink > 1 && r.width) media.style.width = `${r.width / shrink}px`;
    const p = document.createElement('p');
    p.textContent = [
      fmtBytes(r.blob.size),
      `${fmtBytes(r.blob.size / Math.max(duration, 0.001))}/秒`,
      r.width ? `${r.width}×${r.height}` : '',
      r.frames ? `${r.frames} 格` : '',
      r.ms ? `轉檔 ${(r.ms / 1000).toFixed(1)} 秒` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const links = document.createElement('p');
    const open = Object.assign(document.createElement('a'), { href: url, target: '_blank', textContent: '原尺寸開啟' });
    const dl = Object.assign(document.createElement('a'), { href: url, download: fileName(r), textContent: '下載' });
    links.append(open, ' · ', dl);
    card.append(media, p, links);
  }
  results.append(card);
}

function fileName(r: Result): string {
  const ext = r.blob?.type.split('/')[1]?.split(';')[0] ?? 'bin';
  return `stepreel-m1-${r.label.replace(/[^\w一-龥]+/g, '-').replace(/^-|-$/g, '')}.${ext}`;
}

copyBtn.onclick = async () => {
  await navigator.clipboard.writeText(md.textContent ?? '');
  copyBtn.textContent = '已複製';
  setTimeout(() => (copyBtn.textContent = '複製結果(Markdown)'), 1500);
};

function toMarkdown(
  info: VideoInfo,
  opt: { quality: string; fps: number; scale: number; webpQ: number; recScale: number },
): string {
  const original = lastResults[0]?.blob?.size ?? 0;
  const rows = lastResults.map((r) => {
    if (!r.blob) return `| ${r.label} | — | — | — | — | ${r.error ?? ''} |`;
    const ratio = original ? `${((r.blob.size / original) * 100).toFixed(0)}%` : '—';
    return `| ${r.label} | ${fmtBytes(r.blob.size)} | ${ratio} | ${r.width}×${r.height} | ${r.ms ? (r.ms / 1000).toFixed(1) + ' 秒' : '—'} | ${r.frames ? r.frames + ' 格' : ''} |`;
  });
  return [
    `- 瀏覽器:${navigator.userAgent}`,
    `- 來源:${info.width}×${info.height}(錄製放大 ${opt.recScale}×),${info.duration.toFixed(2)} 秒,${info.frames} 格,平均 ${avgFps(info)} fps`,
    `- 設定:影片畫質${opt.quality};動圖 ${opt.fps} fps、縮放 ${opt.scale * 100}%;WebP 品質 ${opt.webpQ * 100}`,
    `- MediaRecorder 支援:${support.filter((s) => s.supported).map((s) => '`' + s.type + '`').join('、') || '無'}`,
    '',
    '| 格式 | 大小 | 相對原始錄影 | 尺寸 | 轉檔時間 | 備註 |',
    '|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function avgFps(info: VideoInfo): string {
  return (info.frames / Math.max(info.duration, 0.001)).toFixed(1);
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n.toFixed(0)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
