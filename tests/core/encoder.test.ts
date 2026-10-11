import { describe, expect, spyOn, test } from 'bun:test';
import { encode_payload, type EncodingInfo } from '../../src/core/encoder';
import encode_qr, { _tests, validate_version } from '../../src/index';

const { info, detect_type } = _tests;

// ---------------------------------------------------------------------------
// detect_type
// ---------------------------------------------------------------------------

describe('detect_type', () => {
  test('all digits → numeric', () => {
    expect(detect_type('0123456789')).toBe('numeric');
  });

  test('uppercase + digits + allowed symbols → alphanumeric', () => {
    expect(detect_type('HELLO WORLD')).toBe('alphanumeric');
    expect(detect_type('AB$%*+-./:')).toBe('alphanumeric');
  });

  test('lowercase → byte', () => {
    expect(detect_type('hello')).toBe('byte');
  });

  test('mixed case → byte', () => {
    expect(detect_type('Hello World')).toBe('byte');
  });

  test('unicode → byte', () => {
    expect(detect_type('日本語')).toBe('byte');
  });

  test('empty string → numeric', () => {
    expect(detect_type('')).toBe('numeric');
  });
});

// ---------------------------------------------------------------------------
// validate_version
// ---------------------------------------------------------------------------

describe('validate_version', () => {
  test('valid versions 1–40 return the version as branded type', () => {
    for (const v of [1, 10, 20, 40]) {
      expect(validate_version(v) as number).toBe(v);
    }
  });

  test('version 0 throws', () => {
    expect(() => validate_version(0)).toThrow('Invalid version=0');
  });

  test('version 41 throws', () => {
    expect(() => validate_version(41)).toThrow('Invalid version=41');
  });

  test('non-integer throws', () => {
    expect(() => validate_version(1.5)).toThrow();
  });

  test('NaN throws', () => {
    expect(() => validate_version(NaN)).toThrow();
  });

  test('Infinity throws', () => {
    expect(() => validate_version(Infinity)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Bit packing via encode_qr (integration level)
// ---------------------------------------------------------------------------

describe('encoding modes produce scannable output', () => {
  // These tests verify the correct mode is selected and encoding succeeds
  // without a real scanner by checking output structure and size.

  test('numeric mode: short number produces a QR matrix', () => {
    const result = encode_qr('123', 'raw', { encoding: 'numeric', ecc: 'low' });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(Array.isArray(result[0])).toBe(true);
  });

  test('alphanumeric mode: URL-like string produces a QR matrix', () => {
    const result = encode_qr('HTTPS://EXAMPLE.COM', 'raw', { encoding: 'alphanumeric', ecc: 'low' });
    expect(Array.isArray(result)).toBe(true);
  });

  test('byte mode: lowercase string produces a QR matrix', () => {
    const result = encode_qr('Hello, World!', 'raw', { encoding: 'byte', ecc: 'low' });
    expect(Array.isArray(result)).toBe(true);
  });

  test('auto-detection selects correct encoding for digits', () => {
    expect(detect_type('12345')).toBe('numeric');
    const result = encode_qr('12345', 'raw');
    expect(Array.isArray(result)).toBe(true);
  });

  test('explicit version overrides auto-detection', () => {
    // Version 5 = 37×37 modules + default border 4 → 45×45
    const result = encode_qr('hi', 'raw', { version: 5 });
    expect((result as boolean[][])[0]!.length).toBe(45);
  });

  test('explicit version with border:0 gives exact module dimensions', () => {
    const result = encode_qr('hi', 'raw', { version: 5, border: 0 });
    // Version 5 = 21 + 4*(5-1) = 37 modules
    expect((result as boolean[][])[0]!.length).toBe(37);
  });
});

// ---------------------------------------------------------------------------
// info.capacity
// ---------------------------------------------------------------------------

describe('info.capacity', () => {
  test('version 1 low: 152 bit capacity (19 data bytes)', () => {
    const cap = info.capacity(validate_version(1), 'low');
    expect(cap.capacity).toBe(152); // 19 bytes × 8 bits
  });

  test('version 40 high: large capacity', () => {
    const cap = info.capacity(validate_version(40), 'high');
    expect(cap.capacity).toBeGreaterThan(1000);
  });
});

// ---------------------------------------------------------------------------
// Capacity overflow
// ---------------------------------------------------------------------------

describe('capacity overflow', () => {
  test.each(['numeric', 'alphanumeric'] as const)(
    'rejects oversized explicit %s input before splitting or decoding symbols',
    (encoding) => {
      const coder = encoding === 'numeric' ? info.alphabet.numeric : info.alphabet.alphanumerc;
      const decode = spyOn(coder, 'decode');
      const split = spyOn(String.prototype, 'split');
      let error: unknown;
      let splitCalls = 0;
      let decodeCalls = 0;
      try {
        const payload = (encoding === 'numeric' ? '1' : 'A').repeat(1000);
        try {
          encode_qr(payload, 'raw', { version: 1, encoding });
        } catch (caught) {
          error = caught;
        }
        splitCalls = split.mock.calls.length;
        decodeCalls = decode.mock.calls.length;
      } finally {
        split.mockRestore();
        decode.mockRestore();
      }
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Capacity overflow');
      expect(splitCalls).toBe(0);
      expect(decodeCalls).toBe(0);
    }
  );

  test.each(['numeric', 'alphanumeric', 'byte'] as const)('rejects a %s count that cannot fit its length field', (encoding) => {
    const coder = {
      has: () => true,
      decode: () => {
        throw new Error('symbol allocation reached');
      }
    };
    const narrow: EncodingInfo<typeof encoding, number, string> = {
      alphabet: { numeric: coder, alphanumerc: coder },
      length_bits: () => 2,
      mode_bits: { numeric: '0001', alphanumeric: '0010', byte: '0100' },
      capacity: () => ({ capacity: 512 })
    };
    expect(() => encode_payload(narrow, () => ({ encode: bytes => bytes }), 1, 'low', '1234', encoding, () => new Uint8Array(4))).toThrow(
      'Capacity overflow'
    );
  });

  test.each([['12x', 'numeric'], ['lowercase', 'alphanumeric']] as const)(
    'still validates the alphabet of %s within capacity',
    (payload, encoding) => {
      expect(() => encode_qr(payload, 'raw', { version: 1, encoding })).toThrow(/Unknown letter/);
    }
  );

  test('payload too large for given version throws', () => {
    // Version 1 low ECC: 19 data bytes max
    // 20 digits → numeric mode needs more than 19 bytes
    const too_long = '1'.repeat(42); // definitely exceeds v1 capacity
    expect(() => encode_qr(too_long, 'raw', { version: 1, ecc: 'low' })).toThrow();
  });

  test('auto version selection handles large payloads without throwing', () => {
    // 100-character string should succeed with auto version selection
    const payload = 'A'.repeat(100);
    expect(() => encode_qr(payload, 'raw', { ecc: 'low' })).not.toThrow();
  });
});
