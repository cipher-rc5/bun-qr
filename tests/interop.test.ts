import { describe, expect, test } from 'bun:test';
import { decompressFrames, parseGIF } from 'gifuct-js';
import jsQR from 'jsqr';
import { BunQrGenerator } from '../src/cli/qr-generator';
import { Bitmap } from '../src/core/bitmap';
import encode_qr, { EC_MODE, type Mask, type QrOpts, validate_version } from '../src/index';

// Independent decoders are development dependencies only. Expected pixels are
// constructed from the original boolean grid, never from our image serializer.
function pixels(rows: readonly (readonly (boolean | undefined)[])[]): Uint8ClampedArray {
  return Uint8ClampedArray.from(rows.flatMap((row) =>
    row.flatMap((dark) => {
      const value = dark ? 0 : 255;
      return [value, value, value, 255];
    })
  ));
}

function decoded_gif(bytes: Uint8Array) {
  const frames = decompressFrames(parseGIF(Uint8Array.from(bytes).buffer), true);
  expect(frames).toHaveLength(1);
  const frame = frames[0];
  if (!frame) throw new Error('GIF has no image frame');
  return frame;
}

describe('independent GIF decoding', () => {
  test('handles every short binary stream, including final-code width boundaries', () => {
    for (let length = 1;length <= 10;length++) {
      for (let pattern = 0;pattern < 2 ** length;pattern++) {
        const row = Array.from({ length }, (_, x) => ((pattern >>> x) & 1) === 1);
        const bitmap = new Bitmap({ height: 1, width: length }, [row]);
        expect(decoded_gif(bitmap.to_gif()).patch).toEqual(pixels([row]));
      }
    }
  });
  test.each([1, 2, 3, 4, 8, 16, 32, 64, 128, 256, 512, 1200])('preserves every pixel of a %i-square bitmap', (size) => {
    // Deterministic high-entropy pixels reach every LZW width and repeatedly fill
    // the 4096-entry dictionary on the largest fixture.
    let seed = 0x12345678;
    const bitmap = new Bitmap(size).rect(0, Infinity, () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed & 1) === 1;
    });
    const frame = decoded_gif(bitmap.to_gif());
    expect(frame.dims.width).toBe(size);
    expect(frame.dims.height).toBe(size);
    expect(frame.patch).toEqual(pixels(bitmap.data));
  });

  test.each([false, true])('preserves a uniform image (dark=%p)', (dark) => {
    const bitmap = new Bitmap(50).rect(0, Infinity, dark);
    expect(decoded_gif(bitmap.to_gif()).patch).toEqual(pixels(bitmap.data));
  });

  test('renders QR GIF pixels that independently decode to the input', () => {
    const input = 'https://bun.com/';
    const options: QrOpts = { scale: 4 };
    const frame = decoded_gif(encode_qr(input, 'gif', options));
    expect(frame.patch).toEqual(pixels(encode_qr(input, 'raw', options)));
    expect(jsQR(frame.patch, frame.dims.width, frame.dims.height)?.data).toBe(input);
  });
});

function decode(input: string, options: QrOpts = {}) {
  const rows = encode_qr(input, 'raw', { scale: 3, ...options });
  return jsQR(pixels(rows), rows.length, rows.length, { inversionAttempts: 'dontInvert' });
}

describe('independent QR payload decoding', () => {
  test('decodes default library and CLI GIF output without border overrides', () => {
    const input = 'https://bun.com/';
    const generator = new BunQrGenerator();
    for (const output of [encode_qr(input, 'gif'), generator.generate(input, 'gif')]) {
      if (!(output instanceof Uint8Array)) throw new Error('Expected GIF bytes');
      const frame = decoded_gif(output);
      expect(frame.dims.width).toBe(33); // Version 2 (25) plus four modules on each side.
      const rows = Array.from(
        { length: frame.dims.height },
        (_, y) => Array.from({ length: frame.dims.width }, (_, x) => frame.patch[(y * frame.dims.width + x) * 4] === 0)
      );
      const scaled = rows.flatMap(row => Array.from({ length: 4 }, () => row.flatMap(bit => [bit, bit, bit, bit])));
      expect(jsQR(pixels(scaled), scaled.length, scaled.length)?.data).toBe(input);
    }
    expect(generator.generate('x', 'svg')).toContain('viewBox="0 0 29 29"');
    const compact = encode_qr('x', 'raw', { border: 2 });
    expect(compact.length).toBe(25);
    expect(encode_qr('x').length).toBe(29);
  });

  test.each([['low', 2953], ['medium', 2331], ['quartile', 1663], ['high', 1273]] as const)(
    'decodes full version-40 byte capacity at %s ECC',
    (ecc, capacity) => {
      const input = Array.from({ length: capacity }, (_, i) => String.fromCharCode(33 + (i * 7) % 90)).join('');
      const result = decode(input, { encoding: 'byte', ecc });
      expect(result?.version).toBe(40);
      expect(result?.data).toBe(input);
    }
  );

  test('decodes full version-40 numeric and alphanumeric capacities', () => {
    const numeric = '0123456789'.repeat(709).slice(0, 7089);
    const alphanumeric = 'HELLO WORLD 123 $%*+./:-'.repeat(200).slice(0, 4296);
    expect(decode(numeric, { encoding: 'numeric', ecc: 'low' })?.data).toBe(numeric);
    expect(decode(alphanumeric, { encoding: 'alphanumeric', ecc: 'low' })?.data).toBe(alphanumeric);
  });

  const payloads = [{ text: '01234567', encoding: 'numeric' }, { text: 'HELLO QR', encoding: 'alphanumeric' }, {
    text: 'café',
    encoding: 'byte'
  }] as const;

  for (const ecc of EC_MODE) {
    for (const payload of payloads) {
      for (const version of [1, 7, 9, 10, 26, 27, 40]) {
        test(`${payload.encoding}, ${ecc}, version ${version}`, () => {
          const result = decode(payload.text, { ecc, encoding: payload.encoding, version: validate_version(version) });
          expect(result?.data).toBe(payload.text);
          expect(result?.version).toBe(version);
        });
      }
    }
  }

  for (let mask = 0;mask < 8;mask++) {
    test(`decodes forced mask ${mask}`, () => {
      expect(decode('mask: café 123', { mask: mask as Mask, ecc: 'high' })?.data).toBe('mask: café 123');
    });
  }

  test('decodes every QR version and its alignment pattern geometry', () => {
    for (let version = 1;version <= 40;version++) {
      expect(decode('v40', { version: validate_version(version) })?.data).toBe('v40');
    }
  });

  test('recovers data after three isolated module errors', () => {
    const input = 'ECC recovers original bytes';
    const rows = encode_qr(input, 'raw', { version: validate_version(5), ecc: 'high', border: 4 });
    // Bottom-right data modules, outside finder/format/alignment patterns.
    for (const [x, y] of [[40, 40], [38, 40], [36, 40]]) {
      if (x === undefined || y === undefined) throw new Error('Invalid test coordinate');
      rows[y]![x] = !rows[y]![x];
    }
    // Scale in the test harness, independently of Bitmap.scale.
    const scaled = rows.flatMap((row) => Array.from({ length: 4 }, () => row.flatMap((bit) => [bit, bit, bit, bit])));
    expect(jsQR(pixels(scaled), scaled.length, scaled.length)?.data).toBe(input);
  });
});
