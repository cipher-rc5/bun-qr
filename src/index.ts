// file: src/index.ts
// description: qr code encoder for bun runtime
// reference: https://github.com/cipher-rc5/bun-qr

import { Bitmap } from './core/bitmap';
import { detect_type as detect_type_core, encode_payload } from './core/encoder';
import { create_interleaver } from './core/error-correction';
import { draw_qr as draw_qr_core, draw_qr_best as draw_qr_best_core, draw_template as draw_template_core, PATTERNS, zigzag as zigzag_core } from './core/layout';
import { calculate_penalty } from './core/penalty';
export type { Image, Point, Size } from './core/bitmap';

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

// Create array filled with value
function fill_arr<T>(length: number, val: T): T[] {
  return new Array(length).fill(val);
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

function interleave(ver: Version, ecc: ErrorCorrection): Coder<Uint8Array, Uint8Array> {
  return create_interleaver(info.capacity(ver, ecc));
}

function draw_template(ver: Version, ecc: ErrorCorrection, mask_idx: Mask, test: boolean = false): Bitmap {
  return draw_template_core(info, ver, ecc, mask_idx, test);
}

function zigzag(tpl: Bitmap, mask_idx: Mask, fn: (x: number, y: number, mask: boolean) => void): void {
  zigzag_core(tpl, mask_idx, fn);
}

function detect_type(str: string): EncodingType {
  return detect_type_core(info, str);
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
  return encode_payload(info, interleave, ver, ecc, data, type, encoder);
}

// Draw QR code with data
function draw_qr(ver: Version, ecc: ErrorCorrection, data: Uint8Array, mask_idx: Mask, test: boolean = false): Bitmap {
  return draw_qr_core(info, ver, ecc, data, mask_idx, test);
}

const penalty = calculate_penalty;

// Draw QR with best mask (lowest penalty)
function draw_qr_best(ver: Version, ecc: ErrorCorrection, data: Uint8Array, mask_idx?: Mask) {
  return draw_qr_best_core(info, penalty, best, ver, ecc, data, mask_idx);
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
