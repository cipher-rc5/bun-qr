import encode_qr from '../index';
import type { CliOutputFormat, QrGenerator } from './types';

export class BunQrGenerator implements QrGenerator {
  generate(payload: string, format: CliOutputFormat, size?: number): string | Uint8Array {
    if (format === 'svg') {
      const svg = encode_qr(payload, 'svg');
      if (size !== undefined) {
        return svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
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
