import { describe, expect, test } from 'bun:test';
import { _tests, create_interleaver } from '../../src/core/error-correction';

const { GF, RS } = _tests;

// ---------------------------------------------------------------------------
// Galois Field GF(2^8) arithmetic
// ---------------------------------------------------------------------------

describe('GF(2^8): basic operations', () => {
  test('exp(0) === 1', () => {
    expect(GF.exp(0)).toBe(1);
  });

  test('log(1) === 0', () => {
    expect(GF.log(1)).toBe(0);
  });

  test('log(0) throws', () => {
    expect(() => GF.log(0)).toThrow();
  });

  test('add is XOR', () => {
    expect(GF.add(0b1010, 0b1100)).toBe(0b0110);
    expect(GF.add(255, 255)).toBe(0);
  });

  test('add(a, a) === 0 (self-inverse)', () => {
    for (const a of [1, 17, 128, 255]) {
      expect(GF.add(a, a)).toBe(0);
    }
  });

  test('mul(a, b) === mul(b, a) (commutative)', () => {
    const pairs = [[2, 3], [7, 13], [100, 200], [255, 128]];
    for (const [a, b] of pairs) {
      expect(GF.mul(a!, b!)).toBe(GF.mul(b!, a!));
    }
  });

  test('mul(a, 1) === a (identity)', () => {
    for (const a of [1, 42, 128, 255]) {
      expect(GF.mul(a, 1)).toBe(a);
    }
  });

  test('mul(a, 0) === 0 (zero)', () => {
    for (const a of [1, 42, 255]) {
      expect(GF.mul(a, 0)).toBe(0);
    }
  });

  test('mul(a, inv(a)) === 1 (multiplicative inverse)', () => {
    for (const a of [1, 2, 17, 100, 255]) {
      expect(GF.mul(a, GF.inv(a))).toBe(1);
    }
  });

  test('inv(0) throws', () => {
    expect(() => GF.inv(0)).toThrow();
  });

  test('pow(a, 0) === 1', () => {
    expect(GF.pow(3, 0)).toBe(1);
  });

  test('pow(2, i) matches exp table for i in [0, 7]', () => {
    for (let i = 0;i < 8;i++) {
      expect(GF.pow(2, i)).toBe(GF.exp(i));
    }
  });

  test('pow(0, e) === 0 for e >= 1', () => {
    // Regression: `log[0]` is never assigned by the table init (it only sets
    // log[exp[i]], and exp[i] is never 0), so it kept its 0 seed and pow(0, e) read
    // exp(0) = 1 for every exponent. In GF(2^8) the zero element raised to any positive
    // power is 0. Not reachable from the encode path — divisor_poly only calls pow(2, i)
    // — but reachable through the exported _tests.GF.
    for (const e of [1, 2, 5, 254, 255]) expect(GF.pow(0, e)).toBe(0);
  });

  test('pow(0, 0) === 1 by the empty-product convention', () => {
    expect(GF.pow(0, 0)).toBe(1);
  });

  test('pow agrees with repeated multiplication', () => {
    for (const base of [1, 2, 3, 7, 255]) {
      let acc = 1;
      for (let e = 0;e < 10;e++) {
        expect(GF.pow(base, e)).toBe(acc);
        acc = GF.mul(acc, base);
      }
    }
  });
});

