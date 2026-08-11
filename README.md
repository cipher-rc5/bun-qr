# bun-qr

Forked from [paulmillr/qr](https://github.com/paulmillr/qr) by [paulmillr](https://github.com/paulmillr), and distributed under the same dual `MIT OR Apache-2.0` terms.

QR code generator built using the bun runtime. Zero dependencies, strict TypeScript, with multiple output formats, CLI support, and built-in link encoding utilities. This project is a fork of paulmillr's `qr`, retargeted at the Bun runtime and toolchain, with a snake_case API, a Bun-native CLI, and link encoding helpers added.

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
- Encoding verified against ISO/IEC 18004 by an independent spec oracle, not just golden hashes
- CI with format check, typecheck, declaration build, packaged-import check, and coverage

## Installation

### As a dependency

```bash
bun add bun-qr
```

```typescript
import encode_qr from 'bun-qr';
import { encode_wifi } from 'bun-qr/links';
```

The package ships TypeScript sources and is resolved through the `bun` export condition, so Bun runs `src/` directly. Type declarations are emitted for editors and `tsc` consumers.

### From source

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
bun run qr -- https://bun.sh --size 128 --output bun-128.svg
```

You can also run the binary name directly after install:

```bash
bunx bun-qr https://bun.com --format svg --output bun.svg
```

### Options

| Flag                                   | Description                                    |
| -------------------------------------- | ---------------------------------------------- |
| `-f, --format <svg\|gif\|ascii\|term>` | Output format (default: `svg`)                 |
| `-o, --output <path>`                  | Output file for `svg`/`gif` formats            |
| `-s, --size <pixels>`                  | Output size in pixels, `1`–`4000` (svg only)   |
| `-F, --force`                          | Overwrite the output file if it already exists |
| `-h, --help`                           | Show help                                      |
| `--`                                   | Treat all following arguments as positional    |

Behaviour notes:

- Unknown options are rejected rather than ignored; a missing `<url>` argument exits non-zero with a usage error.
- `--size` applies to SVG output only, and is bounded by the `MAX_QR_PIXELS` raster guard (4000 x 4000).
- Without `--force`, the CLI refuses to overwrite an existing output file.
- Status and error messages go to stderr, so `stdout` stays clean for piping `ascii`/`term` output.
- Colorization uses `Bun.color()` and is disabled automatically when stdout is not a TTY.
- URLs are auto-normalized by adding `https://` when the scheme is missing.

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
- `fmt` / `fmt:check`: dprint formatting
- `build`: declaration-only emit for editors and `tsc` consumers

A [`justfile`](justfile) wraps the same commands: `just` (typecheck + test), `just ci`
(everything CI enforces), plus `typecheck`, `test`, `coverage`, `bench`, `fmt`,
`fmt-check`, `build`, `verify-package`, and `clean`.

## Architecture

The core encoder has been separated by concern (SOLID-oriented modules):

- `src/core/bitmap.ts`: bitmap model and output format renderers
- `src/core/layout.ts`: QR template drawing, patterns, zigzag placement
- `src/core/error-correction.ts`: GF math + Reed-Solomon + interleaving
- `src/core/encoder.ts`: payload type detection and bitstream encoding
- `src/core/penalty.ts`: mask penalty scoring
- `src/core/tables.ts`: capacity and ECC lookup tables (ISO/IEC 18004 Annex I)
- `src/core/utils.ts`: shared helpers (`bin`, `fill_arr`, `best`, `alphabet`)
- `src/index.ts`: public API facade and orchestration

## Fixtures, Tests, and Benchmarks

- Deterministic fixtures live in `tests/fixtures/`
- QR fixture tests validate output length + SHA-256 stability (change detection, not correctness — see the note in `tests/index.test.ts`)
- `tests/roundtrip.test.ts` verifies rendered symbols against ISO/IEC 18004 independently of the encoder's internals: format-information BCH(15,5), version BCH(18,6), pattern geometry, and published byte capacities
- `tests/core/bitmap.test.ts` covers the four renderers, the geometry primitives, and the `MAX_QR_PIXELS` guard
- Link fixture tests validate canonical URL/email/WiFi encodings
- Benchmarks are defined in `tests/benchmark.ts` and run with `bun run bench`

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests. The `test` job:

- `bun install --frozen-lockfile`
- `bunx dprint check` (format check)
- `bun run typecheck`
- `bun run build` (declaration emit) and verification that `types/index.d.ts` and `types/links.d.ts` exist
- packs the tarball and verifies it imports cleanly from a fresh Bun consumer (both `bun-qr` and `bun-qr/links`)
- `bun test --coverage`, uploading the `coverage/` directory as an artifact

A second `benchmark` job runs only on `main`; it executes `bun run bench` and uploads the results as an artifact.

`.github/workflows/release.yml` triggers on `v*` tags. It re-runs every CI gate, verifies the tag matches `package.json` version, packs the tarball with SHA-256 checksums, generates a CycloneDX SBOM, publishes to npm, and creates a GitHub Release with the artifacts attached.

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

// GIF image (LZW-compressed, 2-color palette)
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

**Not implemented.** This library encodes only.

`src/decode.ts` is an unimplemented scaffold: `decode_qr()` unconditionally throws
`QR decoder not yet implemented`. There is no image-loading helper, the module is
deliberately not listed in the `exports` map, and it is excluded from the published
package entirely — so `bun-qr/decode` does not resolve and the file is not present in an
installed copy. It exists only in the repository, as future work. Do not depend on it.
Decoding is tracked as roadmap item 1 in `docs/summary.md`.

If you need to read QR codes today, use a dedicated decoder library.

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
  - `text_encoder`: Custom string-to-bytes encoder, `(text: string) => Uint8Array` (default: UTF-8 via `TextEncoder`)

#### `text_encoder`

Overrides how `text` is converted to bytes in `byte` encoding mode — useful for legacy
target charsets such as Shift_JIS or ISO-8859-1.

```typescript
const latin1 = (text: string) => Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);
const svg = encode_qr('café', 'svg', { encoding: 'byte', text_encoder: latin1 });
```

> **Security:** this callback receives the raw, potentially untrusted `text` argument.
> Keep it a pure string-to-bytes transform — never `eval` it, use it to build shell or SQL
> strings, or let it perform I/O. A `text_encoder` that returns more bytes than the chosen
> version can hold causes encoding to fail rather than silently truncate.

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

Licensed under either of

- Apache License, Version 2.0 ([LICENSE](LICENSE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option.

This project is a fork of [paulmillr/qr](https://github.com/paulmillr/qr), which is
distributed under the same dual `MIT OR Apache-2.0` terms. Both license files are carried
over verbatim from upstream, preserving the original copyright notice as those terms
require.

Unless you explicitly state otherwise, any contribution intentionally submitted for
inclusion in this work shall be dual licensed as above, without any additional terms or
conditions.
