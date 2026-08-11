export interface AlphabetCoder {
  has(char: string): boolean;
  decode(input: string[]): number[];
}

export interface EncodingInfo<TEncoding extends string, TVersion extends number, TEcc extends string> {
  alphabet: { numeric: AlphabetCoder, alphanumerc: AlphabetCoder };
  length_bits(ver: TVersion, type: TEncoding): number;
  mode_bits: Record<TEncoding, string>;
  capacity(ver: TVersion, ecc: TEcc): { capacity: number };
}

/**
 * Fixed-capacity MSB-first bit writer backed by a Uint8Array.
 *
 * Replaces the previous approach of concatenating a JS string of '0'/'1' characters and
 * re-parsing it with a regex, which allocated heavily and required a non-null assertion.
 */
class BitWriter {
  private readonly bytes: Uint8Array;
  private bit_length = 0;

  constructor (capacity_bits: number) {
    this.bytes = new Uint8Array(Math.ceil(capacity_bits / 8));
  }

  get length(): number {
    return this.bit_length;
  }

  /** Append the low `count` bits of `value`, most significant bit first. */
  push(value: number, count: number): void {
    for (let i = count - 1;i >= 0;i--) this.push_bit((value >>> i) & 1);
  }

  push_bit(bit: number): void {
    // `bytes` is sized for the full capacity and `encode_payload` rejects payloads that
    // exceed it before writing, so this index is always in range. Guarding explicitly
    // keeps a future overflow from silently vanishing into a dropped bit.
    const idx = this.bit_length >>> 3;
    if (bit) {
      const cur = this.bytes[idx];
      if (cur === undefined) throw new Error(`BitWriter: write past capacity at bit ${this.bit_length}`);
      this.bytes[idx] = cur | (0x80 >>> (this.bit_length & 7));
    }
    this.bit_length++;
  }

  /** Append `count` zero bits. */
  push_zeros(count: number): void {
    this.bit_length += count;
  }

  /** The written bits, padded to a whole number of bytes. */
  to_bytes(): Uint8Array {
    return this.bytes.subarray(0, Math.ceil(this.bit_length / 8));
  }
}

export function detect_type<TEncoding extends 'numeric' | 'alphanumeric' | 'byte'>(
  info: Pick<EncodingInfo<TEncoding, number, string>, 'alphabet'>,
  str: string
): TEncoding {
  let type = 'numeric' as TEncoding;
  for (const x of str) {
    if (info.alphabet.numeric.has(x)) continue;
    type = 'alphanumeric' as TEncoding;
    if (!info.alphabet.alphanumerc.has(x)) return 'byte' as TEncoding;
  }
  return type;
}

export function encode_payload<TEncoding extends string, TVersion extends number, TEcc extends string>(
  info: EncodingInfo<TEncoding, TVersion, TEcc>,
  interleave: (ver: TVersion, ecc: TEcc) => { encode(bytes: Uint8Array): Uint8Array },
  ver: TVersion,
  ecc: TEcc,
  data: string,
  type: TEncoding,
  encoder: (value: string) => Uint8Array
): Uint8Array {
  const { capacity } = info.capacity(ver, ecc);
  const mode = info.mode_bits[type];
  const length_bits = info.length_bits(ver, type);

  // Resolve the payload symbols (and the length field's value) before writing any bits,
  // so the capacity check still happens before allocation-sensitive work.
  let data_len = data.length;
  let symbols: number[] | undefined;
  let utf8: Uint8Array | undefined;

  if (type === 'numeric') {
    symbols = info.alphabet.numeric.decode(data.split(''));
    data_len = symbols.length;
  } else if (type === 'alphanumeric') {
    symbols = info.alphabet.alphanumerc.decode(data.split(''));
    data_len = symbols.length;
  } else if (type === 'byte') {
    utf8 = encoder(data);
    data_len = utf8.length;
  } else {
    throw new Error('encode: unsupported type');
  }

  const encoded_bits = type === 'numeric' ?
    Math.floor(data_len / 3) * 10 + (data_len % 3 === 1 ? 4 : data_len % 3 === 2 ? 7 : 0) :
    type === 'alphanumeric' ?
    Math.floor(data_len / 2) * 11 + (data_len % 2) * 6 :
    data_len * 8;

  const total_bits = mode.length + length_bits + encoded_bits;
  if (total_bits > capacity) throw new Error('Capacity overflow');

  const w = new BitWriter(capacity);
  w.push(Number(`0b${mode}`), mode.length);
  w.push(data_len, length_bits);

  // `symbols` is set on both the numeric and alphanumeric branches above and `utf8` on the
  // byte branch, so the matching variable is always defined here. Reading through a local
  // `?? []` keeps that total without an assertion; every `t[...]` below is bounded by
  // `n = t.length`, so `?? 0` is unreachable padding rather than a behavioural fallback.
  const t = symbols ?? [];
  const n = t.length;
  if (type === 'numeric') {
    for (let i = 0;i < n - 2;i += 3) w.push((t[i] ?? 0) * 100 + (t[i + 1] ?? 0) * 10 + (t[i + 2] ?? 0), 10);
    if (n % 3 === 1) w.push(t[n - 1] ?? 0, 4);
    else if (n % 3 === 2) w.push((t[n - 2] ?? 0) * 10 + (t[n - 1] ?? 0), 7);
  } else if (type === 'alphanumeric') {
    for (let i = 0;i < n - 1;i += 2) w.push((t[i] ?? 0) * 45 + (t[i + 1] ?? 0), 11);
    if (n % 2 === 1) w.push(t[n - 1] ?? 0, 6);
  } else {
    for (const byte of utf8 ?? []) w.push(byte, 8);
  }

  // Terminator: up to 4 zero bits, then zero-pad to a byte boundary.
  w.push_zeros(Math.min(4, capacity - w.length));
  if (w.length % 8) w.push_zeros(8 - (w.length % 8));

  // Fill the remaining capacity with the alternating pad codewords 0xEC / 0x11.
  const PAD_CODEWORDS = [0b11101100, 0b00010001] as const;
  for (let idx = 0;w.length < capacity;idx++) w.push(idx % 2 === 0 ? PAD_CODEWORDS[0] : PAD_CODEWORDS[1], 8);

  return interleave(ver, ecc).encode(w.to_bytes());
}

// Internal exports for unit testing — do not use in application code
export const _tests = { detect_type, encode_payload };
