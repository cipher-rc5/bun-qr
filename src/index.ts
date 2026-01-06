// file: src/index.ts
// description: High-performance QR code encoder for Bun runtime
// reference: https://github.com/cipher-rc5/bun-qr

// QR code penalty calculation constants
const R1_RUN_LENGTH_THRESHOLD = 5;
const R2_BLOCK_PENALTY = 3;
const R3_FINDER_PATTERN_LENGTH = 11;
const R3_FINDER_PENALTY = 40;
const R4_BALANCE_STEP_PERCENT = 5;
const R4_BALANCE_STEP_POINTS = 10;

const ch_codes = { newline: 10, reset: 27 };

// Type definitions
export interface Coder<F, T> {
  encode(from: F): T;
  decode(to: T): F;
}

// Validation helpers
function assert_number(n: number) {
  if (!Number.isSafeInteger(n)) throw new Error(`integer expected: ${n}`);
}

function validate_version(ver: Version): void {
  if (!Number.isSafeInteger(ver) || ver < 1 || ver > 40) {
    throw new Error(`Invalid version=${ver}. Expected number [1..40]`);
  }
}

// Convert decimal to binary string with padding
function bin(dec: number, pad: number): string {
  return dec.toString(2).padStart(pad, '0');
}

// Proper modulo (handles negatives correctly)
function mod(a: number, b: number): number {
  const result = a % b;
  return result >= 0 ? result : b + result;
}

// Create array filled with value
function fill_arr<T>(length: number, val: T): T[] {
  return new Array(length).fill(val);
}

// Interleave byte blocks for error correction
function interleave_bytes(blocks: Uint8Array[]): Uint8Array {
  let max_len = 0;
  let total_len = 0;
  for (const block of blocks) {
    max_len = Math.max(max_len, block.length);
    total_len += block.length;
  }

  const result = new Uint8Array(total_len);
  let idx = 0;
  for (let i = 0;i < max_len;i++) {
    for (const block of blocks) {
      if (i < block.length) result[idx++] = block[i];
    }
  }

  return result;
}

// Find best value by minimizing score
function best<T>(): { add(score: number, value: T): void, get: () => T | undefined, score: () => number } {
  let best: T | undefined;
  let best_score = Infinity;
  return {
    add(score: number, value: T): void {
      if (score >= best_score) return;
      best = value;
      best_score = score;
    },
    get: (): T | undefined => best,
    score: (): number => best_score
  };
}

// Create encoder/decoder for character alphabet
function alphabet(alphabet: string): Coder<number[], string[]> & { has: (char: string) => boolean } {
  return {
    has: (char: string) => alphabet.includes(char),
    decode: (input: string[]) => {
      if (!Array.isArray(input) || (input.length && typeof input[0] !== 'string')) {
        throw new Error('alphabet.decode input should be array of strings');
      }
      return input.map((letter) => {
        if (typeof letter !== 'string') {
          throw new Error(`alphabet.decode: not string element=${letter}`);
        }
        const index = alphabet.indexOf(letter);
        if (index === -1) throw new Error(`Unknown letter: "${letter}". Allowed: ${alphabet}`);
        return index;
      });
    },
    encode: (digits: number[]) => {
      if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number')) {
        throw new Error('alphabet.encode input should be an array of numbers');
      }
      return digits.map((i) => {
        assert_number(i);
        if (i < 0 || i >= alphabet.length) {
          throw new Error(`Digit index outside alphabet: ${i} (alphabet: ${alphabet.length})`);
        }
        return alphabet[i];
      });
    }
  };
}

// Bitmap structure for QR code pattern
export type Point = { x: number, y: number };
export type Size = { height: number, width: number };
export type Image = Size & { data: Uint8Array | Uint8ClampedArray | number[] };
type DrawValue = boolean | undefined;
type DrawFn = DrawValue | ((c: Point, curr: DrawValue) => DrawValue);
type ReadFn = (c: Point, curr: DrawValue) => void;

export class Bitmap {
  private static size(size: Size | number, limit?: Size) {
    if (typeof size === 'number') size = { height: size, width: size };
    if (!Number.isSafeInteger(size.height) && size.height !== Infinity) {
      throw new Error(`Bitmap: invalid height=${size.height} (${typeof size.height})`);
    }
    if (!Number.isSafeInteger(size.width) && size.width !== Infinity) {
      throw new Error(`Bitmap: invalid width=${size.width} (${typeof size.width})`);
    }
    if (limit !== undefined) {
      size = { width: Math.min(size.width, limit.width), height: Math.min(size.height, limit.height) };
    }
    return size;
  }

  // Parse string representation to bitmap
  static from_string(s: string): Bitmap {
    s = s.replace(/^\n+/g, '').replace(/\n+$/g, '');
    const lines = s.split(String.fromCharCode(ch_codes.newline));
    const height = lines.length;
    const data = new Array(height);
    let width: number | undefined;
    for (const line of lines) {
      const row = line.split('').map((i) => {
        if (i === 'X') return true;
        if (i === ' ') return false;
        if (i === '?') return undefined;
        throw new Error(`Bitmap.from_string: unknown symbol=${i}`);
      });
      if (width && row.length !== width) {
        throw new Error(`Bitmap.from_string different row sizes: width=${width} cur=${row.length}`);
      }
      width = row.length;
      data.push(row);
    }
    if (!width) width = 0;
    return new Bitmap({ height, width }, data);
  }

  data: DrawValue[][];
  height: number;
  width: number;

  constructor (size: Size | number, data?: DrawValue[][]) {
    const { height, width } = Bitmap.size(size);
    this.data = data || Array.from({ length: height }, () => fill_arr(width, undefined));
    this.height = height;
    this.width = width;
  }

  // Get value at point
  point(p: Point): DrawValue {
    return this.data[p.y][p.x];
  }

