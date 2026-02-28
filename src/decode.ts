// file: src/decode.ts
// description: QR code decoder/reader for Bun runtime
// reference: https://github.com/cipher-rc5/bun-qr

import { type Image as QrImage, type Point } from './index';

// Finder pattern structure
export type FinderPoints = [Pattern, Pattern, Point, Pattern];
type Pattern = Point & { module_size: number, count: number };

// Decoding options
export type DecodeOpts = {
  crop_to_square?: boolean,
  text_decoder?: (bytes: Uint8Array) => string,
  points_on_detect?: (points: FinderPoints) => void,
  image_on_bitmap?: (img: QrImage) => void,
  image_on_detect?: (img: QrImage) => void,
  image_on_result?: (img: QrImage) => void
};

// Decode QR code from image
export function decode_qr(img: QrImage, opts: DecodeOpts = {}): string {
  throw new Error('QR decoder not yet implemented. Coming soon!');
}

export default decode_qr;