describe('GF(2^8): polynomial operations', () => {
  test('add_poly: adding a polynomial to itself yields [0]', () => {
    const p = [1, 2, 3];
    const res = GF.add_poly(p, p);
    expect(res).toEqual([0]);
  });

  test('mul_poly: multiply by [1] (scalar 1) is identity', () => {
    const p = [1, 2, 3];
    expect(GF.mul_poly(p, [1])).toEqual(p);
  });

  test('divisor_poly(2) has correct degree', () => {
    const d = GF.divisor_poly(2);
    expect(d.length - 1).toBe(2);
  });

  test('remainder_poly: data encoded with divisor has zero remainder', () => {
    const ecc_words = 7;
    const divisor = GF.divisor_poly(ecc_words);
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec];
    const encoded = [...data, ...Array(ecc_words).fill(0)];
    const remainder = GF.remainder_poly(encoded, divisor);
    const full_codeword = [...data, ...remainder];
    const check = GF.remainder_poly(full_codeword, divisor);
    // A valid codeword has zero remainder
    expect(check.every((b) => b === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reed-Solomon encode / decode
// ---------------------------------------------------------------------------

describe('Reed-Solomon', () => {
  test('encode produces correct number of parity bytes', () => {
    const ecc_words = 10;
    const rs = RS(ecc_words);
    const data = Uint8Array.from([0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11]);
    const parity = rs.encode(data);
    expect(parity.length).toBe(ecc_words);
  });

  test('decode returns original data when there are no errors', () => {
    const ecc_words = 10;
    const rs = RS(ecc_words);
    const data = Uint8Array.from([0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11]);
    const parity = rs.encode(data);
    const codeword = Uint8Array.from([...data, ...parity]);
    const decoded = rs.decode(codeword);
    // Decoded should match the original codeword (data+parity)
    expect(decoded).toEqual(codeword);
  });

  test('decode corrects a single byte error (within t = floor(ecc/2) capacity)', () => {
    const ecc_words = 10; // can correct up to 5 errors
    const rs = RS(ecc_words);
    const data = Uint8Array.from([0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11]);
    const parity = rs.encode(data);
    const codeword = Uint8Array.from([...data, ...parity]);

    // Corrupt one byte
    const corrupted = Uint8Array.from(codeword);
    corrupted[3] = (codeword[3] ?? 0) ^ 0xff;
    expect(corrupted[3]).not.toBe(codeword[3]);

    const repaired = rs.decode(corrupted);
    expect(repaired).toEqual(codeword);
  });
});

// ---------------------------------------------------------------------------
// Interleaver round-trip
// ---------------------------------------------------------------------------

describe('create_interleaver', () => {
  // Version 1, low ECC: BYTES[0]=26, WORDS_PER_BLOCK.low[0]=7, ECC_BLOCKS.low[0]=1
  // block_len = floor(26/1) - 7 = 19
  // short_blocks = 1 - (26 % 1) = 1
  // total = (7+19)*1 + 1 - 1 = 26
  // data bytes = block_len = 19 (one short block)
  const V1_LOW = { words: 7, num_blocks: 1, short_blocks: 1, block_len: 19, total: 26 };

  test('encode → decode is an identity for version 1 low ECC', () => {
    const interleaver = create_interleaver(V1_LOW);
    const original = Uint8Array.from({ length: 19 }, (_, i) => (i * 37 + 17) & 0xff);
    const encoded = interleaver.encode(original);
    const decoded = interleaver.decode(encoded);
    expect(decoded).toEqual(original);
  });

  test('encode → decode is an identity for version 1 medium ECC (higher redundancy)', () => {
    // Version 1, medium ECC: BYTES[0]=26, WORDS_PER_BLOCK.medium[0]=10, ECC_BLOCKS.medium[0]=1
    // block_len = floor(26/1) - 10 = 16, short_blocks = 1, total = 26
    const capacity = { words: 10, num_blocks: 1, short_blocks: 1, block_len: 16, total: 26 };
    const interleaver = create_interleaver(capacity);
    const original = Uint8Array.from({ length: 16 }, (_, i) => (i * 53 + 7) & 0xff);
    const encoded = interleaver.encode(original);
    const decoded = interleaver.decode(encoded);
    expect(decoded).toEqual(original);
  });

  test('encode produces total bytes matching capacity.total', () => {
    const interleaver = create_interleaver(V1_LOW);
    const original = Uint8Array.from({ length: 19 }, () => 0xaa);
    const encoded = interleaver.encode(original);
    expect(encoded.length).toBe(V1_LOW.total);
  });

  test('decode throws when input length does not match total', () => {
    const interleaver = create_interleaver(V1_LOW);
    expect(() => interleaver.decode(new Uint8Array(10))).toThrow();
  });
});
