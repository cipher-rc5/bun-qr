// file: tests/roundtrip.test.ts
// description: independent structural verification of rendered QR symbols per ISO/IEC 18004
//
// WHY THIS FILE EXISTS
// --------------------
// `tests/core/encoder.test.ts` has a suite named "encoding modes produce scannable output"
// whose assertions are only `expect(Array.isArray(result)).toBe(true)` — which is equally
// true of an all-white matrix. Nothing in the suite proves the encoder emits a real symbol.
//
// The verification below is deliberately written as an INDEPENDENT ORACLE. Every expected
// value is derived from the ISO/IEC 18004 specification (BCH generator polynomials, the
// format-information XOR mask, the ECC-level bit assignments, pattern geometry, capacity
// tables), never from a value the encoder produced. Concretely:
//
//   * The BCH(15,5) format decoder here re-derives codewords from scratch using the
//     spec generator 0b10100110111 and mask 0b101010000010010, then checks the rendered
//     matrix against them. It does NOT call `info.format_bits()`.
//   * The BCH(18,6) version decoder uses generator 0b1111100100101 the same way.
//   * Byte capacities are the published ISO/IEC 18004 maxima for version 40.
//
// The one thing this file intentionally does NOT do is decode the data region back to the
// input string. Doing that honestly requires a full Reed-Solomon erasure decoder, and
// implementing one *here* by copying the encoder's own GF tables would re-introduce exactly
// the circularity this file exists to avoid. Instead we verify the symbol's structural and
// format-information layers, which is where encoder bugs actually manifest, using arithmetic
// that shares no code with `src/`.

import { describe, expect, test } from 'bun:test';
import encode_qr, { type ErrorCorrection } from '../src/index';

// ---------------------------------------------------------------------------
// Spec constants (ISO/IEC 18004) — transcribed from the standard, not from src/
// ---------------------------------------------------------------------------

/** §8.9 format information BCH(15,5) generator polynomial: x^10+x^8+x^5+x^4+x^2+x+1 */
const FORMAT_GENERATOR = 0b10100110111;
/** §8.9 format information XOR mask applied to the 15-bit codeword. */
const FORMAT_MASK = 0b101010000010010;
/** §8.10 version information BCH(18,6) generator: x^12+x^11+x^10+x^9+x^8+x^5+x^2+1 */
const VERSION_GENERATOR = 0b1111100100101;

/**
 * §8.9 Table 12 — two-bit ECC level indicator as it appears in format information.
 * Note this is NOT the same ordering as the human-readable level names.
 */
const ECC_INDICATOR: Record<ErrorCorrection, number> = { medium: 0b00, low: 0b01, high: 0b10, quartile: 0b11 };

/**
 * ISO/IEC 18004 maximum byte-mode data capacity at version 40, per ECC level.
 * These are published table values, independent of this codebase.
 */
const MAX_BYTE_CAPACITY: Record<ErrorCorrection, number> = { low: 2953, medium: 2331, quartile: 1663, high: 1273 };

const ALL_ECC: readonly ErrorCorrection[] = ['low', 'medium', 'quartile', 'high'];

// ---------------------------------------------------------------------------
// Independent BCH implementations
// ---------------------------------------------------------------------------

/** Compute the 15-bit BCH(15,5) format codeword for a 5-bit data value, per §8.9. */
function format_codeword(data5: number): number {
  let d = data5;
  for (let i = 0;i < 10;i++) d = (d << 1) ^ ((d >> 9) * FORMAT_GENERATOR);
  return (((data5 << 10) | d) ^ FORMAT_MASK) & 0x7fff;
}

/** Compute the 18-bit BCH(18,6) version codeword for a version number, per §8.10. */
function version_codeword(ver: number): number {
  let d = ver;
  for (let i = 0;i < 12;i++) d = (d << 1) ^ ((d >> 11) * VERSION_GENERATOR);
  return ((ver << 12) | d) & 0x3ffff;
}