  // Check if point is inside bitmap
  is_inside(p: Point): boolean {
    return 0 <= p.x && p.x < this.width && 0 <= p.y && p.y < this.height;
  }

  size(offset?: Point | number): { height: number, width: number } {
    if (!offset) return { height: this.height, width: this.width };
    const { x, y } = this.xy(offset);
    return { height: this.height - y, width: this.width - x };
  }

  private xy(c: Point | number) {
    if (typeof c === 'number') c = { x: c, y: c };
    if (!Number.isSafeInteger(c.x)) throw new Error(`Bitmap: invalid x=${c.x}`);
    if (!Number.isSafeInteger(c.y)) throw new Error(`Bitmap: invalid y=${c.y}`);
    c.x = mod(c.x, this.width);
    c.y = mod(c.y, this.height);
    return c;
  }

  // Draw rectangle with function or value
  rect(c: Point | number, size: Size | number, value: DrawFn): this {
    const { x, y } = this.xy(c);
    const { height, width } = Bitmap.size(size, this.size({ x, y }));
    for (let y_pos = 0;y_pos < height;y_pos++) {
      for (let x_pos = 0;x_pos < width;x_pos++) {
        this.data[y + y_pos][x + x_pos] = typeof value === 'function' ?
          value({ x: x_pos, y: y_pos }, this.data[y + y_pos][x + x_pos]) :
          value;
      }
    }
    return this;
  }

  // Read rectangle values
  rect_read(c: Point | number, size: Size | number, fn: ReadFn): this {
    return this.rect(c, size, (c, cur) => {
      fn(c, cur);
      return cur;
    });
  }

  // Draw horizontal line
  h_line(c: Point | number, len: number, value: DrawFn): this {
    return this.rect(c, { width: len, height: 1 }, value);
  }

  // Draw vertical line
  v_line(c: Point | number, len: number, value: DrawFn): this {
    return this.rect(c, { width: 1, height: len }, value);
  }

  // Add border around bitmap
  border(border = 2, value: DrawValue): Bitmap {
    const height = this.height + 2 * border;
    const width = this.width + 2 * border;
    const v = fill_arr(border, value);
    const h: DrawValue[][] = Array.from({ length: border }, () => fill_arr(width, value));
    return new Bitmap({ height, width }, [...h, ...this.data.map((i) => [...v, ...i, ...v]), ...h]);
  }

  // Embed another bitmap at position
  embed(c: Point | number, bm: Bitmap): this {
    return this.rect(c, bm.size(), ({ x, y }) => bm.data[y][x]);
  }

  // Extract rectangular slice
  rect_slice(c: Point | number, size: Size | number = this.size()): Bitmap {
    const rect = new Bitmap(Bitmap.size(size, this.size(this.xy(c))));
    this.rect(c, size, ({ x, y }, cur) => (rect.data[y][x] = cur));
    return rect;
  }

  // Transpose (swap rows and columns)
  inverse(): Bitmap {
    const { height, width } = this;
    const res = new Bitmap({ height: width, width: height });
    return res.rect({ x: 0, y: 0 }, Infinity, ({ x, y }) => this.data[x][y]);
  }

  // Scale up by factor
  scale(factor: number): Bitmap {
    if (!Number.isSafeInteger(factor) || factor > 1024) {
      throw new Error(`invalid scale factor: ${factor}`);
    }
    const { height, width } = this;
    const res = new Bitmap({ height: factor * height, width: factor * width });
    return res.rect({ x: 0, y: 0 }, Infinity, ({ x, y }) => this.data[Math.floor(y / factor)][Math.floor(x / factor)]);
  }

  // Create copy
  clone(): Bitmap {
    const res = new Bitmap(this.size());
    return res.rect({ x: 0, y: 0 }, this.size(), ({ x, y }) => this.data[y][x]);
  }

  // Verify all cells are drawn
  assert_drawn(): void {
    this.rect_read(0, Infinity, (_, cur) => {
      if (typeof cur !== 'boolean') throw new Error(`Invalid color type=${typeof cur}`);
    });
  }

  // String representation (X=black, space=white, ?=undefined)
  to_string(): string {
    return this.data.map((i) => i.map((j) => (j === undefined ? '?' : j ? 'X' : ' ')).join('')).join(String.fromCharCode(ch_codes.newline));
  }

  // ASCII art output (uses block characters)
  to_ascii(): string {
    const { height, width, data } = this;
    let out = '';
    for (let y = 0;y < height;y += 2) {
      for (let x = 0;x < width;x++) {
        const first = data[y][x];
        const second = y + 1 >= height ? true : data[y + 1][x];
        if (!first && !second) out += '█';
        else if (!first && second) out += '▀';
        else if (first && !second) out += '▄';
        else if (first && second) out += ' ';
      }
      out += String.fromCharCode(ch_codes.newline);
    }
    return out;
  }

  // Terminal output with ANSI colors
  to_term(): string {
    const cc = String.fromCharCode(ch_codes.reset);
    const reset = cc + '[0m';
    const white_bg = cc + '[1;47m  ' + reset;
    const dark_bg = cc + `[40m  ` + reset;
    return this.data.map((i) => i.map((j) => (j ? dark_bg : white_bg)).join('')).join(String.fromCharCode(ch_codes.newline));
  }

  // SVG vector output
  to_svg(optimize = true): string {
    let out = `<svg viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">`;
    let path_data = '';
    let prev_point: Point | undefined;

    this.rect_read(0, Infinity, (point, val) => {
      if (!val) return;
      const { x, y } = point;

      if (!optimize) {
        out += `<rect x="${x}" y="${y}" width="1" height="1" />`;
        return;
      }

      let m = `M${x} ${y}`;
      if (prev_point) {
        const rel_m = `m${x - prev_point.x} ${y - prev_point.y}`;
        if (rel_m.length <= m.length) m = rel_m;
      }

      const b_h = x < 10 ? `H${x}` : 'h-1';
      path_data += `${m}h1v1${b_h}Z`;
      prev_point = point;
    });

    if (optimize) out += `<path d="${path_data}"/>`;
    out += `</svg>`;
    return out;
  }

