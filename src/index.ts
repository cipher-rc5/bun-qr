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
  ec_code: { low: 0b01, medium: 0b00, quartile: 0b11, high: 0b10 },
  format_mask: 0b101010000010010,
  format_bits(ecc: ErrorCorrection, mask_idx: Mask) {
    // `info` is re-exported via `utils`, so both arguments can arrive unvalidated. Without
    // these guards an unknown ecc yielded `undefined << 3` === 0, silently aliasing to
    // `medium`'s code, and an out-of-range mask overflowed the 15-bit format field.
    const ec_code = info.ec_code[ecc];
    if (ec_code === undefined) {
      throw new Error(`Invalid error correction mode=${ecc}. Expected: ${EC_MODE}`);
    }
    validate_mask(mask_idx);
    const data = (ec_code << 3) | mask_idx;
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
    // size_type(ver) is floor((ver+7)/17), which is 0..2 for every valid version 1–40 and
    // so always indexes the 3-tuple. `info` is publicly re-exported via `utils`, so an
    // out-of-range version is rejected rather than silently yielding the wrong bit count.
    const bits = table[type][info.size_type(ver)];
    if (bits === undefined) throw new Error(`Invalid version=${ver}. Expected number [1..40]`);
    return bits;
  },
  mode_bits: { numeric: '0001', alphanumeric: '0010', byte: '0100', kanji: '1000', eci: '0111' },
  capacity(ver: Version, ecc: ErrorCorrection) {
    // `info` is re-exported via `utils`, so `ver` and `ecc` can arrive here unvalidated
    // despite the branded type. The ecc key is checked first: indexing the per-ecc tables
    // with an unknown key threw a raw `TypeError` instead of the actionable message below.
    const words_table = WORDS_PER_BLOCK[ecc];
    const blocks_table = ECC_BLOCKS[ecc];
    if (words_table === undefined || blocks_table === undefined) {
      throw new Error(`Invalid error correction mode=${ecc}. Expected: ${EC_MODE}`);
    }
    // The tables hold exactly 40 entries; without this check an out-of-range version
    // silently produced NaN capacities instead of failing.
    const bytes = BYTES[ver - 1];
    const words = words_table[ver - 1];
    const num_blocks = blocks_table[ver - 1];
    if (bytes === undefined || words === undefined || num_blocks === undefined) {
      throw new Error(`Invalid version=${ver}. Expected number [1..40]`);
    }
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

/**
 * Re-validates its arguments because `utils` re-exports it: the branded `Version` type is
 * erased at runtime, and `info.size.encode` is pure arithmetic that happily produced a
 * 17x17 symbol for version 0 or a 27x27 one for version 2.5.
 */
function draw_template(ver: Version, ecc: ErrorCorrection, mask_idx: Mask, test: boolean = false): Bitmap {
  const version = validate_version(ver);
  validate_ecc(ecc);
  validate_mask(mask_idx);
  return draw_template_core(info, version, ecc, mask_idx, test);
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
  encoding?:
    | EncodingType
    | undefined,
  /**
   * Custom UTF-8 encoder. This function receives potentially untrusted user input (the `text`
   * argument passed to `encode_qr`). Ensure your encoder does not execute or eval the input.
   * @param text - raw user-supplied string
   * @returns UTF-8 byte representation
   */
  text_encoder?:
    | ((text: string) => Uint8Array)
    | undefined,
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
 * Upper bound on the quiet-zone width, in modules.
 *
 * ISO/IEC 18004 specifies a 4-module quiet zone; the largest symbol is 177 modules wide, so
 * a border wider than the biggest possible symbol is already well past any legitimate use.
 * 1024 is chosen to match the `[1..1024]` bound `Bitmap.scale` applies, and caps the matrix
 * at 177 + 2*1024 = 2225 modules per side (~4.9M cells) instead of the previously unbounded
 * allocation — `border: 20000` built a 40021x40021 matrix and `border: 100000` never returned.
 */
const MAX_BORDER = 1024;

function validate_border(border: number): void {
  // The old check tested only `Number.isSafeInteger`, so negatives fell through to
  // `new Array(-1)` inside `fill_arr` and surfaced as a raw `RangeError`.
  if (!Number.isSafeInteger(border) || border < 0 || border > MAX_BORDER) {
    throw new Error(`invalid border: ${border}. Expected number [0..${MAX_BORDER}]`);
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

/**
 * Wrap a caller-supplied `text_encoder` so its return value is checked on every call.
 *
 * An encoder returning anything other than a `Uint8Array` used to flow straight into
 * `encode_payload`, where `for (const byte of ...)` iterated a string's characters and
 * `(NaN >>> i) & 1` evaluated to 0 — silently producing a valid, scannable symbol that
 * encoded NUL bytes instead of the payload. The encoder is called from two places
 * (`payload_bits` and `encode`), so validation is centralized here.
 */
function guard_encoder(encoder: (value: string) => Uint8Array): (value: string) => Uint8Array {
  return (value: string) => {
    const bytes = encoder(value);
    if (!(bytes instanceof Uint8Array)) {
      throw new Error(`text_encoder must return a Uint8Array, got ${bytes === null ? 'null' : typeof bytes}`);
    }
    return bytes;
  };
}

/**
 * Number of bits the payload body occupies in the given mode, excluding the 4-bit mode
 * indicator and the version-dependent character-count field.
 *
 * Mirrors the bit layout produced by `encode_payload`:
 * - numeric: 10 bits per group of 3 digits, plus 4 bits for 1 leftover or 7 for 2
 * - alphanumeric: 11 bits per pair, plus 6 for a leftover character
 * - byte: 8 bits per UTF-8 byte
 */
function payload_bits(text: string, type: EncodingType, encoder: (value: string) => Uint8Array): { bits: number, length: number } {
  if (type === 'numeric') {
    const n = text.length;
    const rem = n % 3;
    return { bits: Math.floor(n / 3) * 10 + (rem === 1 ? 4 : rem === 2 ? 7 : 0), length: n };
  }
  if (type === 'alphanumeric') {
    const n = text.length;
    return { bits: Math.floor(n / 2) * 11 + (n % 2) * 6, length: n };
  }
  if (type === 'byte') {
    const n = encoder(text).length;
    return { bits: n * 8, length: n };
  }
  throw new Error('encode: unsupported type');
}

/**
 * Find the smallest version whose data capacity fits the payload.
 *
 * Capacity is a closed-form function of version/ecc/mode/length, so this scans versions
 * comparing bit counts directly rather than attempting a full encode per candidate and
 * using thrown exceptions as control flow. Only a genuine capacity shortfall produces an
 * error here; real internal faults propagate from the subsequent `encode` call.
 */
function select_version(ecc: ErrorCorrection, text: string, encoding: EncodingType, encoder: (text: string) => Uint8Array): Version {
  const { bits, length } = payload_bits(text, encoding, encoder);

  for (let i = 1;i <= 40;i++) {
    const v = i as Version;
    const needed = 4 + info.length_bits(v, encoding) + bits;
    if (needed <= info.capacity(v, ecc).capacity) return v;
  }
  // Preserve the historical error surfaced when input exceeds even version 40.
  throw new Error(`Capacity overflow: ${length} ${encoding === 'byte' ? 'bytes' : 'characters'} exceed the maximum for ecc=${ecc}`);
}

export type Output = 'raw' | 'ascii' | 'term' | 'gif' | 'svg';

// Main QR code encoder (public API)
export function encode_qr(text: string, output: 'raw', opts?: QrOpts): boolean[][];
export function encode_qr(text: string, output: 'ascii' | 'term', opts?: QrOpts): string;
export function encode_qr(text: string, output: 'svg', opts?: QrOpts & SvgQrOpts): string;
export function encode_qr(text: string, output: 'gif', opts?: QrOpts): Uint8Array;
export function encode_qr(text: string, output: Output = 'raw', opts: QrOpts & SvgQrOpts = {}) {
  // `detect_type` iterates `text` and runs before `utf8_to_bytes`' own guard, so a non-string
  // leaked a raw `TypeError: number is not iterable` out of the engine. Same for a null/
  // non-object `opts`, which faulted on the first property read.
  if (typeof text !== 'string') throw new Error(`Invalid text type=${text === null ? 'null' : typeof text}. Expected string`);
  if (typeof opts !== 'object' || opts === null) {
    throw new Error(`Invalid opts type=${opts === null ? 'null' : typeof opts}. Expected object`);
  }
  const ecc = opts.ecc !== undefined ? opts.ecc : 'medium';
  validate_ecc(ecc);
  const encoding = opts.encoding !== undefined ? opts.encoding : detect_type(text);
  validate_encoding(encoding);
  if (opts.mask !== undefined) validate_mask(opts.mask as Mask);
  const encoder = guard_encoder(opts.text_encoder ?? utf8_to_bytes);

  let ver: Version;
  if (opts.version !== undefined) {
    ver = validate_version(opts.version);
  } else {
    ver = select_version(ecc, text, encoding, encoder);
  }
  const data = encode(ver, ecc, text, encoding, encoder);
  let res = draw_qr_best(ver, ecc, data, opts.mask as Mask);
  res.assert_drawn();
  const border = opts.border === undefined ? 2 : opts.border;
  validate_border(border);
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

/**
 * Low-level building blocks for callers implementing their own encoding pipeline.
 *
 * @remarks
 * **Not covered by semantic versioning.** These are internals exposed for advanced use;
 * their shapes track the encoder's implementation and may change in any release,
 * including a patch. The stable public API is {@link encode_qr}, {@link validate_version},
 * {@link utf8_to_bytes}, and the `bun-qr/links` subpath. Depend on this at your own risk.
 */
export const utils = { best, bin, draw_template, fill_arr, info, interleave, validate_version, zigzag };

/**
 * White-box hooks for this package's own test suite.
 *
 * @remarks
 * **Private. Not part of the public API and not covered by semantic versioning.**
 * The leading underscore marks it as internal; it is exported only because the tests in
 * `tests/` import it across module boundaries. It may be renamed, reshaped, or removed
 * without notice. Do not import this from application code.
 *
 * @internal
 */
export const _tests = { Bitmap, info, detect_type, encode, draw_qr, penalty, PATTERNS };
