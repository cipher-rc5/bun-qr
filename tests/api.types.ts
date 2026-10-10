// This file is compiled by typecheck and intentionally not executed as a test.
import encode_qr, { type Output, type QrOpts, type SvgQrOpts } from '../src/index';

const defaultRaw: boolean[][] = encode_qr('default raw');
const explicitDefault: boolean[][] = encode_qr('default raw', undefined, { border: 4 });
const raw: boolean[][] = encode_qr('raw', 'raw');
const svg: string = encode_qr('svg', 'svg', { optimize: true });
const ascii: string = encode_qr('ascii', 'ascii');
const gif: Uint8Array = encode_qr('gif', 'gif');
const dynamic = (output: Output, opts: QrOpts & SvgQrOpts): boolean[][] | string | Uint8Array => encode_qr('dynamic', output, opts);

export const consumerExamples = { defaultRaw, explicitDefault, raw, svg, ascii, gif, dynamic };
