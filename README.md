# bun-qr

Codebase forked from the work of [paulmillr](https://github.com/paulmillr). Original codebase is available [https://github.com/paulmillr/qr](https://github.com/paulmillr/qr).  

QR code generator built using the bun runtime. Zero dependencies, strict TypeScript, with multiple output formats, CLI support, and built-in link encoding utilities. Instance is a fork of the work 

## Features

- Zero dependencies
- Built for Bun runtime, APIs, and package manager
- Strict type-safe TypeScript configuration
- QR code generation (encoding)
- CLI for URL -> QR generation (`bun-qr`)
- Bun-native terminal colorization with `Bun.color()`
- **Link & data encoding utilities** for URLs, emails, WiFi, vCards, and more
- Multiple output formats: ASCII, Terminal, SVG, GIF, Raw
- Snake_case API for Rust compatibility
- Comprehensive error correction support
- CI with Bun typecheck + test

## Installation

```bash
git clone https://github.com/cipher-rc5/bun-qr.git
cd bun-qr
bun install
```

## CLI

Generate QR codes from URLs directly from the terminal using Bun runtime and APIs:

```bash
bun run qr -- https://bun.com
bun run qr -- bun.com --format gif --output bun.gif
bun run qr -- https://bun.sh --format term
```

- Supports `svg`, `gif`, `ascii`, and `term` outputs
- Uses Bun-native colorized terminal messages via `Bun.color()`
- Auto-normalizes URLs by adding `https://` when missing

You can also run the binary name directly after install:

```bash
bun-qr https://bun.com --format svg --output bun.svg
```

## Development

```bash
bun install
bun run typecheck
bun test
bun run bench
```

- `typecheck`: strict TypeScript validation
- `test`: unit and fixture regression tests
- `bench`: Bun runtime benchmark suite

## Architecture

The core encoder has been separated by concern (SOLID-oriented modules):

- `src/core/bitmap.ts`: bitmap model and output format renderers
- `src/core/layout.ts`: QR template drawing, patterns, zigzag placement
- `src/core/error-correction.ts`: GF math + Reed-Solomon + interleaving
- `src/core/encoder.ts`: payload type detection and bitstream encoding
- `src/core/penalty.ts`: mask penalty scoring
- `src/index.ts`: public API facade and orchestration

## Fixtures, Tests, and Benchmarks

- Deterministic fixtures live in `tests/fixtures/`
- QR fixture tests validate output length + SHA-256 stability
- Link fixture tests validate canonical URL/email/WiFi encodings
- Benchmarks are defined in `tests/benchmark.ts` and run with `bun run bench`

## CI

GitHub Actions workflow at `.github/workflows/ci.yml` runs on push/PR:

- `bun install --frozen-lockfile`
- `bun run typecheck`
- `bun test`

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

## Link & Data Encoding

The library includes powerful utilities for encoding common QR code data types:

```typescript
import encode_qr from 'bun-qr';
import { encode_bitcoin, encode_calendar_event, encode_email, encode_geo, encode_phone, encode_sms, encode_url, encode_vcard, encode_whatsapp, encode_wifi } from 'bun-qr/links';

// URL with automatic protocol
const url = encode_url('example.com');
const qr = encode_qr(url, 'svg');

// Email with subject and body
const email = encode_email('hello@example.com', { subject: 'QR Code Inquiry', body: 'I scanned your code!' });
const email_qr = encode_qr(email, 'svg');

// WiFi network credentials
const wifi = encode_wifi({ ssid: 'MyNetwork', password: 'secret123', security: 'WPA' });
const wifi_qr = encode_qr(wifi, 'svg', { ecc: 'high' });

// vCard contact information
const contact = encode_vcard({
  first_name: 'John',
  last_name: 'Doe',
  organization: 'Acme Inc',
  phone: '+1-555-123-4567',
  email: 'john@acme.com',
  url: 'https://acme.com'
});
const vcard_qr = encode_qr(contact, 'svg');

// Geographic location
const location = encode_geo({ latitude: 37.7749, longitude: -122.4194 });
const geo_qr = encode_qr(location, 'svg');

// See examples/links.ts for more examples
```

### Supported Link Types

- **URLs**: Websites with automatic `https://` prefix
- **Email**: With optional subject, body, cc, bcc
- **Phone**: Phone numbers in `tel:` format
- **SMS**: Text messages with pre-filled body
- **vCard**: Complete contact information
- **WiFi**: Network credentials (WPA/WEP/open)
- **Geographic**: Latitude/longitude coordinates
- **Calendar Events**: iCalendar format events
- **WhatsApp**: Direct messages
- **Bitcoin**: Payment requests

## Decoding QR Codes

Decoder APIs are currently scaffolded and not fully implemented yet.

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

### Link Encoding Functions

All link encoding functions are available from `bun-qr/links`:

- **`encode_url(url, options?)`**: Format and validate URLs
  - `auto_protocol`: Add `https://` if missing (default: true)

- **`encode_email(email, options?)`**: Create mailto links
  - `subject`, `body`, `cc`, `bcc`: Optional email fields

- **`encode_phone(phone)`**: Format phone numbers as `tel:` links

- **`encode_sms(phone, options?)`**: Create SMS links with optional body

- **`encode_vcard(options)`**: Generate vCard contact information
  - `first_name`, `last_name`, `organization`, `title`, `phone`, `email`, `url`, `address`, `note`

- **`encode_wifi(options)`**: WiFi network configuration
  - `ssid` (required), `password`, `security` (WPA/WEP/nopass), `hidden`

- **`encode_geo(options)`**: Geographic coordinates
  - `latitude`, `longitude`, `altitude`, `uncertainty`

- **`encode_calendar_event(options)`**: iCalendar events
  - `title`, `start`, `end`, `location`, `description`, `all_day`

- **`encode_whatsapp(phone, message?)`**: WhatsApp direct messages

- **`encode_bitcoin(address, options?)`**: Bitcoin payment requests
  - `amount`, `label`, `message`

## Performance

Built specifically for Bun's high-performance JavaScript runtime, this library leverages:

- Native Bun APIs for file I/O
- Optimized TypeScript compilation
- Zero-dependency architecture
- Efficient memory management

## License

Dual-licensed under Apache 2.0 OR MIT
