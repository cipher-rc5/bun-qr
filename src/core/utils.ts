// file: src/core/utils.ts
// description: internal utility functions shared across QR encoding modules

interface AlphabetCoder<F, T> {
  encode(from: F): T;
  decode(to: T): F;
  has(char: string): boolean;
}

function assert_number(n: number): void {
  if (!Number.isSafeInteger(n)) throw new Error(`integer expected: ${n}`);
}

/** Convert decimal to binary string with zero padding */
export function bin(dec: number, pad: number): string {
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
        if (i < 0 || i >= chars.length) {
          throw new Error(`Digit index outside alphabet: ${i} (alphabet: ${chars.length})`);
        }
        return chars[i];
      });
    }
  };
}
