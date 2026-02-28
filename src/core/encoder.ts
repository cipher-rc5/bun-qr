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

function bin(dec: number, pad: number): string {
  return dec.toString(2).padStart(pad, '0');
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
  let encoded = '';
  let data_len = data.length;

  if (type === 'numeric') {
    const t = info.alphabet.numeric.decode(data.split(''));
    const n = t.length;
    for (let i = 0;i < n - 2;i += 3) encoded += bin(t[i] * 100 + t[i + 1] * 10 + t[i + 2], 10);
    if (n % 3 === 1) {
      encoded += bin(t[n - 1], 4);
    } else if (n % 3 === 2) {
      encoded += bin(t[n - 2] * 10 + t[n - 1], 7);
    }
  } else if (type === 'alphanumeric') {
    const t = info.alphabet.alphanumerc.decode(data.split(''));
    const n = t.length;
    for (let i = 0;i < n - 1;i += 2) encoded += bin(t[i] * 45 + t[i + 1], 11);
    if (n % 2 === 1) encoded += bin(t[n - 1], 6);
  } else if (type === 'byte') {
    const utf8 = encoder(data);
    data_len = utf8.length;
    encoded = Array.from(utf8).map((i) => bin(i, 8)).join('');
  } else {
    throw new Error('encode: unsupported type');
  }

  const { capacity } = info.capacity(ver, ecc);
  const len = bin(data_len, info.length_bits(ver, type));
  let bits = info.mode_bits[type] + len + encoded;
  if (bits.length > capacity) throw new Error('Capacity overflow');
  bits += '0'.repeat(Math.min(4, Math.max(0, capacity - bits.length)));
  if (bits.length % 8) bits += '0'.repeat(8 - (bits.length % 8));
  const padding = '1110110000010001';
  for (let idx = 0;bits.length !== capacity;idx++) bits += padding[idx % padding.length];
  const bytes = Uint8Array.from(bits.match(/(.{8})/g)!.map((i) => Number(`0b${i}`)));
  return interleave(ver, ecc).encode(bytes);
}
