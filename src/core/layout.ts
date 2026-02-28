import { Bitmap } from './bitmap';

type BestAccumulator<T> = { add(score: number, value: T): void, get: () => T | undefined };

export const PATTERNS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x, _y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
] as const;

export interface QrLayoutInfo<E, M extends number, V extends number> {
  size: { encode: (ver: V) => number };
  alignment_patterns(ver: V): number[];
  format_bits(ecc: E, mask_idx: M): number;
  version_bits(ver: V): number;
}

export function draw_template<E, M extends number, V extends number>(
  info: QrLayoutInfo<E, M, V>,
  ver: V,
  ecc: E,
  mask_idx: M,
  test = false
): Bitmap {
  const size = info.size.encode(ver);
  let b = new Bitmap(size + 2);
  const finder = new Bitmap(3).rect(0, 3, true).border(1, false).border(1, true).border(1, false);
  b = b.embed(0, finder).embed({ x: -finder.width, y: 0 }, finder).embed({ x: 0, y: -finder.height }, finder);
  b = b.rect_slice(1, size);
  const align = new Bitmap(1).rect(0, 1, true).border(1, false).border(1, true);
  const align_pos = info.alignment_patterns(ver);
  for (const y of align_pos) {
    for (const x of align_pos) {
      if (b.data[y][x] !== undefined) continue;
      b.embed({ x: x - 2, y: y - 2 }, align);
    }
  }
  b = b.h_line({ x: 0, y: 6 }, Infinity, ({ x }, cur) => (cur === undefined ? x % 2 === 0 : cur)).v_line(
    { x: 6, y: 0 },
    Infinity,
    ({ y }, cur) => (cur === undefined ? y % 2 === 0 : cur)
  );

  const bits = info.format_bits(ecc, mask_idx);
  const get_bit = (i: number) => !test && ((bits >> i) & 1) === 1;
  for (let i = 0;i < 6;i++) b.data[i][8] = get_bit(i);
  for (let i = 6;i < 8;i++) b.data[i + 1][8] = get_bit(i);
  for (let i = 8;i < 15;i++) b.data[size - 15 + i][8] = get_bit(i);
  for (let i = 0;i < 8;i++) b.data[8][size - i - 1] = get_bit(i);
  for (let i = 8;i < 9;i++) b.data[8][15 - i] = get_bit(i);
  for (let i = 9;i < 15;i++) b.data[8][14 - i] = get_bit(i);
  b.data[size - 8][8] = !test;

  if (ver >= 7) {
    const version = info.version_bits(ver);
    for (let i = 0;i < 18;i++) {
      const bit = !test && ((version >> i) & 1) === 1;
      const x = Math.floor(i / 3);
      const y = (i % 3) + size - 11;
      b.data[x][y] = bit;
      b.data[y][x] = bit;
    }
  }

  return b;
}

export function zigzag<M extends number>(tpl: Bitmap, mask_idx: M, fn: (x: number, y: number, mask: boolean) => void): void {
  const size = tpl.height;
  const pattern = PATTERNS[mask_idx];
  let dir = -1;
  let y = size - 1;
  for (let x_offset = size - 1;x_offset > 0;x_offset -= 2) {
    if (x_offset === 6) x_offset = 5;
    for (;;y += dir) {
      for (let j = 0;j < 2;j++) {
        const x = x_offset - j;
        if (tpl.data[y][x] !== undefined) continue;
        fn(x, y, pattern(x, y));
      }
      if (y + dir < 0 || y + dir >= size) break;
    }
    dir = -dir;
  }
}

export function draw_qr<E, M extends number, V extends number>(
  info: QrLayoutInfo<E, M, V>,
  ver: V,
  ecc: E,
  data: Uint8Array,
  mask_idx: M,
  test = false
): Bitmap {
  const b = draw_template(info, ver, ecc, mask_idx, test);
  let i = 0;
  const need = 8 * data.length;
  zigzag(b, mask_idx, (x, y, mask) => {
    let value = false;
    if (i < need) {
      value = ((data[i >>> 3] >> ((7 - i) & 7)) & 1) !== 0;
      i++;
    }
    b.data[y][x] = value !== mask;
  });

  if (i !== need) throw new Error('QR: bytes left after draw');
  return b;
}

export function draw_qr_best<E, M extends number, V extends number>(
  info: QrLayoutInfo<E, M, V>,
  penalty: (bitmap: Bitmap) => number,
  best: <T>() => BestAccumulator<T>,
  ver: V,
  ecc: E,
  data: Uint8Array,
  mask_idx?: M
): Bitmap {
  if (mask_idx === undefined) {
    const best_mask = best<M>();
    for (let mask = 0;mask < PATTERNS.length;mask++) {
      best_mask.add(penalty(draw_qr(info, ver, ecc, data, mask as M, true)), mask as M);
    }
    mask_idx = best_mask.get();
  }

  if (mask_idx === undefined) throw new Error('Cannot find mask');
  return draw_qr(info, ver, ecc, data, mask_idx);
}
