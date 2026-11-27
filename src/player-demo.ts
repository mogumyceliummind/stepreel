// 播放元件的試播頁(player.html):載入套件、覆寫自動前進,並量測 trim 的精準度(docs/SCHEMA.md §6)。

import './style.css';
import './app.css';
import { importZip, toManifest } from './package';
import type { LoopDetail, StepReelElement } from './player';
import './player';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const reel = $<StepReelElement>('reel');
const form = $<HTMLFormElement>('src-form');
const srcInput = $<HTMLInputElement>('src');
const zipInput = $<HTMLInputElement>('zip');
const loopsInput = $<HTMLInputElement>('loops');
const state = $('state');
const tbody = document.querySelector('#stats tbody')!;
const copyBtn = $<HTMLButtonElement>('copy');
const resetBtn = $<HTMLButtonElement>('reset');

let records: LoopDetail[] = [];
let source = '';
let blobUrls: string[] = [];

function freeBlobs() {
  for (const u of blobUrls) URL.revokeObjectURL(u);
  blobUrls = [];
}

function loadUrl(src: string) {
  freeBlobs();
  records = [];
  render();
  source = src;
  state.textContent = '載入中…';
  reel.removeAttribute('src');
  reel.setAttribute('src', src);
  const u = new URL(location.href);
  u.searchParams.set('src', src);
  history.replaceState(null, '', u);
}

form.onsubmit = (e) => {
  e.preventDefault();
  const src = srcInput.value.trim();
  if (src) loadUrl(src);
};

zipInput.onchange = async () => {
  const file = zipInput.files?.[0];
  zipInput.value = '';
  if (!file) return;
  try {
    state.textContent = '讀取中…';
    const { project, notes } = await importZip(file);
    const manifest = toManifest(project);
    freeBlobs();
    const urls = new Map<string, string>();
    project.steps.forEach((s, i) => {
      const m = manifest.steps[i];
      const add = (path: string | undefined, blob: Blob | null) => {
        if (!path || !blob) return;
        const u = URL.createObjectURL(blob);
        blobUrls.push(u);
        urls.set(path, u);
      };
      add(m.video, s.video);
      add(m.poster, s.poster);
    });
    records = [];
    render();
    source = file.name;
    reel.removeAttribute('src');
    history.replaceState(null, '', location.pathname);
    reel.setManifest(manifest, (path) => urls.get(path) ?? null);
    if (notes.length) state.textContent = notes.join(' ');
  } catch (e) {
    state.textContent = e instanceof Error ? e.message : String(e);
  }
};

loopsInput.oninput = () => {
  const v = loopsInput.value.trim();
  if (v === '') reel.removeAttribute('advance-after-loops');
  else reel.setAttribute('advance-after-loops', v);
};

reel.addEventListener('ready', (e) => {
  const n = (e as CustomEvent<number>).detail;
  state.textContent = `${source}:${n} 步`;
});
reel.addEventListener('error', (e) => {
  state.textContent = (e as unknown as CustomEvent<{ message: string }>).detail.message;
});
reel.addEventListener('loop', (e) => {
  records.push((e as CustomEvent<LoopDetail>).detail);
  render();
});

const ms = (s: number) => Math.round(s * 1000 * 10) / 10;

interface Row {
  step: number;
  loops: number;
  /** end - lastFrame,只算有修剪終點的 */
  endMs: number[];
  /** start - firstFrame */
  startMs: number[];
  gapMs: number[];
}

function summarize(): Row[] {
  const rows = new Map<number, Row>();
  for (const r of records) {
    let row = rows.get(r.index);
    if (!row) rows.set(r.index, (row = { step: r.index + 1, loops: 0, endMs: [], startMs: [], gapMs: [] }));
    row.loops++;
    if (r.end !== null && r.lastFrame !== null) row.endMs.push(ms(r.end - r.lastFrame));
    if (r.firstFrame !== null) {
      row.startMs.push(ms(r.start - r.firstFrame));
      row.gapMs.push(Math.round(r.gapMs));
    }
  }
  return [...rows.values()].sort((a, b) => a.step - b.step);
}

const range = (xs: number[]) => (xs.length ? `${Math.min(...xs)} ~ ${Math.max(...xs)}` : '—');
const avg = (xs: number[]) => (xs.length ? String(Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)) : '—');
const max = (xs: number[]) => (xs.length ? String(Math.max(...xs)) : '—');

function render() {
  tbody.replaceChildren(
    ...summarize().map((r) => {
      const tr = document.createElement('tr');
      for (const v of [r.step, r.loops, range(r.endMs), range(r.startMs), avg(r.gapMs), max(r.gapMs)]) {
        const td = document.createElement('td');
        td.textContent = String(v);
        tr.append(td);
      }
      return tr;
    }),
  );
}

copyBtn.onclick = async () => {
  const text = JSON.stringify({ userAgent: navigator.userAgent, rows: summarize() }, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    state.textContent = '已複製結果';
  } catch {
    state.textContent = '無法寫入剪貼簿';
  }
};
resetBtn.onclick = () => {
  records = [];
  render();
};

const initial = new URL(location.href).searchParams.get('src');
if (initial) {
  srcInput.value = initial;
  loadUrl(initial);
}
