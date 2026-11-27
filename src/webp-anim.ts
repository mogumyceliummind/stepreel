// 動態 WebP 封裝:每格由瀏覽器原生編成 WebP,這裡只組 RIFF 容器(D-0010 第 4 點)
// 格式:https://developers.google.com/speed/webp/docs/riff_container

export interface WebpFrame {
  /** 單張 WebP 檔(convertToBlob 的結果) */
  image: Uint8Array;
  /** 在畫布上的位置;WebP 規定要是偶數 */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 毫秒 */
  duration: number;
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function u24(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
}

function u32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}

function chunk(fourcc: string, payload: Uint8Array): Uint8Array {
  const pad = payload.length % 2;
  const out = new Uint8Array(8 + payload.length + pad);
  out.set(ascii(fourcc), 0);
  out.set(u32(payload.length), 4);
  out.set(payload, 8);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** 從單張 WebP 取出影像資料的 chunk(ALPH、VP8、VP8L),丟掉 VP8X 等標頭。 */
export function imageChunks(file: Uint8Array): { data: Uint8Array; hasAlpha: boolean } {
  const tag = (o: number) => String.fromCharCode(file[o], file[o + 1], file[o + 2], file[o + 3]);
  if (file.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new Error('不是 WebP 檔');
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const keep: Uint8Array[] = [];
  let hasAlpha = false;
  let o = 12;
  while (o + 8 <= file.length) {
    const fourcc = tag(o);
    const size = view.getUint32(o + 4, true);
    const end = o + 8 + size + (size % 2);
    if (fourcc === 'ALPH' || fourcc === 'VP8 ' || fourcc === 'VP8L') {
      keep.push(file.subarray(o, Math.min(end, file.length)));
      if (fourcc === 'ALPH') hasAlpha = true;
    }
    o = end;
  }
  if (keep.length === 0) throw new Error('WebP 裡沒有影像資料');
  return { data: concat(keep), hasAlpha };
}

/**
 * 組成無限循環的動態 WebP。每格不與前一格混合(覆蓋該區域),也不清除,所以只送變動的區域即可。
 * `background` 是 0xRRGGBBAA。
 */
export function muxAnimatedWebp(width: number, height: number, frames: WebpFrame[], background = 0xffffffff): Uint8Array<ArrayBuffer> {
  let anyAlpha = false;
  const anmf: Uint8Array[] = [];
  for (const f of frames) {
    if (f.x % 2 || f.y % 2) throw new Error('WebP 動畫格的位置必須是偶數');
    const { data, hasAlpha } = imageChunks(f.image);
    anyAlpha ||= hasAlpha;
    const header = Uint8Array.from([
      ...u24(f.x / 2),
      ...u24(f.y / 2),
      ...u24(f.width - 1),
      ...u24(f.height - 1),
      ...u24(Math.max(1, Math.min(0xffffff, Math.round(f.duration)))),
      0b10, // bit 1:不混合;bit 0:不清除
    ]);
    anmf.push(chunk('ANMF', concat([header, data])));
  }
  const flags = 0x02 | (anyAlpha ? 0x10 : 0); // 動畫、透明
  const vp8x = chunk('VP8X', Uint8Array.from([flags, 0, 0, 0, ...u24(width - 1), ...u24(height - 1)]));
  // ANIM:背景色(BGRA)、循環次數 0 = 無限
  const bg = [(background >> 8) & 0xff, (background >> 16) & 0xff, (background >>> 24) & 0xff, background & 0xff];
  const anim = chunk('ANIM', Uint8Array.from([...bg, 0, 0]));
  const body = concat([ascii('WEBP'), vp8x, anim, ...anmf]);
  return concat([ascii('RIFF'), Uint8Array.from(u32(body.length)), body]);
}
