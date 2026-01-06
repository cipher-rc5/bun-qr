# bun-qr

High-performance QR code generator and reader built exclusively for Bun runtime. Zero dependencies, ultra-fast, with support for multiple output formats.

## Features

- Zero dependencies
- Built for Bun's high-performance runtime
- QR code generation (encoding)
- QR code reading (decoding)
- Multiple output formats: ASCII, Terminal, SVG, GIF, Raw
- Snake_case API for Rust compatibility
- Comprehensive error correction support

## Installation

```bash
bun add bun-qr
```

## Quick Start

```typescript
import encode_qr from 'bun-qr';

const text = 'Hello, World!';

// ASCII art (compact, not all fonts supported)
const ascii = encode_qr(text, 'ascii');
console.log(ascii);

// Terminal-friendly (2x larger, all fonts work)
const term = encode_qr(text, 'term');
console.log(term);

// SVG vector image
const svg = encode_qr(text, 'svg');
await Bun.write('qr.svg', svg);

// GIF image (uncompressed)
const gif = encode_qr(text, 'gif');
await Bun.write('qr.gif', gif);

// Raw 2D boolean array
const raw = encode_qr(text, 'raw');
```

## Decoding QR Codes

```typescript
import { decode_qr } from 'bun-qr/decode';

// From file
const file = Bun.file('qr-code.png');
const buffer = await file.arrayBuffer();
const image = decode_image(buffer); // Helper function
const result = decode_qr(image);
console.log(result);
```

## API

### `encode_qr(text, output, options?)`

Generate a QR code.

**Parameters:**

- `text`: String to encode
- `output`: Output format ('raw' | 'ascii' | 'term' | 'svg' | 'gif')
- `options`: Optional configuration object
  - `ecc`: Error correction level ('low' | 'medium' | 'quartile' | 'high')
  - `encoding`: Encoding type ('numeric' | 'alphanumeric' | 'byte')
  - `version`: QR version (1-40)
  - `mask`: Mask pattern (0-7)
  - `border`: Border size in modules (default: 2)
  - `scale`: Scale factor (default: 1)
  - `optimize`: For SVG, use optimized path (default: true)

### `decode_qr(image, options?)`

Read a QR code from an image.

**Parameters:**

- `image`: Image object with `width`, `height`, and `data` (Uint8Array)
- `options`: Optional decoding configuration

## Performance

Built specifically for Bun's high-performance JavaScript runtime, this library leverages:

- Native Bun APIs for file I/O
- Optimized TypeScript compilation
- Zero-dependency architecture
- Efficient memory management

## License

Dual-licensed under Apache 2.0 OR MIT
