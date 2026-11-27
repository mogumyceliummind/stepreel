// 錄製頁(D-0008、D-0009、D-0011、D-0013):選畫面、框選、一步錄一段、編輯步驟、匯出匯入 zip 套件。

import './style.css';
import './app.css';
import { RECORDER_TYPES, Recorder, evenRect, pickScreen, setFrameRate, type Rect } from './capture';
import { canEncodeH264, posterAt, toPackageVideo } from './convert';
import { exportZip, importZip, newId, normTrim, zipFileName, type Project, type Step } from './package';

const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 不存在`);
  return el as T;
};

const titleInput = $<HTMLInputElement>('title');
const loopsInput = $<HTMLInputElement>('loops');
const bgInput = $<HTMLInputElement>('background');
const exportBtn = $<HTMLButtonElement>('export');
const importInput = $<HTMLInputElement>('import');
const clearBtn = $<HTMLButtonElement>('clear');
const projectState = $('project-state');
const notesList = $('notes');
const pickBtn = $<HTMLButtonElement>('pick');
const scaleSel = $<HTMLSelectElement>('scale');
const fpsSel = $<HTMLSelectElement>('fps');
const recBtn = $<HTMLButtonElement>('rec');
const cancelModeBtn = $<HTMLButtonElement>('cancel-mode');
const recState = $('rec-state');
const stage = $('stage');
const preview = $<HTMLVideoElement>('preview');
const cropBox = $('crop-box');
const cropInfo = $('crop-info');
const stepsList = $<HTMLOListElement>('steps');
const stepsEmpty = $('steps-empty');
const insertFirstBtn = $<HTMLButtonElement>('insert-first');
const stepsCount = $('steps-count');
const editor = $('editor');
const editorTitle = $('editor-title');
const editorVideo = $<HTMLVideoElement>('editor-video');
const timeline = $('timeline');
const timelineRange = $('timeline-range');
const handleStart = $('handle-start');
const handleEnd = $('handle-end');
const trimInfo = $('trim-info');
const trimReset = $<HTMLButtonElement>('trim-reset');

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---- 專案狀態 ----

const project: Project = { title: titleInput.value, background: '#ffffff', advanceAfterLoops: 0, steps: [] };
/** 有沒匯出的變更(還沒有 IndexedDB 暫存,D-0013 第 1 點) */
let dirty = false;
/** 錄影或轉檔中:鎖住會改步驟列表的操作 */
let busy = false;
let selectedId: string | null = null;

type Mode = { kind: 'append' } | { kind: 'insert'; afterId: string | null } | { kind: 'rerecord'; id: string };
let mode: Mode = { kind: 'append' };

const indexOf = (id: string) => project.steps.findIndex((s) => s.id === id);
const stepOf = (id: string | null) => (id ? project.steps.find((s) => s.id === id) : undefined);

/** 每次變更加一;匯出完成時用來判斷匯出期間有沒有又改了東西 */
let changes = 0;
function markDirty() {
  dirty = true;
  changes++;
}

window.addEventListener('beforeunload', (e) => {
  if (dirty && project.steps.length > 0) e.preventDefault();
});

titleInput.oninput = () => {
  project.title = titleInput.value;
  markDirty();
};
loopsInput.oninput = () => {
  const n = Math.floor(Number(loopsInput.value));
  project.advanceAfterLoops = Number.isFinite(n) && n > 0 ? Math.min(n, 99) : 0;
  markDirty();
};
bgInput.oninput = () => {
  project.background = bgInput.value;
  markDirty();
};

function showNotes(notes: string[]) {
  notesList.innerHTML = '';
  for (const n of notes) notesList.append(Object.assign(document.createElement('li'), { textContent: n }));
  notesList.hidden = notes.length === 0;
}

// ---- 物件網址 ----

const urls = new Map<Blob, string>();
function urlFor(blob: Blob): string {
  let u = urls.get(blob);
  if (!u) urls.set(blob, (u = URL.createObjectURL(blob)));
  return u;
}
/** 收掉不再被任何步驟用到的網址 */
function pruneUrls() {
  const live = new Set<Blob>();
  for (const s of project.steps) {
    live.add(s.video);
    if (s.poster) live.add(s.poster);
  }
  for (const [blob, u] of urls) {
    if (!live.has(blob)) {
      URL.revokeObjectURL(u);
      urls.delete(blob);
    }
  }
}

// ---- 步驟列表 ----

function fmtSec(n: number): string {
  return `${n.toFixed(1)} 秒`;
}

function stepSummary(s: Step): string {
  const t = s.trim;
  const len = t ? t.end - t.start : s.duration;
  const parts = [fmtSec(len)];
  if (t) parts.push(`修剪 ${t.start.toFixed(1)} ~ ${t.end.toFixed(1)}(原長 ${fmtSec(s.duration)})`);
  parts.push(`${s.crop.width}×${s.crop.height}`, `${s.scale}×`);
  return parts.join(' · ');
}

function button(label: string, title: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = Object.assign(document.createElement('button'), { textContent: label, title, disabled, className: 'secondary small' });
  b.setAttribute('aria-label', title);
  b.onclick = (e) => {
    e.stopPropagation();
    onClick();
  };
  return b;
}

function render() {
  pruneUrls();
  stepsList.innerHTML = '';
  const n = project.steps.length;
  project.steps.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'step';
    li.dataset.id = s.id;
    li.draggable = !busy;
    if (s.id === selectedId) li.classList.add('selected');
    if (mode.kind === 'rerecord' && mode.id === s.id) li.classList.add('target');
    if (mode.kind === 'insert' && mode.afterId === s.id) li.classList.add('insert-after');
    if (mode.kind === 'insert' && mode.afterId === null && i === 0) li.classList.add('insert-before');

    const num = Object.assign(document.createElement('span'), { className: 'num', textContent: String(i + 1) });
    const thumb = document.createElement('img');
    thumb.className = 'thumb';
    thumb.alt = '';
    if (s.poster) thumb.src = urlFor(s.poster);
    const info = Object.assign(document.createElement('span'), { className: 'info', textContent: stepSummary(s) });
    const actions = document.createElement('span');
    actions.className = 'actions';
    actions.append(
      button('↑', `第 ${i + 1} 步往前移`, () => move(i, i - 1), busy || i === 0),
      button('↓', `第 ${i + 1} 步往後移`, () => move(i, i + 1), busy || i === n - 1),
      button('插入', `在第 ${i + 1} 步之後插入新步驟`, () => setMode({ kind: 'insert', afterId: s.id }), busy),
      button('重錄', `重錄第 ${i + 1} 步`, () => setMode({ kind: 'rerecord', id: s.id }), busy),
      button('刪除', `刪除第 ${i + 1} 步`, () => remove(s.id), busy),
    );
    li.append(num, thumb, info, actions);
    li.onclick = () => select(s.id);
    stepsList.append(li);
  });
  stepsEmpty.hidden = n > 0;
  insertFirstBtn.hidden = n === 0;
  insertFirstBtn.disabled = busy;
  stepsCount.textContent = n ? `(${n} 步)` : '';
  exportBtn.disabled = busy || n === 0;
  clearBtn.disabled = busy || n === 0;
  importInput.disabled = busy;
  updateRecButton();
  renderEditor();
}

function move(from: number, to: number) {
  if (busy || to < 0 || to >= project.steps.length || from === to) return;
  const [s] = project.steps.splice(from, 1);
  project.steps.splice(to, 0, s);
  markDirty();
  render();
}

function remove(id: string) {
  if (busy) return;
  const i = indexOf(id);
  if (i < 0) return;
  if (!confirm(`刪除第 ${i + 1} 步?`)) return;
  project.steps.splice(i, 1);
  if (selectedId === id) selectedId = null;
  if ((mode.kind === 'rerecord' && mode.id === id) || (mode.kind === 'insert' && mode.afterId === id)) {
    mode = { kind: 'append' };
    leaveRerecord();
  }
  markDirty();
  render();
}

// 拖拉排序
let dragId: string | null = null;
stepsList.addEventListener('dragstart', (e) => {
  const li = (e.target as HTMLElement).closest<HTMLLIElement>('li.step');
  if (!li || busy) return;
  dragId = li.dataset.id ?? null;
  e.dataTransfer?.setData('text/plain', dragId ?? '');
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  li.classList.add('dragging');
});
stepsList.addEventListener('dragend', () => {
  dragId = null;
  stepsList.querySelectorAll('.dragging, .drop-before, .drop-after').forEach((el) => el.classList.remove('dragging', 'drop-before', 'drop-after'));
});
function dropTarget(e: DragEvent): { li: HTMLLIElement; after: boolean } | null {
  const li = (e.target as HTMLElement).closest<HTMLLIElement>('li.step');
  if (!li) return null;
  const r = li.getBoundingClientRect();
  return { li, after: e.clientY > r.top + r.height / 2 };
}
stepsList.addEventListener('dragover', (e) => {
  if (!dragId) return;
  const t = dropTarget(e);
  if (!t) return;
  e.preventDefault();
  stepsList.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
  t.li.classList.add(t.after ? 'drop-after' : 'drop-before');
});
stepsList.addEventListener('drop', (e) => {
  if (!dragId) return;
  e.preventDefault();
  e.stopPropagation();
  const t = dropTarget(e);
  const from = indexOf(dragId);
  if (!t || from < 0) return;
  let to = indexOf(t.li.dataset.id ?? '') + (t.after ? 1 : 0);
  if (from < to) to--;
  move(from, to);
});

// ---- 錄製模式 ----

/** 重錄時放大選單暫時改成那一步的倍率;離開重錄時還原(D-0011 預設 2×) */
let scaleBeforeRerecord: string | null = null;
function leaveRerecord() {
  if (scaleBeforeRerecord !== null) scaleSel.value = scaleBeforeRerecord;
  scaleBeforeRerecord = null;
}

function setMode(m: Mode) {
  if (busy) return;
  leaveRerecord();
  mode = m;
  if (m.kind === 'rerecord') {
    const s = stepOf(m.id);
    if (s) {
      scaleBeforeRerecord = scaleSel.value;
      scaleSel.value = String(s.scale);
      // 重錄沿用這一步的框選(D-0009 第 5 點);畫面比框選小就提示,沿用目前的框選
      const { w, h } = videoSize();
      if (!w) crop = s.crop;
      else if (s.crop.x + s.crop.width <= w && s.crop.y + s.crop.height <= h) crop = s.crop;
      else recState.textContent = `第 ${indexOf(s.id) + 1} 步原本的框選超出目前的畫面,改用目前的框選。`;
      showCrop();
    }
  }
  render();
}
cancelModeBtn.onclick = () => setMode({ kind: 'append' });
insertFirstBtn.onclick = () => setMode({ kind: 'insert', afterId: null });

function updateRecButton() {
  scaleSel.disabled = busy || mode.kind === 'rerecord';
  fpsSel.disabled = busy;
  pickBtn.disabled = busy || !mimeType;
  cancelModeBtn.hidden = mode.kind === 'append' || recorder.active;
  if (recorder.active) {
    recBtn.textContent = '停止';
    recBtn.disabled = false;
    return;
  }
  recBtn.disabled = busy || !stream;
  if (mode.kind === 'rerecord') recBtn.textContent = `重錄第 ${indexOf(mode.id) + 1} 步`;
  else if (mode.kind === 'insert') {
    const i = mode.afterId ? indexOf(mode.afterId) : -1;
    recBtn.textContent = `錄新步驟,插入到第 ${i + 2} 步`;
  } else recBtn.textContent = '錄新步驟';
}

// ---- 選畫面、框選(沿用 M1 實測頁的做法) ----

const mimeType = RECORDER_TYPES.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? '';
if (!mimeType) recState.textContent = '這個瀏覽器不能錄影(不支援 MediaRecorder)。請用桌機的 Chrome 或 Edge。';

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
  cropInfo.textContent = `框選 ${crop.width}×${crop.height}(位置 ${crop.x}, ${crop.y};畫面 ${w}×${h})`;
}

pickBtn.onclick = async () => {
  try {
    stream?.getTracks().forEach((t) => t.stop());
    stream = await pickScreen(Number(fpsSel.value));
    preview.srcObject = stream;
    await preview.play();
    stage.hidden = false;
    // 換了畫面,舊的框選可能超出範圍
    const { w, h } = videoSize();
    if (crop && (crop.x + crop.width > w || crop.y + crop.height > h)) crop = null;
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      // 按了瀏覽器的「停止共用」:MediaRecorder 會自己停止,這裡負責收尾
      stream = null;
      stage.hidden = true;
      if (recorder.active) void stopRecording();
      else updateRecButton();
    });
    recState.textContent = '';
    showCrop();
    updateRecButton();
  } catch (e) {
    recState.textContent = `沒有選到畫面:${errText(e)}`;
  }
};
preview.addEventListener('resize', showCrop);
window.addEventListener('resize', () => {
  showCrop();
  renderTimeline();
});

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
/** 這一段開始時的設定(錄影中改選單、模式不影響這一段) */
let take: { mode: Mode; crop: Rect; scale: 1 | 2 } | null = null;

/** 錄製中間檔的位元率:每百萬像素(放大後)約 4 Mbps,4 ~ 20 Mbps(D-0013 第 3 點) */
function recordBitrate(width: number, height: number): number {
  return Math.round(Math.min(20e6, Math.max(4e6, (width * height * 4e6) / 1e6)));
}

recBtn.onclick = async () => {
  if (recorder.active) return stopRecording();
  const track = stream?.getVideoTracks()[0];
  if (!track || busy) return;
  const { w, h } = videoSize();
  // 沿用的框選(匯入或重錄)可能比目前的畫面大
  if (crop && (crop.x + crop.width > w || crop.y + crop.height > h)) {
    recState.textContent = `框選範圍(${crop.width}×${crop.height},位置 ${crop.x}, ${crop.y})超出目前的畫面 ${w}×${h},請重新框選。`;
    return;
  }
  const area = evenRect(crop ?? { x: 0, y: 0, width: w, height: h }, w, h);
  const wanted: 1 | 2 = mode.kind === 'rerecord' ? (stepOf(mode.id)?.scale ?? 2) : scaleSel.value === '1' ? 1 : 2;

  busy = true;
  render();
  let scale = wanted;
  try {
    // 2× 超過這個瀏覽器的 H.264 上限時自動改 1×(D-0011 第 4 點)
    if (scale === 2 && !(await canEncodeH264(area.width * 2, area.height * 2))) {
      scale = 1;
      recState.textContent = `${area.width * 2}×${area.height * 2} 超過這個瀏覽器的 H.264 編碼上限,這一段改用 1×。`;
    }
    if (!(await canEncodeH264(area.width * scale, area.height * scale))) {
      throw new Error(`這個瀏覽器不能用 H.264 編碼 ${area.width}×${area.height},請框選小一點的範圍`);
    }
    await setFrameRate(track, Number(fpsSel.value));
    // 上面等待期間可能按了瀏覽器的「停止共用」
    if (track.readyState !== 'live') throw new Error('畫面分享已經停止,請重新選畫面');
    recorder.start(track, area, mimeType, recordBitrate(area.width * scale, area.height * scale), scale);
  } catch (e) {
    busy = false;
    recState.textContent = `無法開始錄影:${errText(e)}`;
    render();
    return;
  }
  take = { mode, crop: { ...area }, scale };
  const prefix = scale !== wanted ? `${recState.textContent} ` : '';
  const t0 = performance.now();
  const tick = () => (recState.textContent = `${prefix}錄影中 ${((performance.now() - t0) / 1000).toFixed(0)} 秒`);
  tick();
  timer = window.setInterval(tick, 250);
  render();
  // 開始的同時來源結束了:ended 事件可能已經錯過,這裡收尾,避免 busy 卡住
  if (track.readyState !== 'live') void stopRecording();
};

async function stopRecording() {
  if (stopping || !take) return;
  stopping = true;
  clearInterval(timer);
  const t = take;
  try {
    const rec = await recorder.stop();
    render();
    recState.textContent = '轉成 H.264…';
    const { video, duration } = await toPackageVideo(rec.blob, rec.wallSeconds);
    if (duration < 0.1) throw new Error('錄影太短');
    const poster = await posterAt(video, 0);
    placeStep(t, video, poster, duration);
    recState.textContent = `錄好了:${fmtSec(duration)}`;
  } catch (e) {
    recState.textContent = `這一段沒有存下來:${errText(e)}`;
  } finally {
    stopping = false;
    take = null;
    busy = false;
    render();
  }
}

function placeStep(t: { mode: Mode; crop: Rect; scale: 1 | 2 }, video: Blob, poster: Blob, duration: number) {
  const m = t.mode;
  if (m.kind === 'rerecord') {
    const s = stepOf(m.id);
    if (s) {
      // 重錄換影片,id 不變;修剪重設(docs/SCHEMA.md §1)
      Object.assign(s, { video, poster, duration, trim: null, scale: t.scale, crop: t.crop });
      selectedId = s.id;
      mode = { kind: 'append' };
      leaveRerecord();
      markDirty();
      return;
    }
  }
  const step: Step = { id: newId(project.steps.map((s) => s.id)), video, poster, duration, trim: null, scale: t.scale, crop: t.crop };
  if (m.kind === 'insert') {
    const at = m.afterId ? indexOf(m.afterId) + 1 : 0;
    project.steps.splice(at > 0 || m.afterId === null ? at : project.steps.length, 0, step);
    // 連續插入時接在剛插入的這一步後面
    mode = { kind: 'insert', afterId: step.id };
  } else {
    project.steps.push(step);
    mode = { kind: 'append' };
  }
  selectedId = step.id;
  markDirty();
}

// ---- 修剪 ----

const MIN_LEN = 0.1;

function select(id: string) {
  selectedId = selectedId === id ? null : id;
  render();
}

let editorStepVideo: Blob | null = null;
function renderEditor() {
  const s = stepOf(selectedId);
  if (!s) {
    editor.hidden = true;
    editorVideo.pause();
    editorVideo.removeAttribute('src');
    editorStepVideo = null;
    return;
  }
  editor.hidden = false;
  editorTitle.textContent = `修剪第 ${indexOf(s.id) + 1} 步`;
  if (editorStepVideo !== s.video) {
    editorStepVideo = s.video;
    editorVideo.src = urlFor(s.video);
    // 錄製放大 2× 的影片縮回框選尺寸顯示
    editorVideo.style.width = `${s.crop.width}px`;
    editorVideo.onerror = () => (projectState.textContent = `第 ${indexOf(s.id) + 1} 步的影片無法播放(可能不是 H.264 MP4)`);
    editorVideo.currentTime = s.trim?.start ?? 0;
    void editorVideo.play().catch(() => {});
  }
  renderTimeline();
}

function currentTrim(s: Step) {
  return s.trim ?? { start: 0, end: s.duration };
}

function renderTimeline() {
  const s = stepOf(selectedId);
  if (!s) return;
  const { start, end } = currentTrim(s);
  const pct = (t: number) => `${(t / s.duration) * 100}%`;
  handleStart.style.left = pct(start);
  handleEnd.style.left = pct(end);
  timelineRange.style.left = pct(start);
  timelineRange.style.width = `${((end - start) / s.duration) * 100}%`;
  for (const [h, v, min, max] of [
    [handleStart, start, 0, end - MIN_LEN],
    [handleEnd, end, start + MIN_LEN, s.duration],
  ] as const) {
    h.setAttribute('aria-valuenow', v.toFixed(2));
    h.setAttribute('aria-valuemin', min.toFixed(2));
    h.setAttribute('aria-valuemax', max.toFixed(2));
    h.setAttribute('aria-valuetext', fmtSec(v));
  }
  trimInfo.textContent = s.trim
    ? `${s.trim.start.toFixed(2)} ~ ${s.trim.end.toFixed(2)} 秒(${fmtSec(s.trim.end - s.trim.start)},原長 ${fmtSec(s.duration)})`
    : `整段 ${fmtSec(s.duration)}`;
  trimReset.disabled = !s.trim;
}

// 編輯中的預覽只在修剪範圍內循環(這只是編輯用的預覽;播放元件的精準度另外驗證,docs/SCHEMA.md §6)
function loopInTrim() {
  const s = stepOf(selectedId);
  if (!s || editor.hidden || draggingHandle) return;
  const { start, end } = currentTrim(s);
  if (editorVideo.currentTime >= end - 0.02 || editorVideo.currentTime < start - 0.05 || editorVideo.ended) {
    editorVideo.currentTime = start;
    if (editorVideo.paused) void editorVideo.play().catch(() => {});
  }
}
function onEditorFrame() {
  loopInTrim();
  editorVideo.requestVideoFrameCallback(onEditorFrame);
}
editorVideo.requestVideoFrameCallback(onEditorFrame);
editorVideo.addEventListener('ended', loopInTrim);

let draggingHandle: 'start' | 'end' | null = null;
let startBeforeDrag = 0;
let keyPosterTimer = 0;
let keyPosterBefore: number | null = null;

function setTrim(s: Step, which: 'start' | 'end', t: number) {
  const cur = currentTrim(s);
  const next =
    which === 'start'
      ? { start: Math.max(0, Math.min(t, cur.end - MIN_LEN)), end: cur.end }
      : { start: cur.start, end: Math.min(s.duration, Math.max(t, cur.start + MIN_LEN)) };
  s.trim = normTrim(next, s.duration);
  markDirty();
  renderTimeline();
  editorVideo.currentTime = which === 'start' ? next.start : Math.max(next.start, next.end - 0.05);
}

/** 起點改了就重新產生海報(docs/SCHEMA.md §2) */
async function refreshPoster(s: Step, before: number) {
  const now = currentTrim(s).start;
  if (Math.abs(now - before) < 0.001) return;
  const video = s.video;
  try {
    const poster = await posterAt(video, now);
    // 產生期間又改了起點或重錄了,就不覆蓋
    if (s.video === video && Math.abs(currentTrim(s).start - now) < 0.001) {
      s.poster = poster;
      render();
    }
  } catch (e) {
    projectState.textContent = `海報圖產生失敗:${errText(e)}`;
  }
}

function timeAt(e: PointerEvent, s: Step) {
  const r = timeline.getBoundingClientRect();
  return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * s.duration;
}

for (const [handle, which] of [
  [handleStart, 'start'],
  [handleEnd, 'end'],
] as const) {
  handle.addEventListener('pointerdown', (e) => {
    const s = stepOf(selectedId);
    if (!s) return;
    e.preventDefault();
    draggingHandle = which;
    startBeforeDrag = currentTrim(s).start;
    editorVideo.pause();
    handle.setPointerCapture(e.pointerId);
    handle.focus();
  });
  handle.addEventListener('pointermove', (e) => {
    const s = stepOf(selectedId);
    if (draggingHandle !== which || !s) return;
    setTrim(s, which, timeAt(e, s));
  });
  const end = () => {
    if (draggingHandle !== which) return;
    draggingHandle = null;
    const s = stepOf(selectedId);
    if (!s) return;
    editorVideo.currentTime = currentTrim(s).start;
    void editorVideo.play().catch(() => {});
    void refreshPoster(s, startBeforeDrag);
    render();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('keydown', (e) => {
    const s = stepOf(selectedId);
    if (!s || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    keyPosterBefore ??= currentTrim(s).start;
    const cur = currentTrim(s)[which];
    setTrim(s, which, cur + (e.key === 'ArrowLeft' ? -0.1 : 0.1));
    // 長按方向鍵時等停下來再產生海報
    clearTimeout(keyPosterTimer);
    keyPosterTimer = window.setTimeout(() => {
      const before = keyPosterBefore ?? 0;
      keyPosterBefore = null;
      void refreshPoster(s, before);
    }, 400);
    render();
    handle.focus();
  });
}

trimReset.onclick = () => {
  const s = stepOf(selectedId);
  if (!s) return;
  const before = currentTrim(s).start;
  s.trim = null;
  markDirty();
  void refreshPoster(s, before);
  render();
};

// ---- 匯出、匯入 ----

exportBtn.onclick = async () => {
  if (busy || project.steps.length === 0) return;
  busy = true;
  render();
  projectState.textContent = '匯出中…';
  const at = changes;
  try {
    const zip = await exportZip(project);
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(zip), download: zipFileName(project.title) });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    // 匯出期間改了名稱等設定,就還算有沒匯出的變更
    if (changes === at) dirty = false;
    projectState.textContent = `已匯出 ${a.download}(${(zip.size / 1024 / 1024).toFixed(2)} MB)`;
  } catch (e) {
    projectState.textContent = `匯出失敗:${errText(e)}`;
  } finally {
    busy = false;
    render();
  }
};

async function loadZip(file: File) {
  if (busy) {
    projectState.textContent = '錄影、轉檔或匯出中,等完成後再匯入。';
    return;
  }
  if (project.steps.length > 0 && dirty && !confirm('目前的步驟還沒匯出,匯入會取代它們。要繼續嗎?')) return;
  busy = true;
  render();
  projectState.textContent = `讀取 ${file.name}…`;
  try {
    const { project: p, notes, needPoster } = await importZip(file);
    for (const id of needPoster) {
      const s = p.steps.find((x) => x.id === id);
      if (!s) continue;
      try {
        s.poster = await posterAt(s.video, s.trim?.start ?? 0);
      } catch (e) {
        notes.push(`第 ${p.steps.indexOf(s) + 1} 步的海報圖產生失敗:${errText(e)}`);
      }
    }
    Object.assign(project, p);
    titleInput.value = p.title;
    loopsInput.value = String(p.advanceAfterLoops);
    bgInput.value = p.background;
    selectedId = null;
    mode = { kind: 'append' };
    leaveRerecord();
    dirty = false;
    // 繼續錄時沿用第一步的框選(超出目前畫面時,錄影前會提示重新框選)
    if (p.steps[0] && !crop) crop = p.steps[0].crop;
    showCrop();
    showNotes(notes);
    projectState.textContent = `已匯入 ${file.name}:${p.steps.length} 步`;
  } catch (e) {
    projectState.textContent = `匯入失敗:${errText(e)}`;
  } finally {
    busy = false;
    render();
  }
}

importInput.onchange = () => {
  const f = importInput.files?.[0];
  importInput.value = '';
  if (f) void loadZip(f);
};

document.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
document.addEventListener('drop', (e) => {
  const f = e.dataTransfer?.files[0];
  if (!f) return;
  e.preventDefault();
  if (/\.zip$/i.test(f.name) || f.type.includes('zip')) void loadZip(f);
  else projectState.textContent = '只能匯入 zip 套件';
});

clearBtn.onclick = () => {
  if (busy || project.steps.length === 0) return;
  if (!confirm(dirty ? '目前的步驟還沒匯出,清空後就沒了。要清空嗎?' : '清空所有步驟?')) return;
  project.steps = [];
  selectedId = null;
  mode = { kind: 'append' };
  leaveRerecord();
  dirty = false;
  showNotes([]);
  projectState.textContent = '';
  render();
};

render();
