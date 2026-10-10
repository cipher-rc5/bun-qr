# bun-qr

Forked from [paulmillr/qr](https://github.com/paulmillr/qr) by [paulmillr](https://github.com/paulmillr), and distributed under the same dual `MIT OR Apache-2.0` terms.

QR code generator for Bun with zero runtime dependencies, strict TypeScript, multiple output formats, a CLI, and link encoding utilities. This project is a fork of paulmillr's `qr`, retargeted at the Bun runtime and toolchain, with a snake_case API and link encoding helpers added.

## Features

- Zero runtime dependencies; development tools and test decoders are development dependencies
- Built for Bun runtime, APIs, and package manager
- Strict type-safe TypeScript configuration
- QR code generation (encoding)
- CLI for URL -> QR generation (`bun-qr`)
- Bun-native terminal colorization with `Bun.color()`
- **Link & data encoding utilities** for URLs, emails, WiFi, vCards, and more
- Multiple output formats: ASCII, Terminal, SVG, GIF, Raw
- Snake_case public encoder and link APIs
- Comprehensive error correction support
- Independent QR structural tests, QR payload decoding, and GIF pixel decoding
- CI with format check, lint, typecheck, declaration build, packaged-import check, and coverage

## Installation

### As a dependency

> **Not yet published.** `bun-qr` has not been released to npm, so the command below will
> not resolve yet. Until the first release, use a source checkout or a locally built tarball as shown below.

```bash
bun add bun-qr
```

```typescript
import encode_qr from 'bun-qr';
import { encode_wifi } from 'bun-qr/links';
```

The package ships TypeScript sources and is resolved through the `bun` export condition, so Bun runs `src/` directly. Type declarations are emitted for editors and `tsc` consumers.

Bun 1.4.2 or newer is required; Node.js is not a supported runtime. Package exports resolve only for Bun, and both public entry points check for Bun at startup.
Development scripts force JavaScript tool wrappers to run with Bun, including tools with a Node.js shebang.
Utility scripts and the benchmark use Bun APIs and Bun Shell without Node imports or globals; Biome enforces this.
CLI internals and some test fixtures use Bun's Node-compatible APIs for atomic file creation, terminal streams, and exit codes.
Dependency lifecycle scripts are disabled in `bunfig.toml`; third-party GitHub Actions use GitHub-managed runtimes.

### From source

```bash
git clone https://github.com/cipher-rc5/bun-qr.git
cd bun-qr
bun install --frozen-lockfile
```

Git source installs do not include generated declarations. To install the complete package into another project,
build and pack from this checkout:

```bash
bun run build
bun pm pack --ignore-scripts --destination dist-artifacts
```

Then run `bun add /absolute/path/to/bun-qr/dist-artifacts/bun-qr-0.2.0.tgz` in the consuming project.

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
bunx --bun bun-qr https://bun.com --format svg --output bun.svg
```

### Options

| Flag                                   | Description                                    |
| -------------------------------------- | ---------------------------------------------- |
| `-f, --format <svg\|gif\|ascii\|term>` | Output format (default: `svg`)                 |
| `-o, --output <path>`                  | Write any output format to a file              |
| `-s, --size <pixels>`                  | Output size in pixels, `1`–`4000` (svg only)   |
| `-F, --force`                          | Overwrite the output file if it already exists |
| `-h, --help`                           | Show help                                      |
| `--`                                   | Treat all following arguments as positional    |

Behaviour notes:

- `--help` exits `0`; a missing `<url>` exits `2`; other parsing, encoding, and filesystem errors exit `1`.
- Unknown options are rejected. Only the first positional URL is used.
- `--size` sets SVG `width` and `height` attributes, with a CLI limit of `1`–`4000`. Other formats ignore it with a warning.
- SVG and GIF default to `qr-code.svg` and `qr-code.gif`. ASCII and terminal output go to stdout unless `--output` is supplied.
- Without `--force`, the CLI refuses to overwrite an existing output file.
- Creation is exclusive and atomic across competing writers; filename characters such as `#` and `%` are treated literally.
- Status and error messages go to stderr, so `stdout` stays clean for piping `ascii`/`term` output.
- Presenter colorization uses `Bun.color()` and checks each stream's TTY independently. The `term` renderer itself emits ANSI artwork; use `ascii` for plain text.
- URLs are auto-normalized by adding `https://` when the scheme is missing.
- Only HTTP/HTTPS URLs are accepted. `localhost:port` and dotted-hostname ports support shorthand; other single-label hosts with ports need an explicit scheme.
- The CLI uses the encoder's current two-module border. Use the library API with `border: 4` for a four-module quiet zone.

## Development

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun test
bun run bench
```

- `typecheck`: strict TypeScript validation
- `test`: unit and fixture regression tests
- `bench`: Bun runtime benchmark suite
- `fmt` / `fmt:check`: dprint formatting
- `lint` / `lint:fix`: Biome lint checks and safe fixes, configured in `biome.json`
- `build`: declaration-only emit for editors and `tsc` consumers
- `verify:toolchain`: check supported Bun versions and workflow/development pins
- `verify:package`: check packed exports and declarations from a clean consumer

A [`justfile`](justfile) wraps the same commands: `just` (typecheck + test), `just ci`
(toolchain, audit, formatting, lint, types, build, package verification and coverage), plus individual task recipes.
GitHub uploads benchmark artifacts and prints coverage in the test logs. See the coverage upload limitation below.
dprint and its plugins are exact-pinned; installation leaves source untouched. See [CONTRIBUTING.md](CONTRIBUTING.md) for all checks.

### Pushing

Name the destination branch explicitly: `git push origin HEAD:<branch>`. Use the branch name reported by
`git branch --show-current`; add `-u` when setting its upstream for the first time.

## Architecture

The core encoder has been separated by concern (SOLID-oriented modules):

- `src/core/bitmap.ts`: bitmap model and output format renderers
- `src/core/layout.ts`: QR template drawing, patterns, zigzag placement
- `src/core/error-correction.ts`: GF math + Reed-Solomon + interleaving
- `src/core/encoder.ts`: payload type detection and bitstream encoding
- `src/core/penalty.ts`: mask penalty scoring
- `src/core/tables.ts`: capacity and ECC lookup tables (ISO/IEC 18004 Annex I)
- `src/core/utils.ts`: shared helpers (`bin`, `fill_arr`, `best`, `alphabet`)
- `src/core/url.ts`: shared HTTP/HTTPS scheme policy and host/port detection
- `src/index.ts`: public API facade and orchestration
- `src/runtime.ts`: Bun requirement shared by the public entry points

## Fixtures, Tests, and Benchmarks

- Deterministic fixtures live in `tests/fixtures/`
- QR fixture tests validate output length + SHA-256 stability (change detection, not correctness — see the note in `tests/index.test.ts`)
- `tests/roundtrip.test.ts` verifies rendered symbols against ISO/IEC 18004 independently of the encoder's internals: format-information BCH(15,5), version BCH(18,6), pattern geometry, and published byte capacities
- `tests/interop.test.ts` independently decodes QR payloads across every version, mode/ECC boundaries and all masks with jsQR, and GIF pixels with gifuct-js; both are development-only dependencies
- `tests/cli.io.test.ts` exercises exclusive writes, competing writers, terminal presentation and the executable CLI
- `tests/api.types.ts` checks public overloads during typechecking; package verification additionally checks emitted consumer declarations
- `tests/core/bitmap.test.ts` covers bitmap renderers, geometry, and the `MAX_QR_PIXELS` allocation guard
- `tests/runtime.test.ts`, `tests/toolchain.test.ts`, and `tests/scripts.test.ts` cover Bun execution, version policy, and temporary-directory safety
- Link fixture tests validate canonical URL/email/WiFi encodings
- Benchmarks are defined in `tests/benchmark.ts` and run with `bun run bench`
- Benchmarks record Bun/platform metadata, warmups and five measured batches, including near-capacity and scaled-image cases

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests. The `test` job:

- `bun install --frozen-lockfile`
- toolchain pins and supported minimum verified by the prerequisite `version-pin` job
- `bun audit --audit-level=high`
- `bun run fmt:check` (dprint format check)
- `bun run lint` (Biome lint check; warnings fail the check)
- `bun run typecheck`
- `bun run build` (declaration emit) and verification that `types/index.d.ts` and `types/links.d.ts` exist
- `bun run verify:package`, checking packed imports and consumer types for both public entry points
- `bun test --coverage`, printing a coverage summary

The workflow has an upload step targeting `coverage/`, but no file coverage reporter is configured.
The current test command produces console output rather than an uploadable coverage file.
To generate a local file report, use `bun test --coverage --coverage-reporter=lcov` as described in
[Bun's coverage documentation](https://bun.com/docs/test/code-coverage).

A second `benchmark` job runs only on `main`; it executes `bun run bench` and uploads the results as an artifact.

`.github/workflows/release.yml` triggers on `v*` tags. It runs the validation gates, verifies the tag matches
`package.json`, generates a CycloneDX SBOM and SHA-256 checksums, verifies the packed tarball with a clean consumer,
and creates a signed GitHub/Sigstore build attestation. It publishes that same tarball with Bun and attaches the
archive, checksums, SBOM and provenance bundle to the GitHub Release. This attestation is separate from npm registry provenance.
See [release verification](docs/RELEASE_VERIFICATION.md) for consumer commands and the first-release validation procedure.

## Quick Start

```typescript
import encode_qr from 'bun-qr';

const text = 'Hello, World!';

// ASCII art (compact, not all fonts supported)
const ascii = encode_qr(text, 'ascii');
console.log(ascii);

// Terminal-friendly (two character cells per module, emits ANSI colors)
const term = encode_qr(text, 'term');
console.log(term);

// SVG vector image
const svg = encode_qr(text, 'svg', { border: 4 });
await Bun.write('qr.svg', svg);

// GIF image (LZW-compressed, 2-color palette)
const gif = encode_qr(text, 'gif', { border: 4 });
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
- **Calendar Events**: VEVENT fragments, rather than complete `.ics` files
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

### `encode_qr(text, output?, options?)`

Generate a QR code.

**Parameters:**

- `text`: String to encode
- `output`: Output format ('raw' | 'ascii' | 'term' | 'svg' | 'gif'), default `'raw'`
- `options`: Optional configuration object
  - `ecc`: Error correction level ('low' | 'medium' | 'quartile' | 'high'), default `'medium'`
  - `encoding`: Supported mode ('numeric' | 'alphanumeric' | 'byte'), automatically detected when omitted
  - `version`: Integer QR version `1`–`40`; the smallest fitting version is selected when omitted
  - `mask`: Integer pattern `0`–`7`; the lowest-penalty mask is selected when omitted
  - `border`: Integer border width in modules, `0`–`1024` (default: `2`)
  - `scale`: Integer module scale, `1`–`1024` (default: `1`)
  - `optimize`: For SVG, use optimized path (default: true)
  - `text_encoder`: Custom string-to-bytes encoder, `(text: string) => Uint8Array` (default: UTF-8 via `TextEncoder`)

| Output                       | Return type                           |
| ---------------------------- | ------------------------------------- |
| omitted or `'raw'`           | `boolean[][]` (`true` is dark)        |
| `'ascii'`, `'term'`, `'svg'` | `string`                              |
| `'gif'`                      | `Uint8Array`                          |
| dynamic `Output` value       | `boolean[][] \| string \| Uint8Array` |

To provide options with the default output, call `encode_qr(text, undefined, options)`.
The scaled bitmap area is limited to `16_000_000` cells for every output format; valid individual option values
can still exceed this combined limit. SVG output has a `viewBox` but no explicit display dimensions; `scale`
expands its geometry, while display size is controlled by the embedding page or the CLI's `--size`.
This output limit does not bound input processing or custom encoder allocations; set input-size limits when handling untrusted payloads.

The default border is two modules. Set `border: 4` for the four-module quiet zone described by
[DENSO WAVE](https://www.qrcode.com/en/howto/code.html); smaller borders need additional surrounding space.
`kanji` and `eci` appear in the exported mode tuple/type but are rejected by the encoder.

#### `text_encoder`

Overrides how `text` is converted to bytes in `byte` encoding mode — useful for legacy
target charsets such as Shift_JIS or ISO-8859-1.

```typescript
import encode_qr from 'bun-qr';

const latin1 = (text: string) => Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);
const svg = encode_qr('café', 'svg', { encoding: 'byte', text_encoder: latin1 });
```

> **Security:** this callback receives the raw, potentially untrusted `text` argument.
> Keep it a pure string-to-bytes transform — never `eval` it, use it to build shell or SQL
> strings, or let it perform I/O. A `text_encoder` that returns more bytes than the chosen
> version can hold causes encoding to fail rather than silently truncate.

Byte-mode encoding invokes this callback once per QR generation and reuses the measured bytes for the payload.
Numeric and alphanumeric modes do not invoke it. The callback changes payload bytes without adding an ECI designator;
configure the receiving decoder's charset when using a custom encoding.

### Other Exports

Also available from `bun-qr`:

- **`validate_version(n)`**: Validate an integer in `[1, 40]` and return it as a branded
  `Version`. This is the only supported way to construct a `Version` — do not cast.
  Throws unless `n` is a safe integer in that range.
- **`utf8_to_bytes(text)`**: The default `text_encoder` — UTF-8 encoding via `TextEncoder`.
- **`EC_MODE`**: Readonly tuple of the four error-correction levels.
- **`ENCODING`**: Readonly tuple `['numeric', 'alphanumeric', 'byte', 'kanji', 'eci']`; the last two modes are not implemented.
- **Types**: `Version`, `Mask`, `ErrorCorrection`, `EncodingType`, `QrOpts`, `SvgQrOpts`, `Output`, `Image`, `Point`, and `Size`.

And from `bun-qr/links`:

- **`validate_url(url)`**: Checks URL parsing and HTTP/HTTPS only; it does not apply `encode_url`'s control-character check.
- **`SAFE_URL_SCHEMES`**: Informational `ReadonlySet` of `http:` and `https:`. Changing the underlying set does not configure the internal scheme policy.
- **`WIFI_SECURITY_TYPES`**: Readonly tuple `['WPA', 'WEP', 'nopass']` used for runtime WiFi security validation.
- **Types**: `UrlOptions`, `EmailOptions`, `SmsOptions`, `VCardOptions`, `WifiOptions`, `GeoOptions`, and `CalendarEventOptions`.
- **Default export**: Object containing the ten `encode_*` link helpers.

> `utils` and `_tests` are also exported but are **internal and outside semantic
> versioning**. Their shapes track the encoder's implementation and may change in any
> release, including a patch.

### Link Encoding Functions

All link encoding functions are available from `bun-qr/links`:

> **Handling untrusted input:** helpers validate their documented fields and escape delimiters, including WiFi
> separators and vCard/calendar line breaks. This is not a complete sanitizer: vCard/calendar free-text fields
> do not reject every ASCII control character, and geo serialization has known format limitations.
> Validate input for the receiving application and handle errors. Details are in [LINK_ENCODING.md](docs/LINK_ENCODING.md).

- **`encode_url(url, options?)`**: Format and validate URLs
  - `auto_protocol`: Add `https://` if missing (default: true)

- **`encode_email(email, options?)`**: Create mailto links
  - `subject`, `body`, `cc`, `bcc`: Optional email fields

- **`encode_phone(phone)`**: Format phone numbers as `tel:` links

- **`encode_sms(phone, options?)`**: Create SMS links with optional body

- **`encode_vcard(options)`**: Generate vCard contact information
  - `formatted_name`, `first_name`, `last_name`, `organization`, `title`, `phone`, `email`, `url`, `address`, `note`
  - A display name is required, directly or derived from personal names or organization

- **`encode_wifi(options)`**: WiFi network configuration
  - `ssid` (required), `password`, `security` (WPA/WEP/nopass), `hidden`
  - Defaults: empty password, `security: 'WPA'`, `hidden: false`

- **`encode_geo(options)`**: Geographic coordinates
  - `latitude`, `longitude`, `altitude`, `uncertainty`
  - Current uncertainty serialization uses `?u=`; strict RFC 5870 serialization is not implemented

- **`encode_calendar_event(options)`**: iCalendar events
  - `title`, `start`, `end`, `location`, `description`, `all_day`
  - Emits a VEVENT fragment; dates use UTC and `all_day` defaults to `false`

- **`encode_whatsapp(phone, message?)`**: WhatsApp direct messages

- **`encode_bitcoin(address, options?)`**: Bitcoin payment requests
  - `amount`, `label`, `message`

## Performance

Run `bun run bench` for measurements on your machine. The suite records Bun and host metadata,
performs ten warmups, and measures five batches for each of eight cases. It reports aggregate throughput,
median batch duration, and range; these are measurements rather than latency guarantees.
Bun executes TypeScript sources directly; `bun run build` emits declarations only.

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
