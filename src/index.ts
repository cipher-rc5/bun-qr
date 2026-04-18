// file: src/index.ts
// description: qr code encoder for bun runtime
// reference: https://github.com/cipher-rc5/bun-qr

import { Bitmap } from './core/bitmap';
import { detect_type as detect_type_core, encode_payload } from './core/encoder';
import { create_interleaver } from './core/error-correction';
import { draw_qr as draw_qr_core, draw_qr_best as draw_qr_best_core, draw_template as draw_template_core, PATTERNS, zigzag as zigzag_core } from './core/layout';
import { calculate_penalty } from './core/penalty';
import { BYTES, ECC_BLOCKS, WORDS_PER_BLOCK } from './core/tables';
import { alphabet, best, bin, fill_arr } from './core/utils';
export type { Image, Point, Size } from './core/bitmap';

// Internal Coder type — not part of the public API
interface Coder<F, T> {
  encode(from: F): T;
  decode(to: T): F;
}

// QR code types and constants
export const EC_MODE = ['low', 'medium', 'quartile', 'high'] as const;
export type ErrorCorrection = (typeof EC_MODE)[number];

/**
 * Nominal type for a valid QR version (1–40).
 * Obtained by calling `validate_version(n)` — do not cast directly.
 */
export type Version = number & { readonly __brand: 'QrVersion' };

export type Mask = (0 | 1 | 2 | 3 | 4 | 5 | 6 | 7) & keyof typeof PATTERNS;
export const ENCODING = ['numeric', 'alphanumeric', 'byte', 'kanji', 'eci'] as const;
export type EncodingType = (typeof ENCODING)[number];

// QR code information and utilities
const info = {
  size: { encode: (ver: Version) => 21 + 4 * (ver - 1), decode: (size: number) => (size - 17) / 4 },
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
    let d: number = ver;
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

// Convert UTF-8 string to bytes
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
  /**
   * Custom UTF-8 encoder. This function receives potentially untrusted user input (the `text`
   * argument passed to `encode_qr`). Ensure your encoder does not execute or eval the input.
   * @param text - raw user-supplied string
   * @returns UTF-8 byte representation
   */
  text_encoder?: ((text: string) => Uint8Array) | undefined,
  /** Plain number in range 1–40; validated internally before use */
  version?: number | undefined,
  mask?: number | undefined,
  border?: number | undefined,
  scale?: number | undefined
};

export type SvgQrOpts = { optimize?: boolean | undefined };

// Validation helpers
function validate_ecc(ec: ErrorCorrection): void {
  if (!EC_MODE.includes(ec)) {
    throw new Error(`Invalid error correction mode=${ec}. Expected: ${EC_MODE}`);
  }
}

function validate_encoding(enc: EncodingType): void {
  if (!ENCODING.includes(enc)) {
    throw new Error(`Encoding: invalid mode=${enc}. Expected: ${ENCODING}`);
  }
  if (enc === 'kanji' || enc === 'eci') {
    throw new Error(`Encoding: ${enc} is not supported (yet?).`);
  }
}

function validate_mask(mask: Mask): void {
  if (![0, 1, 2, 3, 4, 5, 6, 7].includes(mask) || !PATTERNS[mask]) {
    throw new Error(`Invalid mask=${mask}. Expected number [0..7]`);
  }
}

/**
 * Validate that `ver` is a safe integer in [1, 40] and return it as a branded `Version`.
 * @throws if `ver` is out of range
 */
export function validate_version(ver: number): Version {
  if (!Number.isSafeInteger(ver) || ver < 1 || ver > 40) {
    throw new Error(`Invalid version=${ver}. Expected number [1..40]`);
  }
  return ver as Version;
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

  let ver: Version | undefined;
  let data: Uint8Array | undefined;
  let err = new Error('Unknown error');

  if (opts.version !== undefined) {
    ver = validate_version(opts.version);
    data = encode(ver, ecc, text, encoding, opts.text_encoder);
  } else {
    for (let i = 1;i <= 40;i++) {
      try {
        const v = i as Version;
        data = encode(v, ecc, text, encoding, opts.text_encoder);
        ver = v;
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
