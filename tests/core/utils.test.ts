// file: tests/core/utils.test.ts
// description: coverage for the shared encoding helpers in src/core/utils.ts
//
// `bin`, `fill_arr`, `best`, and `alphabet` are re-exported through the package's public
// `utils` object, so their argument validation is reachable by callers even where the QR
// encode path itself never exercises it. These tests drive the helpers directly, with
// particular attention to the throw paths, which the encoder never reaches because it
// only ever passes literal mode bits and in-range alphabet indices.

import { describe, expect, test } from 'bun:test';
import { alphabet, best, bin, fill_arr } from '../../src/core/utils';

// ---------------------------------------------------------------------------
// bin
// ---------------------------------------------------------------------------

describe('bin', () => {
  test('renders binary with zero padding to the requested width', () => {
    expect(bin(5, 8)).toBe('00000101');
    expect(bin(0, 4)).toBe('0000');
    expect(bin(1, 1)).toBe('1');
    expect(bin(255, 8)).toBe('11111111');
  });

  test('does not truncate a value wider than the pad', () => {
    // padStart only ever grows the string, so an over-wide value must survive intact
    // rather than being silently clipped to the field width.
    expect(bin(255, 4)).toBe('11111111');
  });

  test('rejects negative input instead of embedding the sign', () => {
    // Regression: `(-5).toString(2)` is '-101', which padStart pushes to '0000-101' —
    // a sign character stranded mid-field. Every QR mode/length field is non-negative,
    // so a negative value is a caller bug and must surface rather than mis-encode.
    expect(() => bin(-5, 8)).toThrow(/invalid value=-5/);
    expect(() => bin(-1, 4)).toThrow(/non-negative/);
  });

  test('rejects non-integer and non-finite input', () => {
    expect(() => bin(1.5, 8)).toThrow(/invalid value/);
    expect(() => bin(NaN, 8)).toThrow(/invalid value/);
    expect(() => bin(Infinity, 8)).toThrow(/invalid value/);
  });
});

// ---------------------------------------------------------------------------
// fill_arr
// ---------------------------------------------------------------------------

describe('fill_arr', () => {
  test('builds an array of the requested length filled with the value', () => {
    expect(fill_arr(3, 0)).toEqual([0, 0, 0]);
    expect(fill_arr(2, 'x')).toEqual(['x', 'x']);
    expect(fill_arr(0, 1)).toEqual([]);
  });

  test('produces no holes, so every index is an own property', () => {
    const a = fill_arr(4, undefined);
    expect(a.length).toBe(4);
    for (let i = 0;i < a.length;i++) expect(Object.hasOwn(a, i)).toBe(true);
  });

  test('shares a reference when filled with an object', () => {
    // `Array#fill` copies the reference, not the value — callers mutating one element
    // would observe the change in all of them. Documented here so the behaviour is
    // deliberate rather than an accident waiting to be relied upon.
    const rows = fill_arr(2, { n: 0 });
    rows[0]!.n = 5;
    expect(rows[1]!.n).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// best
// ---------------------------------------------------------------------------

describe('best', () => {
  test('starts empty with an infinite score', () => {
    const b = best<string>();
    expect(b.get()).toBeUndefined();
    expect(b.score()).toBe(Infinity);
  });

  test('keeps the lowest-scoring candidate', () => {
    const b = best<string>();
    b.add(10, 'ten');
    b.add(3, 'three');
    b.add(7, 'seven');
    expect(b.get()).toBe('three');
    expect(b.score()).toBe(3);
  });

  test('keeps the first candidate on a score tie', () => {
    // The guard is `score >= best_score`, so an equal score does not displace the
    // incumbent. Mask selection depends on this to stay deterministic.
    const b = best<string>();
    b.add(5, 'first');
    b.add(5, 'second');
    expect(b.get()).toBe('first');
  });

  test('accepts a zero score', () => {
    const b = best<string>();
    b.add(0, 'zero');
    expect(b.get()).toBe('zero');
    expect(b.score()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// alphabet
// ---------------------------------------------------------------------------

describe('alphabet', () => {
  const coder = alphabet('ABC123');

  test('has reports membership', () => {
    expect(coder.has('A')).toBe(true);
    expect(coder.has('3')).toBe(true);
    expect(coder.has('Z')).toBe(false);
  });

  test('encode maps indices to characters', () => {
    expect(coder.encode([0, 1, 2])).toEqual(['A', 'B', 'C']);
    expect(coder.encode([])).toEqual([]);
  });

  test('decode maps characters to indices', () => {
    expect(coder.decode(['A', 'B', 'C'])).toEqual([0, 1, 2]);
    expect(coder.decode([])).toEqual([]);
  });

  test('encode and decode round-trip', () => {
    const digits = [5, 0, 3, 2];
    expect(coder.decode(coder.encode(digits))).toEqual(digits);
  });

  test('encode rejects non-array input', () => {
    expect(() => coder.encode('AB' as unknown as number[])).toThrow(/should be an array of numbers/);
    expect(() => coder.encode(null as unknown as number[])).toThrow(/should be an array of numbers/);
  });

  test('encode rejects an array whose first element is not a number', () => {
    expect(() => coder.encode(['0'] as unknown as number[])).toThrow(/should be an array of numbers/);
  });

  test('encode rejects a non-integer element', () => {
    // `assert_number` runs per element, so a bad value after a good one is still caught.
    expect(() => coder.encode([0, 1.5])).toThrow(/integer expected/);
    expect(() => coder.encode([0, NaN])).toThrow(/integer expected/);
  });

  test('encode rejects a digit index outside the alphabet', () => {
    expect(() => coder.encode([6])).toThrow(/Digit index outside alphabet: 6/);
    expect(() => coder.encode([-1])).toThrow(/Digit index outside alphabet: -1/);
  });

  test('the encode range error reports the alphabet length', () => {
    expect(() => coder.encode([99])).toThrow(/alphabet: 6/);
  });

  test('decode rejects non-array input', () => {
    expect(() => coder.decode('AB' as unknown as string[])).toThrow(/should be array of strings/);
    expect(() => coder.decode(null as unknown as string[])).toThrow(/should be array of strings/);
  });

  test('decode rejects an array whose first element is not a string', () => {
    expect(() => coder.decode([0] as unknown as string[])).toThrow(/should be array of strings/);
  });

  test('decode rejects a non-string element after a valid one', () => {
    // The cheap first-element check above misses this, so the per-element guard inside
    // the map is the one that has to fire.
    expect(() => coder.decode(['A', 1] as unknown as string[])).toThrow(/not string element/);
  });

  test('decode rejects an unknown letter and names the allowed set', () => {
    expect(() => coder.decode(['Z'])).toThrow(/Unknown letter: "Z"/);
    expect(() => coder.decode(['Z'])).toThrow(/Allowed: ABC123/);
  });

  test('decode rejects a multi-character element', () => {
    // `chars.indexOf` matches substrings, so without an explicit length check 'AB' would
    // resolve to the index of its first character instead of being rejected. Both a
    // prefix match and a non-match must be treated as unknown letters.
    expect(() => coder.decode(['AB'])).toThrow(/Unknown letter: "AB"/);
    expect(() => coder.decode(['ZZ'])).toThrow(/Unknown letter/);
    expect(() => coder.decode([''])).toThrow(/Unknown letter/);
  });
});