  // Uncompressed GIF output
  to_gif(): Uint8Array {
    const u16_le = (i: number) => [i & 0xff, (i >>> 8) & 0xff];
    const dims = [...u16_le(this.width), ...u16_le(this.height)];
    const data: number[] = [];
    this.rect_read(0, Infinity, (_, cur) => data.push(+(cur === true)));
    const N = 126;
    const bytes = [
      0x47,
      0x49,
      0x46,
      0x38,
      0x37,
      0x61,
      ...dims,
      0xf6,
      0x00,
      0x00,
      0xff,
      0xff,
      0xff,
      ...fill_arr(3 * 127, 0x00),
      0x2c,
      0x00,
      0x00,
      0x00,
      0x00,
      ...dims,
      0x00,
      0x07
    ];
    const full_chunks = Math.floor(data.length / N);
    for (let i = 0;i < full_chunks;i++) {
      bytes.push(N + 1, 0x80, ...data.slice(N * i, N * (i + 1)).map((i) => +i));
    }
    bytes.push((data.length % N) + 1, 0x80, ...data.slice(full_chunks * N).map((i) => +i));
    bytes.push(0x01, 0x81, 0x00, 0x3b);
    return new Uint8Array(bytes);
  }

  // Convert to raw image data (RGB or RGBA)
  to_image(is_rgb = false): Image {
    const { height, width } = this.size();
    const data = new Uint8Array(height * width * (is_rgb ? 3 : 4));
    let i = 0;
    for (let y = 0;y < height;y++) {
      for (let x = 0;x < width;x++) {
        const value = !!this.data[y][x] ? 0 : 255;
        data[i++] = value;
        data[i++] = value;
        data[i++] = value;
        if (!is_rgb) data[i++] = 255;
      }
    }
    return { height, width, data };
  }
}

// QR code types and constants
export const EC_MODE = ['low', 'medium', 'quartile', 'high'] as const;
export type ErrorCorrection = (typeof EC_MODE)[number];
export type Version = number;
export type Mask = (0 | 1 | 2 | 3 | 4 | 5 | 6 | 7) & keyof typeof PATTERNS;
export const ENCODING = ['numeric', 'alphanumeric', 'byte', 'kanji', 'eci'] as const;
export type EncodingType = (typeof ENCODING)[number];

// QR code capacity lookup tables
const BYTES = [
  26,
  44,
  70,
  100,
  134,
  172,
  196,
  242,
  292,
  346,
  404,
  466,
  532,
  581,
  655,
  733,
  815,
  901,
  991,
  1085,
  1156,
  1258,
  1364,
  1474,
  1588,
  1706,
  1828,
  1921,
  2051,
  2185,
  2323,
  2465,
  2611,
  2761,
  2876,
  3034,
  3196,
  3362,
  3532,
  3706
];

const WORDS_PER_BLOCK = {
  low: [
    7,
    10,
    15,
    20,
    26,
    18,
    20,
    24,
    30,
    18,
    20,
    24,
    26,
    30,
    22,
    24,
    28,
    30,
    28,
    28,
    28,
    28,
    30,
    30,
    26,
    28,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30
  ],
  medium: [
    10,
    16,
    26,
    18,
    24,
    16,
    18,
    22,
    22,
    26,
    30,
    22,
    22,
    24,
    24,
    28,
    28,
    26,
    26,
    26,
    26,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28
  ],
  quartile: [
    13,
    22,
    18,
    26,
    18,
    24,
    18,
    22,
    20,
    24,
    28,
    26,
    24,
    20,
    30,
    24,
    28,
    28,
    26,
    30,
    28,
    30,
    30,
    30,
    30,
    28,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30
  ],
  high: [
    17,
    28,
    22,
    16,
    22,
    28,
    26,
    26,
    24,
    28,
    24,
    28,
    22,
    24,
    24,
    30,
    28,
    28,
    26,
    28,
    30,
    24,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30
  ]
};

const ECC_BLOCKS = {
  low: [
    1,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    4,
    4,
    4,
    4,
    4,
    6,
    6,
    6,
    6,
    7,
    8,
    8,
    9,
    9,
    10,
    12,
    12,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    19,
    20,
    21,
    22,
    24,
    25
  ],
  medium: [
    1,
    1,
    1,
    2,
    2,
    4,
    4,
    4,
    5,
    5,
    5,
    8,
    9,
    9,
    10,
    10,
    11,
    13,
    14,
    16,
    17,
    17,
    18,
    20,
    21,
    23,
    25,
    26,
    28,
    29,
    31,
    33,
    35,
    37,
    38,
    40,
    43,
    45,
    47,
    49
  ],
  quartile: [
    1,
    1,
    2,
    2,
    4,
    4,
    6,
    6,
    8,
    8,
    8,
    10,
    12,
    16,
    12,
    17,
    16,
    18,
    21,
    20,
    23,
    23,
    25,
    27,
    29,
    34,
    34,
    35,
    38,
    40,
    43,
    45,
    48,
    51,
    53,
    56,
    59,
    62,
    65,
    68
  ],
  high: [
    1,
    1,
    2,
    4,
    4,
    4,
    5,
    6,
    8,
    8,
    11,
    11,
    16,
    16,
    18,
    16,
    19,
    21,
    25,
    25,
    25,
    34,
    30,
    32,
    35,
    37,
    40,
    42,
    45,
    48,
    51,
    54,
    57,
    60,
    63,
    66,
    70,
    74,
    77,
    81
  ]
};

