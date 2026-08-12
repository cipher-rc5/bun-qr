import encode_qr from '../index';
import { MAX_CLI_SIZE } from './args-parser';
import type { CliOutputFormat, QrGenerator } from './types';

/**
 * Reject anything that is not a plain positive integer within the supported bound
 * before it reaches the SVG attribute interpolation below.
 *
 * The CLI's `parseSize` already enforces `/^\d+$/`, but this class is exported and its
 * `size` parameter is typed `number`, so a non-CLI caller could otherwise pass a crafted
 * value (or a coerced string) straight into an attribute and inject markup. Keeping the
 * guarantee local to the interpolation means the escaping cannot be lost by refactoring
 * the parser, and the parser check remains as defense in depth.
 */
function assertSafeSize(size: number): number {
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > MAX_CLI_SIZE) {
    throw new Error(`Invalid size: ${String(size)}. Must be an integer between 1 and ${MAX_CLI_SIZE}.`);
  }

  return size;
}

export class BunQrGenerator implements QrGenerator {
  generate(payload: string, format: CliOutputFormat, size?: number): string | Uint8Array {
    if (format === 'svg') {
      const svg = encode_qr(payload, 'svg');
      if (size !== undefined) {
        const safe = assertSafeSize(size);
        return svg.replace('<svg ', `<svg width="${safe}" height="${safe}" `);
      }
      return svg;
    }

    if (format === 'gif') {
      return encode_qr(payload, 'gif');
    }

    if (format === 'ascii') {
      return encode_qr(payload, 'ascii');
    }

    return encode_qr(payload, 'term');
  }
}
