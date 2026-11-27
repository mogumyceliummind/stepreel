// 播放元件 <step-reel>(D-0009 第 3、5 點,D-0012,D-0015)。
// 讀解壓後資料夾的 manifest.json(不讀 zip,R-018),一個畫面循環播放目前的步驟,下方是步驟編號列。
// 畫面上不放任何說明文字(D-0008 第 3 點);只有步驟編號。

import { MANIFEST_MAX_BYTES, checkFormat, isNum, isPackagePath, readTrim } from './format';

export interface PlayerStep {
  id: string;
  video: string;
  poster: string | null;
  start: number;
  /** 修剪終點;null 表示播到影片結尾 */
  end: number | null;
}

export interface LoopDetail {
  /** 第幾步(從 0 起算) */
  index: number;
  /** 這一步已經播完幾次 */
  count: number;
  start: number;
  end: number | null;
  /** 跳回起點前最後一格的時間(秒,影片時間)。可能比 end 小一點:下一格會超過 end 時就先跳回 */
  lastFrame: number | null;
  /** 跳回起點後第一格的時間(秒,影片時間);應該是包含 start 的那一格 */
  firstFrame: number | null;
  /** 跳回到起點第一格出現的時間(毫秒);這段時間畫面停在最後一格 */
  gapMs: number;
}

/** 解析後的套件(播放元件只需要這些欄位) */
export interface PlayerPackage {
  size: { width: number; height: number } | null;
  background: string;
  advanceAfterLoops: number;
  steps: PlayerStep[];
  /** 略過的步驟與原因(開發者工具的 console 也會印) */
  warnings: string[];
}

/** 驗證 manifest 並轉成播放用的資料。`resolve` 把套件內的相對路徑轉成網址,不在套件內就回傳 null */
export function parseManifest(raw: unknown, resolve: (path: string) => string | null): PlayerPackage {
  if (!raw || typeof raw !== 'object') throw new Error('不是 stepreel 的套件');
  const m = raw as Record<string, unknown>;
  checkFormat(m); // 版本較新時照常播,忽略不認得的欄位(docs/SCHEMA.md §4)
  const warnings: string[] = [];
  const sz = m.size as Record<string, unknown> | undefined;
  const size =
    sz && isNum(sz.width) && isNum(sz.height) && sz.width > 0 && sz.height > 0 ? { width: sz.width, height: sz.height } : null;
  const background = typeof m.background === 'string' && /^#[0-9a-f]{6}$/i.test(m.background) ? m.background : '#ffffff';
  const player = m.player && typeof m.player === 'object' ? (m.player as Record<string, unknown>) : {};
  const advanceAfterLoops = isNum(player.advanceAfterLoops) && player.advanceAfterLoops > 0 ? Math.floor(player.advanceAfterLoops) : 0;

  const steps: PlayerStep[] = [];
  const list = Array.isArray(m.steps) ? m.steps : [];
  list.forEach((rawStep: unknown, i) => {
    const label = `第 ${i + 1} 步`;
    if (!rawStep || typeof rawStep !== 'object') return void warnings.push(`${label}格式不對,略過`);
    const s = rawStep as Record<string, unknown>;
    const video = isPackagePath(s.video) ? resolve(s.video) : null;
    if (!video) return void warnings.push(`${label}的影片路徑不合規則,略過`);
    let poster: string | null = null;
    if (s.poster !== undefined) {
      poster = isPackagePath(s.poster) ? resolve(s.poster) : null;
      if (!poster) warnings.push(`${label}的海報路徑不合規則,不用海報`);
    }
    const duration = isNum(s.duration) && s.duration > 0 ? s.duration : null;
    let start = 0;
    let end: number | null = null;
    if (s.trim !== undefined) {
      const t = duration ? readTrim(s.trim, duration) : null;
      if (t) {
        start = t.start;
        // 修剪終點就是影片結尾時,播到 ended 即可
        end = duration && duration - t.end < 0.005 ? null : t.end;
      } else warnings.push(`${label}的 trim 不對,播整段`);
    }
    steps.push({ id: typeof s.id === 'string' ? s.id : String(i + 1), video, poster, start, end });
  });
  if (!Array.isArray(m.steps)) warnings.push('manifest.json 沒有 steps');
  return { size, background, advanceAfterLoops, steps, warnings };
}