/**
 * Decode a received 15-bit format value by matching it against the 32 valid codewords.
 * BCH(15,5) has minimum distance 7, so a real scanner could correct up to 3 bit errors.
 * We require an EXACT match, since we are reading a freshly rendered symbol with no noise —
 * any mismatch means the encoder wrote something non-conformant.
 */
function decode_format(received: number): { ecc: ErrorCorrection, mask: number } | undefined {
  for (const ecc of ALL_ECC) {
    for (let mask = 0;mask < 8;mask++) {
      const data5 = (ECC_INDICATOR[ecc] << 3) | mask;
      if (format_codeword(data5) === received) return { ecc, mask };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Matrix helpers
// ---------------------------------------------------------------------------

type Matrix = boolean[][];

/** Render a QR symbol with no quiet zone so coordinates are symbol-relative. */
function render(text: string, opts: Parameters<typeof encode_qr>[2] = {}): Matrix {
  return encode_qr(text, 'raw', { border: 0, ...opts }) as Matrix;
}

function size_to_version(size: number): number {
  return (size - 17) / 4;
}

/**
 * Read the primary (top-left) copy of format information, §8.9 Figure 25.
 * Bit 0 is the LSB. The primary copy runs down column 8 then left along row 8,
 * skipping the timing pattern at row/column 6.
 */
function read_format_primary(m: Matrix): number {
  let bits = 0;
  const set = (i: number, v: boolean) => {
    if (v) bits |= 1 << i;
  };
  for (let i = 0;i < 6;i++) set(i, m[i]![8]!);
  set(6, m[7]![8]!);
  set(7, m[8]![8]!);
  set(8, m[8]![7]!);
  for (let i = 9;i < 15;i++) set(i, m[8]![14 - i]!);
  return bits;
}

/**
 * Read the secondary (split) copy of format information, §8.9 Figure 25.
 * Bits 0-7 run right-to-left along row 8 from the top-right finder; bits 8-14
 * run bottom-to-top up column 8 from the bottom-left finder.
 */
function read_format_secondary(m: Matrix): number {
  const size = m.length;
  let bits = 0;
  const set = (i: number, v: boolean) => {
    if (v) bits |= 1 << i;
  };
  for (let i = 0;i < 8;i++) set(i, m[8]![size - 1 - i]!);
  for (let i = 8;i < 15;i++) set(i, m[size - 15 + i]![8]!);
  return bits;
}

/** Read one of the two 18-bit version information blocks (§8.10), versions >= 7. */
function read_version_block(m: Matrix, which: 'bottom_left' | 'top_right'): number {
  const size = m.length;
  let bits = 0;
  for (let i = 0;i < 18;i++) {
    const a = Math.floor(i / 3);
    const b = (i % 3) + size - 11;
    const v = which === 'bottom_left' ? m[b]![a]! : m[a]![b]!;
    if (v) bits |= 1 << i;
  }
  return bits;
}

/** The canonical 7x7 finder pattern of §6.3.3, as concentric rings. */
function is_finder_at(m: Matrix, top: number, left: number): boolean {
  for (let y = 0;y < 7;y++) {
    for (let x = 0;x < 7;x++) {
      // Ring structure: outer 7x7 dark border, 5x5 light ring, 3x3 dark core.
      const ring = Math.max(Math.abs(y - 3), Math.abs(x - 3));
      const expected = ring !== 2; // ring 0,1,3 dark; ring 2 light
      if (m[top + y]![left + x]! !== expected) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Format information — the core independent oracle
// ---------------------------------------------------------------------------

describe('format information is a valid BCH(15,5) codeword (ISO/IEC 18004 §8.9)', () => {
  for (const ecc of ALL_ECC) {
    test(`ecc=${ecc}: both copies decode to the requested level and agree on the mask`, () => {
      const m = render('https://bun.com', { ecc });

      const primary = read_format_primary(m);
      const secondary = read_format_secondary(m);

      // Both copies must carry identical information (§8.9 redundancy requirement).
      expect(secondary).toBe(primary);

      const decoded = decode_format(primary);
      // An all-white or malformed matrix decodes to undefined here — this is the
      // assertion the existing "scannable output" suite was missing.
      expect(decoded).toBeDefined();

      // The level carried in the symbol must be the level the caller asked for.
      expect(decoded!.ecc).toBe(ecc);

      // The mask must be one the spec allows; the encoder picks it by penalty scoring,
      // so we assert range membership rather than a specific value.
      expect(decoded!.mask).toBeGreaterThanOrEqual(0);
      expect(decoded!.mask).toBeLessThanOrEqual(7);
    });
  }

  test('an explicitly requested mask is the mask actually recorded in the symbol', () => {
    for (let mask = 0;mask < 8;mask++) {
      const m = render('MASK TEST', { ecc: 'quartile', mask });
      const decoded = decode_format(read_format_primary(m));
      expect(decoded).toBeDefined();
      expect(decoded!.mask).toBe(mask);
      expect(decoded!.ecc).toBe('quartile');
    }
  });

  test('fixture payloads carry spec-valid format information regardless of mask selection', () => {
    // These are the exact payloads used by the self-referential SHA-256 fixtures in
    // tests/index.test.ts. Mask selection for them depends on penalty scoring, so a
    // legitimate penalty fix can change the chosen mask and invalidate those hashes.
    // Validating them here against the ISO spec means such a change is confirmed correct
    // rather than merely re-baselined.
    for (const payload of ['Hello, Bun QR!', 'https://bun.sh']) {
      const m = render(payload, { ecc: 'medium' });

      const primary = read_format_primary(m);
      expect(read_format_secondary(m)).toBe(primary);

      const decoded = decode_format(primary);
      expect(decoded).toBeDefined();
      expect(decoded!.ecc).toBe('medium');
      expect(decoded!.mask).toBeGreaterThanOrEqual(0);
      expect(decoded!.mask).toBeLessThanOrEqual(7);

      // Structural sanity for the same symbols.
      const size = m.length;
      expect(is_finder_at(m, 0, 0)).toBe(true);
      expect(is_finder_at(m, 0, size - 7)).toBe(true);
      expect(is_finder_at(m, size - 7, 0)).toBe(true);
      expect(m[size - 8]![8]!).toBe(true); // dark module
    }
  });

  test('the 15-bit format field is never all-zero or all-one', () => {
    // Degenerate matrices (all light / all dark) would produce these; valid symbols cannot,
    // because the spec mask 0b101010000010010 is XORed into every codeword.
    const m = render('degenerate check');
    const bits = read_format_primary(m);
    expect(bits).not.toBe(0);
    expect(bits).not.toBe(0x7fff);
  });
});

describe('version information is a valid BCH(18,6) codeword (ISO/IEC 18004 §8.10)', () => {
  test('symbols of version >= 7 carry correct version information in both blocks', () => {
    // Payload sized to force a version well above the v7 threshold.
    const payload = 'A'.repeat(500);
    const m = render(payload, { ecc: 'low' });
    const size = m.length;
    const ver = size_to_version(size);

    expect(ver).toBeGreaterThanOrEqual(7);
    expect(Number.isInteger(ver)).toBe(true);

    const expected = version_codeword(ver);
    expect(read_version_block(m, 'bottom_left')).toBe(expected);
    expect(read_version_block(m, 'top_right')).toBe(expected);
  });

  test('version blocks round-trip across a range of versions', () => {
    for (const ver of [7, 10, 20, 40]) {
      const m = render('x', { version: ver, ecc: 'low' });
      expect(size_to_version(m.length)).toBe(ver);
      const expected = version_codeword(ver);
      expect(read_version_block(m, 'bottom_left')).toBe(expected);
      expect(read_version_block(m, 'top_right')).toBe(expected);
    }
  });

  test('versions below 7 carry no version information area', () => {
    const m = render('x', { version: 6, ecc: 'low' });
    expect(size_to_version(m.length)).toBe(6);
    // For v1-v6 the 3x6 blocks do not exist; the region is ordinary data/function area.
    // We assert only that the symbol is the right size and fully drawn.
    for (const row of m) {
      for (const cell of row) expect(typeof cell).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// Function pattern geometry
// ---------------------------------------------------------------------------

describe('function patterns are placed per ISO/IEC 18004 §6.3', () => {
  test('three finder patterns occupy the correct corners, and the fourth corner does not', () => {
    const m = render('finder geometry');
    const size = m.length;

    expect(is_finder_at(m, 0, 0)).toBe(true); // top-left
    expect(is_finder_at(m, 0, size - 7)).toBe(true); // top-right
    expect(is_finder_at(m, size - 7, 0)).toBe(true); // bottom-left
    // A QR symbol has exactly three finders; a fourth would break orientation detection.
    expect(is_finder_at(m, size - 7, size - 7)).toBe(false);
  });

  test('separators around each finder are light (§6.3.4)', () => {
    const m = render('separator check');
    const size = m.length;
    // Row/column 7 adjacent to the top-left finder must be entirely light.
    for (let i = 0;i < 8;i++) {
      expect(m[7]![i]!).toBe(false);
      expect(m[i]![7]!).toBe(false);
    }
    // Top-right finder separator.
    for (let i = 0;i < 8;i++) expect(m[7]![size - 1 - i]!).toBe(false);
    // Bottom-left finder separator.
    for (let i = 0;i < 8;i++) expect(m[size - 1 - i]![7]!).toBe(false);
  });

  test('timing patterns alternate starting and ending dark (§6.3.5)', () => {
    const m = render('timing check');
    const size = m.length;
    // Row 6 and column 6 alternate dark/light between the finder separators.
    for (let i = 8;i < size - 8;i++) {
      const expected = i % 2 === 0;
      expect(m[6]![i]!).toBe(expected);
      expect(m[i]![6]!).toBe(expected);
    }
  });

  test('the dark module is always dark (§8.9)', () => {
    // The module at (4*version + 9, 8) is fixed dark in every conformant symbol.
    for (const ver of [1, 2, 7, 15, 40]) {
      const m = render('dark module', { version: ver, ecc: 'medium' });
      const size = m.length;
      expect(m[size - 8]![8]!).toBe(true);
    }
  });

  test('a version-1 symbol has no alignment pattern; version 2+ has one at the fixed position', () => {
    const v1 = render('x', { version: 1, ecc: 'low' });
    expect(v1.length).toBe(21);

    // Version 2 (25x25) has a single alignment pattern centred at (18,18) per Annex E.
    const v2 = render('x', { version: 2, ecc: 'low' });
    expect(v2.length).toBe(25);
    const cy = 18;
    const cx = 18;
    expect(v2[cy]![cx]!).toBe(true); // dark centre
    for (let d = -1;d <= 1;d++) {
      for (const [y, x] of [[cy - 1, cx + d], [cy + 1, cx + d], [cy + d, cx - 1], [cy + d, cx + 1]] as const) {
        if (y === cy && x === cx) continue;
        expect(v2[y]![x]!).toBe(false); // light ring
      }
    }
    // Outer dark ring corners.
    expect(v2[cy - 2]![cx - 2]!).toBe(true);
    expect(v2[cy + 2]![cx + 2]!).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Symbol shape and completeness
// ---------------------------------------------------------------------------

describe('symbol dimensions follow 4v+17 and are fully drawn', () => {
  test('every version renders at exactly 4*version + 17 modules', () => {
    for (const ver of [1, 2, 6, 7, 13, 26, 40]) {
      const m = render('v', { version: ver, ecc: 'low' });
      expect(m.length).toBe(4 * ver + 17);
      expect(m[0]!.length).toBe(4 * ver + 17);
    }
  });

  test('no module is left undefined and the symbol is not degenerate', () => {
    const m = render('https://example.com/some/path?q=1');
    let dark = 0;
    let total = 0;
    for (const row of m) {
      for (const cell of row) {
        expect(typeof cell).toBe('boolean');
        if (cell) dark++;
        total++;
      }
    }
    // Mask selection targets roughly balanced dark/light; anything outside a wide
    // band indicates a broken symbol (all-white, all-black, or unmasked).
    const ratio = dark / total;
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.7);
  });

  test('the quiet zone is light and sized as requested', () => {
    const border = 4;
    const m = encode_qr('quiet zone', 'raw', { border }) as Matrix;
    const size = m.length;
    for (let i = 0;i < size;i++) {
      for (let b = 0;b < border;b++) {
        expect(m[b]![i]!).toBe(false);
        expect(m[size - 1 - b]![i]!).toBe(false);
        expect(m[i]![b]!).toBe(false);
        expect(m[i]![size - 1 - b]!).toBe(false);
      }
    }
    // Interior symbol size must still be 4v+17.
    expect((size - 2 * border - 17) % 4).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Capacity — measured against published ISO/IEC 18004 maxima
// ---------------------------------------------------------------------------

describe('byte-mode capacity matches published ISO/IEC 18004 maxima', () => {
  for (const ecc of ALL_ECC) {
    const limit = MAX_BYTE_CAPACITY[ecc];

    test(`ecc=${ecc}: exactly ${limit} bytes fit and ${limit + 1} does not`, () => {
      // At the limit the encoder must succeed and must land on version 40.
      const at_limit = render('a'.repeat(limit), { ecc, encoding: 'byte' });
      expect(size_to_version(at_limit.length)).toBe(40);

      // One byte more must be rejected outright — no silent truncation.
      expect(() => render('a'.repeat(limit + 1), { ecc, encoding: 'byte' })).toThrow();
    });
  }

  test('capacity ordering is strictly low > medium > quartile > high', () => {
    expect(MAX_BYTE_CAPACITY.low).toBeGreaterThan(MAX_BYTE_CAPACITY.medium);
    expect(MAX_BYTE_CAPACITY.medium).toBeGreaterThan(MAX_BYTE_CAPACITY.quartile);
    expect(MAX_BYTE_CAPACITY.quartile).toBeGreaterThan(MAX_BYTE_CAPACITY.high);
  });
});

// ---------------------------------------------------------------------------
// Data-region sensitivity: different payloads must produce different symbols
// ---------------------------------------------------------------------------

describe('the data region actually depends on the payload', () => {
  test('two different payloads at identical version/ecc/mask differ in the data region', () => {
    const opts = { version: 5, ecc: 'medium' as const, mask: 0 };
    const a = render('payload one', opts);
    const b = render('payload two', opts);

    expect(a.length).toBe(b.length);

    let diff = 0;
    for (let y = 0;y < a.length;y++) {
      for (let x = 0;x < a.length;x++) {
        if (a[y]![x]! !== b[y]![x]!) diff++;
      }
    }
    // Function patterns and format info are identical between the two, so any
    // difference is necessarily in the data/ECC region. A stuck encoder yields 0.
    expect(diff).toBeGreaterThan(0);
  });

  test('a one-character change perturbs the symbol (avalanche via Reed-Solomon)', () => {
    const opts = { version: 4, ecc: 'medium' as const, mask: 3 };
    const a = render('hello world A', opts);
    const b = render('hello world B', opts);
    let diff = 0;
    for (let y = 0;y < a.length;y++) {
      for (let x = 0;x < a.length;x++) if (a[y]![x]! !== b[y]![x]!) diff++;
    }
    // ECC codewords spread a single-byte change across many modules.
    expect(diff).toBeGreaterThan(10);
  });

  test('identical input reproduces an identical symbol (determinism)', () => {
    const a = render('deterministic');
    const b = render('deterministic');
    expect(a).toEqual(b);
  });
});