// QR code information and utilities
const info = {
  size: { encode: (ver: Version) => 21 + 4 * (ver - 1), decode: (size: number) => (size - 17) / 4 } as Coder<Version, number>,
  size_type: (ver: Version) => Math.floor((ver + 7) / 17),
  alignment_patterns(ver: Version) {
    if (ver === 1) return [];
    const first = 6;
    const last = info.size.encode(ver) - first - 1;
    const distance = last - first;
    const count = Math.ceil(distance / 28);
    let interval = Math.floor(distance / count);
    if (interval % 2) interval += 1;
    else if ((distance % count) * 2 >= count) interval += 2;
    const res = [first];
    for (let m = 1;m < count;m++) res.push(last - (count - m) * interval);
    res.push(last);
    return res;
  },
  ec_code: { low: 0b01, medium: 0b00, quartile: 0b11, high: 0b10 } as Record<ErrorCorrection, number>,
  format_mask: 0b101010000010010,
  format_bits(ecc: ErrorCorrection, mask_idx: Mask) {
    const data = (info.ec_code[ecc] << 3) | mask_idx;
    let d = data;
    for (let i = 0;i < 10;i++) d = (d << 1) ^ ((d >> 9) * 0b10100110111);
    return ((data << 10) | d) ^ info.format_mask;
  },
  version_bits(ver: Version) {
    let d = ver;
    for (let i = 0;i < 12;i++) d = (d << 1) ^ ((d >> 11) * 0b1111100100101);
    return (ver << 12) | d;
  },
  alphabet: { numeric: alphabet('0123456789'), alphanumerc: alphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:') },
  length_bits(ver: Version, type: EncodingType) {
    const table: Record<EncodingType, [number, number, number]> = {
      numeric: [10, 12, 14],
      alphanumeric: [9, 11, 13],
      byte: [8, 16, 16],
      kanji: [8, 10, 12],
      eci: [0, 0, 0]
    };
    return table[type][info.size_type(ver)];
  },
  mode_bits: { numeric: '0001', alphanumeric: '0010', byte: '0100', kanji: '1000', eci: '0111' },
  capacity(ver: Version, ecc: ErrorCorrection) {
    const bytes = BYTES[ver - 1];
    const words = WORDS_PER_BLOCK[ecc][ver - 1];
    const num_blocks = ECC_BLOCKS[ecc][ver - 1];
    const block_len = Math.floor(bytes / num_blocks) - words;
    const short_blocks = num_blocks - (bytes % num_blocks);
    return {
      words,
      num_blocks,
      short_blocks,
      block_len,
      capacity: (bytes - words * num_blocks) * 8,
      total: (words + block_len) * num_blocks + num_blocks - short_blocks
    };
  }
};

// QR code mask patterns (8 different patterns)
const PATTERNS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 == 0,
  (_x, y) => y % 2 == 0,
  (x, _y) => x % 3 == 0,
  (x, y) => (x + y) % 3 == 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 == 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) == 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 == 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 == 0
] as const;