/** 依 manifest 的網址解析相對路徑;解析後跑出 manifest 所在資料夾的(例如 %2e%2e)一律拒絕 */
export function folderResolver(manifestUrl: string | URL): (path: string) => string | null {
  const dir = new URL('.', manifestUrl).href;
  return (path) => {
    const url = new URL(path, manifestUrl);
    return url.href.startsWith(dir) ? url.href : null;
  };
}

/** 讀回應本文,超過 `max` 位元組就中止(沒有 content-length 時也擋得住) */
async function readLimited(res: Response, max: number): Promise<string> {
  if (Number(res.headers.get('content-length')) > max) throw new Error('manifest.json 太大');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      void reader.cancel();
      throw new Error('manifest.json 太大');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Chrome、Edge、Safari 15.4 以後都有;沒有時只靠播放時間檢查,精準度較差 */
const HAS_RVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

const STYLE = `
:host { display: block; --step-reel-accent: #2f6fde; --step-reel-line: #c9c9d2; }
:host([hidden]), [hidden] { display: none !important; }
.wrap { max-width: 100%; }
.stage { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: #fff; border-radius: 4px; }
video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
.play {
  position: absolute; inset: 0; margin: auto; width: 64px; height: 64px; border-radius: 50%;
  background: rgb(0 0 0 / 0.45); pointer-events: none;
}
.play::after {
  content: ''; position: absolute; left: 25px; top: 18px;
  border-style: solid; border-width: 14px 0 14px 22px; border-color: transparent transparent transparent #fff;
}
.err { position: absolute; inset: 0; margin: 0; padding: 12px; color: #c62828; font: 14px system-ui, sans-serif; }
nav { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-top: 6px; }
button {
  font: 14px/1 system-ui, sans-serif; min-width: 2.2em; height: 2.2em; padding: 0 6px; cursor: pointer;
  border: 1px solid var(--step-reel-line); border-radius: 4px; background: transparent; color: inherit;
}
button[aria-current='step'] { background: var(--step-reel-accent); border-color: var(--step-reel-accent); color: #fff; }
button:disabled { opacity: 0.35; cursor: default; }
button:focus-visible { outline: 2px solid var(--step-reel-accent); outline-offset: 1px; }
`;

const ROOT = `
<div class="wrap" part="wrap">
  <div class="stage" part="stage">
    <video part="video" muted playsinline disablepictureinpicture preload="auto"></video>
    <div class="play" part="play-icon" hidden></div>
    <p class="err" part="error" role="alert" hidden></p>
  </div>
  <nav part="nav"></nav>
</div>
`;

/**
 * `<step-reel src="tutorial/manifest.json" advance-after-loops="2">`
 *
 * - `src`:manifest.json 的網址(相對於目前頁面)
 * - `advance-after-loops`:播完幾次自動到下一步,覆寫套件的 `player.advanceAfterLoops`;`0` 不自動前進
 *
 * 事件:`ready`(detail:步驟數)、`stepchange`(detail:{ index })、`loop`(detail:LoopDetail)、`error`(detail:{ message })
 */
export class StepReelElement extends HTMLElement {
  static observedAttributes = ['src', 'advance-after-loops'];

  private readonly stage: HTMLDivElement;
  private readonly video: HTMLVideoElement;
  private readonly playIcon: HTMLDivElement;
  private readonly errBox: HTMLParagraphElement;
  private readonly nav: HTMLElement;
  private readonly wrap: HTMLDivElement;

  private pkg: PlayerPackage | null = null;
  private index = 0;
  private count = 0;
  private loadToken = 0;
  /** 正在跳回起點:從下 seek 到第一格出現之前 */
  private wrapping: { at: number; lastFrame: number | null } | null = null;
  private lastFrame: number | null = null;
  private frameDelta = 1 / 30;
  private userPaused = false;
  private rafId = 0;
  /** 最後一次依 src 屬性載入的值;setManifest 時是 null */
  private loadedSrc: string | null = null;
  /** 每次換步驟加一,舊的 requestVideoFrameCallback 迴圈看到就停 */
  private frameGen = 0;
  private connected = false;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>${ROOT}`;
    this.wrap = root.querySelector('.wrap')!;
    this.stage = root.querySelector('.stage')!;
    this.video = root.querySelector('video')!;
    this.playIcon = root.querySelector('.play')!;
    this.errBox = root.querySelector('.err')!;
    this.nav = root.querySelector('nav')!;
    this.video.muted = true;

    this.video.addEventListener('loadedmetadata', () => this.onMetadata());
    this.video.addEventListener('ended', () => this.wrap_());
    this.video.addEventListener('timeupdate', this.checkTime);
    this.video.addEventListener('play', () => this.syncPlayIcon());
    this.video.addEventListener('pause', () => this.syncPlayIcon());
    this.video.addEventListener('error', () => {
      if (this.pkg) this.fail(`第 ${this.index + 1} 步的影片無法播放`);
    });
    this.stage.addEventListener('click', () => this.togglePause());
    this.nav.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.go(this.index + (e.key === 'ArrowLeft' ? -1 : 1));
        this.focusCurrent();
      }
    });
  }

  connectedCallback() {
    this.connected = true;
    const src = this.getAttribute('src');
    // 斷開期間改了 src 也要重新載入;沒改就從停下的地方繼續播
    if (src && src !== this.loadedSrc) void this.loadSrc();
    else if (this.pkg && !this.userPaused) void this.video.play().catch(() => this.syncPlayIcon());
    this.tick();
  }

  disconnectedCallback() {
    this.connected = false;
    cancelAnimationFrame(this.rafId);
    this.video.pause();
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null) {
    if (old === value) return;
    if (name === 'src' && this.connected) void this.loadSrc();
    // advance-after-loops 每次播完時才讀,不必處理
  }

  /** 目前是第幾步(從 0 起算) */
  get currentIndex(): number {
    return this.index;
  }

  get stepCount(): number {
    return this.pkg?.steps.length ?? 0;
  }

  /** 播完幾次自動前進:屬性優先,否則用套件的設定 */
  get advanceAfterLoops(): number {
    const attr = this.getAttribute('advance-after-loops');
    if (attr !== null && attr.trim() !== '') {
      const n = Number(attr);
      if (Number.isFinite(n) && n >= 0) return Math.floor(n);
    }
    return this.pkg?.advanceAfterLoops ?? 0;
  }

  /** 不經網址,直接給 manifest(例如錄製頁預覽、或自己取得 manifest 的網頁)。`resolve` 見 parseManifest */
  setManifest(raw: unknown, resolve: (path: string) => string | null): void {
    this.loadToken++;
    this.loadedSrc = null;
    try {
      this.apply(parseManifest(raw, resolve));
    } catch (e) {
      this.fail(e instanceof Error ? e.message : String(e));
    }
  }

  go(index: number): void {
    if (!this.pkg) return;
    const n = this.pkg.steps.length;
    if (index < 0 || index >= n) return;
    this.show(index);
  }

  next(): void {
    this.go(this.index + 1);
  }

  prev(): void {
    this.go(this.index - 1);
  }

  private async loadSrc() {
    const src = this.getAttribute('src');
    const token = ++this.loadToken;
    this.loadedSrc = src;
    if (!src) return;
    try {
      const url = new URL(src, document.baseURI);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`讀不到 manifest.json(HTTP ${res.status})`);
      const text = await readLimited(res, MANIFEST_MAX_BYTES);
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error('manifest.json 不是有效的 JSON');
      }
      if (token !== this.loadToken) return;
      // 轉址後以最後的網址為準,相對路徑才會對
      this.apply(parseManifest(raw, folderResolver(res.url || url)));
    } catch (e) {
      if (token === this.loadToken) this.fail(e instanceof Error ? e.message : String(e));
    }
  }

  private apply(pkg: PlayerPackage) {
    for (const w of pkg.warnings) console.warn(`step-reel: ${w}`);
    if (pkg.steps.length === 0) throw new Error('套件裡沒有可以播放的步驟');
    this.pkg = pkg;
    this.errBox.hidden = true;
    this.video.hidden = false;
    this.stage.style.background = pkg.background;
    if (pkg.size) {
      this.stage.style.aspectRatio = `${pkg.size.width} / ${pkg.size.height}`;
      // 2× 錄製的影片縮回框選的尺寸,不放大超過原尺寸(D-0011)
      this.wrap.style.maxWidth = `${pkg.size.width}px`;
    }
    this.renderNav();
    // 尊重「減少動態」:先不自動播放,點畫面才播
    this.userPaused = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.show(0);
    this.dispatchEvent(new CustomEvent('ready', { detail: pkg.steps.length }));
  }

  private fail(message: string) {
    this.pkg = null;
    this.video.removeAttribute('src');
    this.video.load();
    this.video.hidden = true;
    this.playIcon.hidden = true;
    this.nav.replaceChildren();
    this.errBox.textContent = `step-reel:${message}`;
    this.errBox.hidden = false;
    console.error(`step-reel: ${message}`);
    this.dispatchEvent(new CustomEvent('error', { detail: { message } }));
  }

  private renderNav() {
    const n = this.pkg!.steps.length;
    const mk = (label: string, aria: string, part: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('aria-label', aria);
      b.setAttribute('part', part);
      b.onclick = onClick;
      return b;
    };
    const buttons = [mk('‹', '上一步', 'button prev', () => this.prev())];
    for (let i = 0; i < n; i++) buttons.push(mk(String(i + 1), `第 ${i + 1} 步`, 'button step', () => this.go(i)));
    buttons.push(mk('›', '下一步', 'button next', () => this.next()));
    this.nav.replaceChildren(...buttons);
  }

  private syncNav() {
    const btns = this.nav.querySelectorAll('button');
    const n = btns.length - 2;
    btns[0].disabled = this.index === 0;
    btns[n + 1].disabled = this.index === n - 1;
    for (let i = 0; i < n; i++) {
      const b = btns[i + 1];
      if (i === this.index) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    }
  }

  private focusCurrent() {
    const b = this.nav.querySelectorAll('button')[this.index + 1];
    if (b && this.shadowRoot!.activeElement?.getAttribute('part') === 'button step') b.focus();
  }

  private show(index: number) {
    const step = this.pkg!.steps[index];
    this.index = index;
    this.count = 0;
    this.wrapping = null;
    this.lastFrame = null;
    this.syncNav();
    // 海報是修剪後的第一格(D-0012 第 6 點),換步驟時影片載入前先顯示它
    if (step.poster) this.video.poster = step.poster;
    else this.video.removeAttribute('poster');
    this.video.src = step.video;
    this.dispatchEvent(new CustomEvent('stepchange', { detail: { index } }));
    this.watchFrames();
  }

  private onMetadata() {
    const step = this.current();
    if (!step) return;
    // manifest 沒有 size 時,用影片本身的比例
    if (!this.pkg!.size && this.video.videoWidth > 0) {
      this.stage.style.aspectRatio = `${this.video.videoWidth} / ${this.video.videoHeight}`;
    }
    if (step.start > 0) this.video.currentTime = step.start;
    if (!this.userPaused) void this.video.play().catch(() => this.syncPlayIcon());
    this.syncPlayIcon();
  }

  private current(): PlayerStep | null {
    return this.pkg?.steps[this.index] ?? null;
  }

  private togglePause() {
    if (!this.pkg) return;
    if (this.video.paused) {
      this.userPaused = false;
      void this.video.play().catch(() => {});
    } else {
      this.userPaused = true;
      this.video.pause();
    }
  }

  private syncPlayIcon() {
    this.playIcon.hidden = !this.pkg || !this.video.paused;
  }

  /** requestVideoFrameCallback:每格畫面出現時檢查;下一格會超過修剪終點就先跳回起點(docs/SCHEMA.md §6) */
  private watchFrames() {
    const v = this.video;
    if (!HAS_RVFC) return;
    const gen = ++this.frameGen;
    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (gen !== this.frameGen) return; // 換了步驟,新的迴圈接手
      const t = meta.mediaTime;
      if (this.wrapping) {
        // seek 完成前送來的是跳回前的格,不算
        if (v.seeking) return void v.requestVideoFrameCallback(onFrame);
        const w = this.wrapping;
        this.wrapping = null;
        this.emitLoop(w.lastFrame, t, performance.now() - w.at);
      } else {
        if (this.lastFrame !== null) {
          const d = t - this.lastFrame;
          // 只用合理範圍的間隔估計格長;螢幕錄影畫面不動時不送新格,間隔會很長
          if (d > 0.004 && d < 0.1) this.frameDelta = d;
        }
        const end = this.current()?.end ?? null;
        if (end !== null && !v.seeking && t + this.frameDelta > end - 0.001) {
          this.lastFrame = t;
          this.wrap_();
          if (gen !== this.frameGen) return; // 自動前進到下一步,新的迴圈接手
        }
      }
      this.lastFrame = t;
      v.requestVideoFrameCallback(onFrame);
    };
    v.requestVideoFrameCallback(onFrame);
  }

  /** 備援:畫面不動、很久沒有新格時,用播放時間檢查是否過了終點 */
  private checkTime = () => {
    const step = this.current();
    const v = this.video;
    if (step && step.end !== null && !this.wrapping && !v.seeking && !v.paused && v.currentTime >= step.end) this.wrap_();
  };

  /** 每個畫面更新檢查一次;分頁在背景時 requestAnimationFrame 停了,改由 timeupdate(約 250 毫秒一次)檢查 */
  private tick = () => {
    if (!this.connected) return;
    this.checkTime();
    this.rafId = requestAnimationFrame(this.tick);
  };

  /** 播完一次:跳回起點,或到下一步 */
  private wrap_() {
    const step = this.current();
    if (!step || this.wrapping) return;
    this.count++;
    const limit = this.advanceAfterLoops;
    if (limit > 0 && this.count >= limit && this.index < this.pkg!.steps.length - 1) {
      this.emitLoop(this.lastFrame, null, 0);
      this.show(this.index + 1);
      return;
    }
    const w = { at: performance.now(), lastFrame: this.lastFrame };
    this.wrapping = w;
    // 平常由 requestVideoFrameCallback 在起點第一格出現時結束 wrapping。
    // 沒有它、或分頁在背景沒送格時,seek 完成後一段時間仍沒結束就在這裡結束,否則會卡住不再檢查終點
    this.video.addEventListener(
      'seeked',
      () =>
        setTimeout(
          () => {
            if (this.wrapping !== w) return;
            this.wrapping = null;
            this.emitLoop(w.lastFrame, null, performance.now() - w.at);
          },
          HAS_RVFC ? 300 : 0,
        ),
      { once: true },
    );
    this.video.currentTime = step.start;
    if (!this.userPaused) void this.video.play().catch(() => {});
  }

  private emitLoop(lastFrame: number | null, firstFrame: number | null, gapMs: number) {
    const step = this.current();
    if (!step) return;
    const detail: LoopDetail = { index: this.index, count: this.count, start: step.start, end: step.end, lastFrame, firstFrame, gapMs };
    this.dispatchEvent(new CustomEvent('loop', { detail }));
  }
}

if (!customElements.get('step-reel')) customElements.define('step-reel', StepReelElement);

declare global {
  interface HTMLElementTagNameMap {
    'step-reel': StepReelElement;
  }
}
