// file: src/core/utils.ts
// description: internal utility functions shared across QR encoding modules

export interface AlphabetCoder<F, T> {
  encode(from: F): T;
  decode(to: T): F;
  has(char: string): boolean;
}

function assert_number(n: number): void {
  if (!Number.isSafeInteger(n)) throw new Error(`integer expected: ${n}`);
}

/**
 * Convert decimal to binary string with zero padding.
 *
 * Negative input is rejected rather than formatted: `Number#toString(2)` renders the sign
 * as a leading '-', which `padStart` then pushes into the middle of the field, so
 * `bin(-5, 8)` would yield the malformed `"0000-101"`. This is an internal bit-formatting
 * helper for QR mode/length fields, all of which are non-negative, so a negative value is
 * always a caller bug and is better surfaced than silently mis-encoded.
 */
export function bin(dec: number, pad: number): string {
  if (!Number.isSafeInteger(dec) || dec < 0) {
    throw new Error(`bin: invalid value=${dec}. Expected a non-negative safe integer`);
  }
  return dec.toString(2).padStart(pad, '0');
}

/** Create an array of given length filled with a value */
export function fill_arr<T>(length: number, val: T): T[] {
  return new Array(length).fill(val);
}

/** Track the minimum-scoring candidate across multiple calls */
export function best<T>(): { add(score: number, value: T): void, get: () => T | undefined, score: () => number } {
  let best_val: T | undefined;
  let best_score = Infinity;
  return {
    add(score: number, value: T): void {
      if (score >= best_score) return;
      best_val = value;
      best_score = score;
    },
    get: (): T | undefined => best_val,
    score: (): number => best_score
  };
}

/** Create an encoder/decoder for a fixed character set */
export function alphabet(chars: string): AlphabetCoder<number[], string[]> {
  return {
    has: (char: string) => chars.includes(char),
    decode: (input: string[]) => {
      if (!Array.isArray(input) || (input.length && typeof input[0] !== 'string')) {
        throw new Error('alphabet.decode input should be array of strings');
      }
      return input.map((letter) => {
        if (typeof letter !== 'string') {
          throw new Error(`alphabet.decode: not string element=${letter}`);
        }
        // The length check must precede the lookup: `chars.indexOf` matches substrings, so
        // a multi-character element such as 'AB' would otherwise resolve to the index of
        // its first character rather than being rejected as not in the alphabet.
        if (letter.length !== 1) {
          throw new Error(`Unknown letter: "${letter}". Allowed: ${chars}`);
        }
        const index = chars.indexOf(letter);
        if (index === -1) throw new Error(`Unknown letter: "${letter}". Allowed: ${chars}`);
        return index;
      });
    },
    encode: (digits: number[]) => {
      if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number')) {
        throw new Error('alphabet.encode input should be an array of numbers');
      }
      return digits.map((i) => {
        assert_number(i);
        const char = chars[i];
        // The range check is expressed via the lookup itself so the result is a plain
        // `string`; `chars[i]` is only undefined exactly when i is outside [0, length).
        if (char === undefined) {
          throw new Error(`Digit index outside alphabet: ${i} (alphabet: ${chars.length})`);
        }
        return char;
      });
    }
  };
}