// Galois Field (GF256) arithmetic for error correction
const GF = {
  tables: ((p_poly) => {
    const exp = fill_arr(256, 0);
    const log = fill_arr(256, 0);
    for (let i = 0, x = 1;i < 256;i++) {
      exp[i] = x;
      log[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= p_poly;
    }
    return { exp, log };
  })(0x11d),
  exp: (x: number) => GF.tables.exp[x],
  log(x: number) {
    if (x === 0) throw new Error(`GF.log: invalid arg=${x}`);
    return GF.tables.log[x] % 255;
  },
  mul(x: number, y: number) {
    if (x === 0 || y === 0) return 0;
    return GF.tables.exp[(GF.tables.log[x] + GF.tables.log[y]) % 255];
  },
  add: (x: number, y: number) => x ^ y,
  pow: (x: number, e: number) => GF.tables.exp[(GF.tables.log[x] * e) % 255],
  inv(x: number) {
    if (x === 0) throw new Error(`GF.inverse: invalid arg=${x}`);
    return GF.tables.exp[255 - GF.tables.log[x]];
  },
  polynomial(poly: number[]) {
    if (poly.length == 0) throw new Error('GF.polymomial: invalid length');
    if (poly[0] !== 0) return poly;
    let i = 0;
    for (;i < poly.length - 1 && poly[i] == 0;i++);
    return poly.slice(i);
  },
  monomial(degree: number, coefficient: number) {
    if (degree < 0) throw new Error(`GF.monomial: invalid degree=${degree}`);
    if (coefficient == 0) return [0];
    let coefficients = fill_arr(degree + 1, 0);
    coefficients[0] = coefficient;
    return GF.polynomial(coefficients);
  },
  degree: (a: number[]) => a.length - 1,
  coefficient: (a: any, degree: number) => a[GF.degree(a) - degree],
  mul_poly(a: number[], b: number[]) {
    if (a[0] === 0 || b[0] === 0) return [0];
    const res = fill_arr(a.length + b.length - 1, 0);
    for (let i = 0;i < a.length;i++) {
      for (let j = 0;j < b.length;j++) {
        res[i + j] = GF.add(res[i + j], GF.mul(a[i], b[j]));
      }
    }
    return GF.polynomial(res);
  },
  mul_poly_scalar(a: number[], scalar: number) {
    if (scalar == 0) return [0];
    if (scalar == 1) return a;
    const res = fill_arr(a.length, 0);
    for (let i = 0;i < a.length;i++) res[i] = GF.mul(a[i], scalar);
    return GF.polynomial(res);
  },
  mul_poly_monomial(a: number[], degree: number, coefficient: number) {
    if (degree < 0) throw new Error('GF.mul_poly_monomial: invalid degree');
    if (coefficient == 0) return [0];
    const res = fill_arr(a.length + degree, 0);
    for (let i = 0;i < a.length;i++) res[i] = GF.mul(a[i], coefficient);
    return GF.polynomial(res);
  },
  add_poly(a: number[], b: number[]) {
    if (a[0] === 0) return b;
    if (b[0] === 0) return a;
    let smaller = a;
    let larger = b;
    if (smaller.length > larger.length) [smaller, larger] = [larger, smaller];
    let sum_diff = fill_arr(larger.length, 0);
    let length_diff = larger.length - smaller.length;
    let s = larger.slice(0, length_diff);
    for (let i = 0;i < s.length;i++) sum_diff[i] = s[i];
    for (let i = length_diff;i < larger.length;i++) {
      sum_diff[i] = GF.add(smaller[i - length_diff], larger[i]);
    }
    return GF.polynomial(sum_diff);
  },
  remainder_poly(data: number[], divisor: number[]) {
    const out = Array.from(data);
    for (let i = 0;i < data.length - divisor.length + 1;i++) {
      const elm = out[i];
      if (elm === 0) continue;
      for (let j = 1;j < divisor.length;j++) {
        if (divisor[j] !== 0) out[i + j] = GF.add(out[i + j], GF.mul(divisor[j], elm));
      }
    }
    return out.slice(data.length - divisor.length + 1, out.length);
  },
  divisor_poly(degree: number) {
    let g = [1];
    for (let i = 0;i < degree;i++) g = GF.mul_poly(g, [1, GF.pow(2, i)]);
    return g;
  },
  eval_poly(poly: any, a: number) {
    if (a == 0) return GF.coefficient(poly, 0);
    let res = poly[0];
    for (let i = 1;i < poly.length;i++) res = GF.add(GF.mul(a, res), poly[i]);
    return res;
  },
  euclidian(a: number[], b: number[], R: number) {
    if (GF.degree(a) < GF.degree(b)) [a, b] = [b, a];
    let r_last = a;
    let r = b;
    let t_last = [0];
    let t = [1];
    while (2 * GF.degree(r) >= R) {
      let r_last_last = r_last;
      let t_last_last = t_last;
      r_last = r;
      t_last = t;
      if (r_last[0] === 0) throw new Error('r_last[0] === 0');
      r = r_last_last;

      let q = [0];
      const dlt_inverse = GF.inv(r_last[0]);
      while (GF.degree(r) >= GF.degree(r_last) && r[0] !== 0) {
        const degree_diff = GF.degree(r) - GF.degree(r_last);
        const scale = GF.mul(r[0], dlt_inverse);
        q = GF.add_poly(q, GF.monomial(degree_diff, scale));
        r = GF.add_poly(r, GF.mul_poly_monomial(r_last, degree_diff, scale));
      }
      q = GF.mul_poly(q, t_last);
      t = GF.add_poly(q, t_last_last);
      if (GF.degree(r) >= GF.degree(r_last)) {
        throw new Error(`Division failed r: ${r}, r_last: ${r_last}`);
      }
    }
    const sigma_tilde_at_zero = GF.coefficient(t, 0);
    if (sigma_tilde_at_zero == 0) throw new Error('sigma_tilde(0) was zero');
    const inverse = GF.inv(sigma_tilde_at_zero);
    return [GF.mul_poly_scalar(t, inverse), GF.mul_poly_scalar(r, inverse)];
  }
};

// Reed-Solomon error correction encoder/decoder
function RS(ecc_words: number): Coder<Uint8Array, Uint8Array> {
  return {
    encode(from: Uint8Array) {
      const d = GF.divisor_poly(ecc_words);
      const pol = Array.from(from);
      pol.push(...d.slice(0, -1).fill(0));
      return Uint8Array.from(GF.remainder_poly(pol, d));
    },
    decode(to: Uint8Array) {
      const res = to.slice();
      const poly = GF.polynomial(Array.from(to));
      let syndrome = fill_arr(ecc_words, 0);
      let has_error = false;
      for (let i = 0;i < ecc_words;i++) {
        const evl = GF.eval_poly(poly, GF.exp(i));
        syndrome[syndrome.length - 1 - i] = evl;
        if (evl !== 0) has_error = true;
      }
      if (!has_error) return res;
      syndrome = GF.polynomial(syndrome);
      const monomial = GF.monomial(ecc_words, 1);
      const [error_locator, error_evaluator] = GF.euclidian(monomial, syndrome, ecc_words);
      const locations = fill_arr(GF.degree(error_locator), 0);
      let e = 0;
      for (let i = 1;i < 256 && e < locations.length;i++) {
        if (GF.eval_poly(error_locator, i) === 0) locations[e++] = GF.inv(i);
      }
      if (e !== locations.length) throw new Error('RS.decode: invalid errors number');
      for (let i = 0;i < locations.length;i++) {
        const pos = res.length - 1 - GF.log(locations[i]);
        if (pos < 0) throw new Error('RS.decode: invalid error location');
        const xi_inverse = GF.inv(locations[i]);
        let denominator = 1;
        for (let j = 0;j < locations.length;j++) {
          if (i === j) continue;
          denominator = GF.mul(denominator, GF.add(1, GF.mul(locations[j], xi_inverse)));
        }
        res[pos] = GF.add(res[pos], GF.mul(GF.eval_poly(error_evaluator, xi_inverse), GF.inv(denominator)));
      }
      return res;
    }
  };
}

// Interleave data blocks for QR error correction
function interleave(ver: Version, ecc: ErrorCorrection): Coder<Uint8Array, Uint8Array> {
  const { words, short_blocks, num_blocks, block_len, total } = info.capacity(ver, ecc);
  const rs = RS(words);
  return {
    encode(bytes: Uint8Array) {
      const blocks: Uint8Array[] = [];
      const ecc_blocks: Uint8Array[] = [];
      for (let i = 0;i < num_blocks;i++) {
        const is_short = i < short_blocks;
        const len = block_len + (is_short ? 0 : 1);
        blocks.push(bytes.subarray(0, len));
        ecc_blocks.push(rs.encode(bytes.subarray(0, len)));
        bytes = bytes.subarray(len);
      }
      const res_blocks = interleave_bytes(blocks);
      const res_ecc = interleave_bytes(ecc_blocks);
      const res = new Uint8Array(res_blocks.length + res_ecc.length);
      res.set(res_blocks);
      res.set(res_ecc, res_blocks.length);
      return res;
    },
    decode(data: Uint8Array) {
      if (data.length !== total) {
        throw new Error(`interleave.decode: len(data)=${data.length}, total=${total}`);
      }
      const blocks = [];
      for (let i = 0;i < num_blocks;i++) {
        const is_short = i < short_blocks;
        blocks.push(new Uint8Array(words + block_len + (is_short ? 0 : 1)));
      }
      let pos = 0;
      for (let i = 0;i < block_len;i++) {
        for (let j = 0;j < num_blocks;j++) blocks[j][i] = data[pos++];
      }
      for (let j = short_blocks;j < num_blocks;j++) blocks[j][block_len] = data[pos++];
      for (let i = block_len;i < block_len + words;i++) {
        for (let j = 0;j < num_blocks;j++) {
          const is_short = j < short_blocks;
          blocks[j][i + (is_short ? 0 : 1)] = data[pos++];
        }
      }
      const res: number[] = [];
      for (const block of blocks) res.push(...Array.from(rs.decode(block)).slice(0, -words));
      return Uint8Array.from(res);
    }
  };
}

// Draw QR code template (finder patterns, timing, format info)
function draw_template(ver: Version, ecc: ErrorCorrection, mask_idx: Mask, test: boolean = false): Bitmap {
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
  b = b.h_line({ x: 0, y: 6 }, Infinity, ({ x }, cur) => (cur === undefined ? x % 2 == 0 : cur)).v_line(
    { x: 6, y: 0 },
    Infinity,
    ({ y }, cur) => (cur === undefined ? y % 2 == 0 : cur)
  );
  {
    const bits = info.format_bits(ecc, mask_idx);
    const get_bit = (i: number) => !test && ((bits >> i) & 1) == 1;
    for (let i = 0;i < 6;i++) b.data[i][8] = get_bit(i);
    for (let i = 6;i < 8;i++) b.data[i + 1][8] = get_bit(i);
    for (let i = 8;i < 15;i++) b.data[size - 15 + i][8] = get_bit(i);
    for (let i = 0;i < 8;i++) b.data[8][size - i - 1] = get_bit(i);
    for (let i = 8;i < 9;i++) b.data[8][15 - i - 1 + 1] = get_bit(i);
    for (let i = 9;i < 15;i++) b.data[8][15 - i - 1] = get_bit(i);
    b.data[size - 8][8] = !test;
  }
  if (ver >= 7) {
    const bits = info.version_bits(ver);
    for (let i = 0;i < 18;i += 1) {
      const bit = !test && ((bits >> i) & 1) == 1;
      const x = Math.floor(i / 3);
      const y = (i % 3) + size - 8 - 3;
      b.data[x][y] = bit;
      b.data[y][x] = bit;
    }
  }
  return b;
}

// Fill QR code in zigzag pattern
function zigzag(tpl: Bitmap, mask_idx: Mask, fn: (x: number, y: number, mask: boolean) => void): void {
  const size = tpl.height;
  const pattern = PATTERNS[mask_idx];
  let dir = -1;
  let y = size - 1;
  for (let x_offset = size - 1;x_offset > 0;x_offset -= 2) {
    if (x_offset == 6) x_offset = 5;
    for (;;y += dir) {
      for (let j = 0;j < 2;j += 1) {
        const x = x_offset - j;
        if (tpl.data[y][x] !== undefined) continue;
        fn(x, y, pattern(x, y));
      }
      if (y + dir < 0 || y + dir >= size) break;
    }
    dir = -dir;
  }
}

// Auto-detect best encoding type for string
function detect_type(str: string): EncodingType {
  let type: EncodingType = 'numeric';
  for (let x of str) {
    if (info.alphabet.numeric.has(x)) continue;
    type = 'alphanumeric';
    if (!info.alphabet.alphanumerc.has(x)) return 'byte';
  }
  return type;
}

// Convert UTF-8 string to bytes (Bun native)
export function utf8_to_bytes(str: string): Uint8Array {
  if (typeof str !== 'string') throw new Error(`utf8_to_bytes expected string, got ${typeof str}`);
  return new TextEncoder().encode(str);
}

// Encode data with error correction
function encode(
  ver: Version,
  ecc: ErrorCorrection,
  data: string,
  type: EncodingType,
  encoder: (value: string) => Uint8Array = utf8_to_bytes
): Uint8Array {
  let encoded = '';
  let data_len = data.length;
  if (type === 'numeric') {
    const t = info.alphabet.numeric.decode(data.split(''));
    const n = t.length;
    for (let i = 0;i < n - 2;i += 3) encoded += bin(t[i] * 100 + t[i + 1] * 10 + t[i + 2], 10);
    if (n % 3 === 1) {
      encoded += bin(t[n - 1], 4);
    } else if (n % 3 === 2) {
      encoded += bin(t[n - 2] * 10 + t[n - 1], 7);
    }
  } else if (type === 'alphanumeric') {
    const t = info.alphabet.alphanumerc.decode(data.split(''));
    const n = t.length;
    for (let i = 0;i < n - 1;i += 2) encoded += bin(t[i] * 45 + t[i + 1], 11);
    if (n % 2 == 1) encoded += bin(t[n - 1], 6);
  } else if (type === 'byte') {
    const utf8 = encoder(data);
    data_len = utf8.length;
    encoded = Array.from(utf8).map((i) => bin(i, 8)).join('');
  } else {
    throw new Error('encode: unsupported type');
  }
  const { capacity } = info.capacity(ver, ecc);
  const len = bin(data_len, info.length_bits(ver, type));
  let bits = info.mode_bits[type] + len + encoded;
  if (bits.length > capacity) throw new Error('Capacity overflow');
  bits += '0'.repeat(Math.min(4, Math.max(0, capacity - bits.length)));
  if (bits.length % 8) bits += '0'.repeat(8 - (bits.length % 8));
  const padding = '1110110000010001';
  for (let idx = 0;bits.length !== capacity;idx++) bits += padding[idx % padding.length];
  const bytes = Uint8Array.from(bits.match(/(.{8})/g)!.map((i) => Number(`0b${i}`)));
  return interleave(ver, ecc).encode(bytes);
}

// Draw QR code with data
function draw_qr(ver: Version, ecc: ErrorCorrection, data: Uint8Array, mask_idx: Mask, test: boolean = false): Bitmap {
  const b = draw_template(ver, ecc, mask_idx, test);
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

// Calculate penalty for run lengths (consecutive same color)
function calculate_row_run_penalty(row_bits: readonly boolean[]): number {
  const module_count = row_bits.length;
  if (module_count <= 1) return 0;

  let penalty = 0;
  let run_length = 1;
  let previous_color = row_bits[0];

  for (let i = 1;i < module_count;i++) {
    const current_color = row_bits[i];
    if (current_color === previous_color) {
      run_length++;
    } else {
      if (run_length >= R1_RUN_LENGTH_THRESHOLD) penalty += run_length - 2;
      run_length = 1;
      previous_color = current_color;
    }
  }

  if (run_length >= R1_RUN_LENGTH_THRESHOLD) penalty += run_length - 2;

  return penalty;
}

// Calculate penalty for column runs
function calculate_column_run_penalty(bitmap: readonly boolean[][], column_index: number, column_height: number): number {
  if (column_height <= 1) return 0;

  let penalty = 0;
  let run_length = 1;
  let previous_color = bitmap[0][column_index];

  for (let y = 1;y < column_height;y++) {
    const current_color = bitmap[y][column_index];
    if (current_color === previous_color) {
      run_length++;
    } else {
      if (run_length >= R1_RUN_LENGTH_THRESHOLD) penalty += run_length - 2;
      run_length = 1;
      previous_color = current_color;
    }
  }

  if (run_length >= R1_RUN_LENGTH_THRESHOLD) penalty += run_length - 2;

  return penalty;
}

// Calculate penalty for finder-like patterns in rows
function calculate_row_finder_penalty(row_bits: readonly boolean[]): number {
  const row_length = row_bits.length;
  if (row_length < R3_FINDER_PATTERN_LENGTH) return 0;

  let penalty = 0;
  const last_start = row_length - R3_FINDER_PATTERN_LENGTH;

  for (let i = 0;i <= last_start;i++) {
    const light_4_then_finder_7 = !row_bits[i] &&
      !row_bits[i + 1] &&
      !row_bits[i + 2] &&
      !row_bits[i + 3] &&
      row_bits[i + 4] &&
      !row_bits[i + 5] &&
      row_bits[i + 6] &&
      row_bits[i + 7] &&
      row_bits[i + 8] &&
      !row_bits[i + 9] &&
      row_bits[i + 10];

    const finder_7_then_light_4 = row_bits[i] &&
      !row_bits[i + 1] &&
      row_bits[i + 2] &&
      row_bits[i + 3] &&
      row_bits[i + 4] &&
      !row_bits[i + 5] &&
      row_bits[i + 6] &&
      !row_bits[i + 7] &&
      !row_bits[i + 8] &&
      !row_bits[i + 9] &&
      !row_bits[i + 10];

    if (light_4_then_finder_7 || finder_7_then_light_4) penalty += R3_FINDER_PENALTY;
  }
  return penalty;
}

// Calculate penalty for finder-like patterns in columns
function calculate_column_finder_penalty(matrix: readonly boolean[][], row_index: number, width: number): number {
  if (width < R3_FINDER_PATTERN_LENGTH) return 0;

  let penalty = 0;
  const y = row_index;
  const last_start = width - R3_FINDER_PATTERN_LENGTH;

  for (let x = 0;x <= last_start;x++) {
    const light_4_then_finder_7 = !matrix[x][y] &&
      !matrix[x + 1][y] &&
      !matrix[x + 2][y] &&
      !matrix[x + 3][y] &&
      matrix[x + 4][y] &&
      !matrix[x + 5][y] &&
      matrix[x + 6][y] &&
      matrix[x + 7][y] &&
      matrix[x + 8][y] &&
      !matrix[x + 9][y] &&
      matrix[x + 10][y];

    const finder_7_then_light_4 = matrix[x][y] &&
      !matrix[x + 1][y] &&
      matrix[x + 2][y] &&
      matrix[x + 3][y] &&
      matrix[x + 4][y] &&
      !matrix[x + 5][y] &&
      matrix[x + 6][y] &&
      !matrix[x + 7][y] &&
      !matrix[x + 8][y] &&
      !matrix[x + 9][y] &&
      !matrix[x + 10][y];

    if (light_4_then_finder_7 || finder_7_then_light_4) penalty += R3_FINDER_PENALTY;
  }
  return penalty;
}

// Calculate total penalty score for mask selection
function penalty(bitmap: Bitmap): number {
  const matrix = bitmap.data as boolean[][];
  const width = bitmap.width | 0;
  const height = bitmap.height | 0;

  if (width === 0 || height === 0) return 0;

  let run_penalty = 0;
  for (let x = 0;x < width;x++) run_penalty += calculate_row_run_penalty(matrix[x]);
  for (let y = 0;y < height;y++) run_penalty += calculate_column_run_penalty(matrix, y, width);

  let block_penalty = 0;
  const last_col = width - 1;
  const last_row = height - 1;
  for (let x = 0;x < last_col;x++) {
    const col = matrix[x];
    const next_col = matrix[x + 1];
    for (let y = 0;y < last_row;y++) {
      const cell = col[y];
      if (cell === next_col[y] && cell === col[y + 1] && cell === next_col[y + 1]) {
        block_penalty += R2_BLOCK_PENALTY;
      }
    }
  }

  let finder_penalty = 0;
  for (let x = 0;x < width;x++) finder_penalty += calculate_row_finder_penalty(matrix[x]);
  for (let y = 0;y < height;y++) finder_penalty += calculate_column_finder_penalty(matrix, y, width);

  let dark_count = 0;
  for (let x = 0;x < width;x++) {
    const col = matrix[x];
    for (let y = 0;y < height;y++) if (col[y]) dark_count++;
  }
  const module_count = width * height;
  const dark_percent = (dark_count * 100) / module_count;
  const deviation = Math.abs(dark_percent - 50);
  const balance_penalty = R4_BALANCE_STEP_POINTS * Math.floor(deviation / R4_BALANCE_STEP_PERCENT);

  return run_penalty + block_penalty + finder_penalty + balance_penalty;
}

// Draw QR with best mask (lowest penalty)
function draw_qr_best(ver: Version, ecc: ErrorCorrection, data: Uint8Array, mask_idx?: Mask) {
  if (mask_idx === undefined) {
    const best_mask = best<Mask>();
    for (let mask = 0;mask < PATTERNS.length;mask++) {
      best_mask.add(penalty(draw_qr(ver, ecc, data, mask as Mask, true)), mask as Mask);
    }
    mask_idx = best_mask.get();
  }
  if (mask_idx === undefined) throw new Error('Cannot find mask');
  return draw_qr(ver, ecc, data, mask_idx);
}

export type QrOpts = {
  ecc?: ErrorCorrection | undefined,
  encoding?: EncodingType | undefined,
  text_encoder?: (text: string) => Uint8Array,
  version?: Version | undefined,
  mask?: number | undefined,
  border?: number | undefined,
  scale?: number | undefined
};

export type SvgQrOpts = { optimize?: boolean | undefined };

// Validation helpers
function validate_ecc(ec: ErrorCorrection) {
  if (!EC_MODE.includes(ec)) {
    throw new Error(`Invalid error correction mode=${ec}. Expected: ${EC_MODE}`);
  }
}

function validate_encoding(enc: EncodingType) {
  if (!ENCODING.includes(enc)) {
    throw new Error(`Encoding: invalid mode=${enc}. Expected: ${ENCODING}`);
  }
  if (enc === 'kanji' || enc === 'eci') {
    throw new Error(`Encoding: ${enc} is not supported (yet?).`);
  }
}

function validate_mask(mask: Mask) {
  if (![0, 1, 2, 3, 4, 5, 6, 7].includes(mask) || !PATTERNS[mask]) {
    throw new Error(`Invalid mask=${mask}. Expected number [0..7]`);
  }
}

export type Output = 'raw' | 'ascii' | 'term' | 'gif' | 'svg';

// Main QR code encoder (public API)
export function encode_qr(text: string, output: 'raw', opts?: QrOpts): boolean[][];
export function encode_qr(text: string, output: 'ascii' | 'term', opts?: QrOpts): string;
export function encode_qr(text: string, output: 'svg', opts?: QrOpts & SvgQrOpts): string;
export function encode_qr(text: string, output: 'gif', opts?: QrOpts): Uint8Array;
export function encode_qr(text: string, output: Output = 'raw', opts: QrOpts & SvgQrOpts = {}) {
  const ecc = opts.ecc !== undefined ? opts.ecc : 'medium';
  validate_ecc(ecc);
  const encoding = opts.encoding !== undefined ? opts.encoding : detect_type(text);
  validate_encoding(encoding);
  if (opts.mask !== undefined) validate_mask(opts.mask as Mask);
  let ver = opts.version;
  let data, err = new Error('Unknown error');
  if (ver !== undefined) {
    validate_version(ver);
    data = encode(ver, ecc, text, encoding, opts.text_encoder);
  } else {
    for (let i = 1;i <= 40;i++) {
      try {
        data = encode(i, ecc, text, encoding, opts.text_encoder);
        ver = i;
        break;
      } catch (e) {
        err = e as Error;
      }
    }
  }
  if (!ver || !data) throw err;
  let res = draw_qr_best(ver, ecc, data, opts.mask as Mask);
  res.assert_drawn();
  const border = opts.border === undefined ? 2 : opts.border;
  if (!Number.isSafeInteger(border)) throw new Error(`invalid border type=${typeof border}`);
  res = res.border(border, false);
  if (opts.scale !== undefined) res = res.scale(opts.scale);
  if (output === 'raw') return res.data;
  else if (output === 'ascii') return res.to_ascii();
  else if (output === 'svg') return res.to_svg(opts.optimize);
  else if (output === 'gif') return res.to_gif();
  else if (output === 'term') return res.to_term();
  else throw new Error(`Unknown output: ${output}`);
}

// Default export
export default encode_qr;

// Utility exports for advanced usage
export const utils = { best, bin, draw_template, fill_arr, info, interleave, validate_version, zigzag };

// Internal exports for testing
export const _tests = { Bitmap, info, detect_type, encode, draw_qr, penalty, PATTERNS };
