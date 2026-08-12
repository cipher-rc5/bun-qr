# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — unreleased

Prepared as the first published release; not yet tagged or published to npm. Version
`0.1.0` was never tagged or published either, so there are no existing consumers and the
changes below break no released API.

This is a `0.x` release: under semantic versioning the public API may still change in any
minor release. The decoder (`src/decode.ts`) remains unimplemented, and the encoder is
verified structurally against ISO/IEC 18004 rather than by a full data-region round-trip.

**Security fixes**

- `encode_wifi` now validates `security` at runtime against `WPA`/`WEP`/`nopass`. It was
  previously interpolated into the payload unescaped and unchecked — the TypeScript union
  is erased at runtime — so a value such as `'WPA;S:Evil'` injected a second `S:` field and
  could forge the network a scanning device joins.
- `encode_vcard` now escapes the `URL` field, which alone among the text properties bypassed
  `escape_vcard`, allowing `\r\n` in a website value to inject arbitrary vCard properties
  (for example a `TEL:` the author never entered).
- `escape_vcard` now escapes bare `\r` as well as `\n`, per RFC 6350 §3.2. Escaping only
  `\n` left a real carriage return in the output, so CRLF injection survived escaping in
  every vCard and VEVENT field.
- `encode_bitcoin` now validates and percent-encodes the address and rejects non-finite or
  negative amounts. An address containing `?` previously let an attacker-supplied
  `amount=` win under BIP-21 first-`?` parsing, showing the payer the wrong sum.
- `encode_geo` now uses `Number.isFinite` guards on all four numeric fields; `NaN` passed
  the previous `<`/`>` range checks and produced `geo:NaN,NaN`.
- `encode_qr` now validates that a custom `text_encoder` returns a `Uint8Array`. Returning
  anything else silently produced a well-formed, scannable QR code containing NUL bytes
  instead of the payload.
- An unrecognised error-correction level no longer aliases silently to `medium`.
- `border` is now bounded. It was previously unchecked in both directions: a negative value
  surfaced a raw `RangeError` from array allocation, and a large one allocated without limit
  on the `raw`, `ascii`, `term`, and `svg` paths, which the `MAX_QR_PIXELS` guard never covered.

**Behavioural changes to be aware of**

- CLI exit codes changed: a missing `<url>` argument now exits `2` (usage) instead of `0`,
  so scripts can detect it. `--help` still exits `0`.
- Mask selection changed for some payloads, following the ISO/IEC 18004 §6.8.2.2 rule-3
  fix. Output remains spec-valid, but symbols encoded by this release may differ
  bit-for-bit from those produced by the untagged `0.1.0` tree.
- The CLI writes the artifact to stdout and status messages to stderr; colorization is
  disabled when stdout is not a TTY.
- `--output` refuses to overwrite an existing file without `--force`/`-F`.
- Unknown CLI options are rejected rather than silently ignored.

### Added

- Bun-native CLI entrypoint with URL input and output selection (`svg`, `gif`, `ascii`, `term`).
- Colorized CLI output using `Bun.color()`.
- Dependency-injected CLI architecture (`args-parser`, `app`, `qr-generator`, `url-normalizer`, `terminal-presenter`).
- Fixture-based regression coverage in `tests/fixtures/qr-fixtures.json` with SHA-256 + length checks.
- Benchmark suite in `tests/benchmark.ts` (`bun run bench`).
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) with format check, typecheck, test coverage, and benchmark artifact upload.
- GitHub Actions release workflow (`.github/workflows/release.yml`) triggered on `v*` tags; publishes to npm with
  provenance attestation. The publish step is the one place this project shells out to npm's CLI instead of Bun's:
  `bun publish` has no `--provenance` flag as of Bun 1.3.14 and silently ignores unknown flags, so using it would
  produce a green release with no attestation. Revert to `bun publish --provenance` once Bun supports it.
- `justfile` with recipes: `default` (typecheck + test), `ci`, `typecheck`, `test`, `coverage`, `bench`, `fmt`, `fmt-check`, `build`, `verify-package`, `clean`.
- `SECURITY.md` describing responsible disclosure via GitHub Private Security Advisory.
- `tsconfig.build.json` for declaration-only emit (inherits `bundler` module resolution, `types/` output).
- `src/core/tables.ts`: extracted `BYTES`, `WORDS_PER_BLOCK`, `ECC_BLOCKS` lookup tables.
- `src/core/utils.ts`: extracted `bin`, `fill_arr`, `best`, `alphabet` utilities.
- Branded `Version` type (`number & { readonly __brand: 'QrVersion' }`) to prevent unchecked version integers at compile time.
- `validate_version(n)` exported from `src/index.ts`; returns `Version` branded type.
- `_tests` export hooks in `src/core/error-correction.ts`, `src/core/penalty.ts`, and `src/core/encoder.ts` for white-box unit testing.
- `MAX_QR_PIXELS = 16_000_000` guard in `src/core/bitmap.ts` for `to_gif()` and `to_image()`.
- Correct 2-color LZW GIF encoder in `src/core/bitmap.ts` (GIF87a, min code size 2, bit-packed LSB-first, CLEAR/EOI codes, table-full reset).
- `SAFE_URL_SCHEMES` allowlist (`http:`, `https:`) in `src/links.ts`; `validate_url` now rejects non-HTTP/HTTPS schemes.
- Control character check (`has_control_chars`) guarding SSID and password fields in `encode_wifi()`.
- `encode_vcard()` upgraded to vCard 4.0 (RFC 6350): CRLF line endings, `VERSION:4.0`, `TEL;TYPE=voice:`, `EMAIL;TYPE=work:`, `URL;TYPE=work:`, `ADR;TYPE=work:`.
- Unit tests: `tests/core/error-correction.test.ts`, `tests/core/penalty.test.ts`, `tests/core/layout.test.ts`, `tests/core/encoder.test.ts`.
- `"test"`, `"build"`, `"fmt"`, `"fmt:check"`, and `"prepublishOnly"` scripts in `package.json`.
- `"files"`, `"engines"`, and `"module"` fields in `package.json`; removed `"private": true`.
- `--size` / `-s` CLI flag setting SVG output dimensions in pixels, bounded to 1–4000 by `MAX_CLI_SIZE` (commit `3114a4b`).
- `--force` / `-F` CLI flag; without it the CLI now refuses to overwrite an existing output file.
- `--` end-of-options separator; all following arguments are treated as positional.
- `LICENSE` (Apache-2.0) and `LICENSE-MIT`, both carried over verbatim from upstream `paulmillr/qr` so the fork's terms and copyright notice match the original exactly, plus a `"license": "(MIT OR Apache-2.0)"` field in `package.json` matching upstream's SPDX expression. The package previously shipped no license file at all despite the README claiming dual licensing.
- `tests/roundtrip.test.ts`: independent ISO/IEC 18004 verification of rendered symbols — format-information BCH(15,5), version BCH(18,6), function-pattern geometry, and published byte-capacity limits.
- `tests/core/bitmap.test.ts`: coverage for all four renderers, geometry primitives, and the `MAX_QR_PIXELS` guard.

### Changed

- The unimplemented `src/decode.ts` and `src/dom.ts` scaffolds are excluded from the published package via `files` negation patterns; they remain in the repository as future work but are no longer shipped to consumers, nor are their generated declarations.
- `utils` and `_tests` in `src/index.ts` are documented as internal and explicitly outside semantic versioning (`_tests` is marked `@internal`). Both remain exported — `_tests` is imported by the test suite across module boundaries — but application code must not depend on either.
- CLI now rejects unknown options instead of silently ignoring them.
- CLI status and success messages moved to stderr so `stdout` stays clean for piping; a missing `<url>` now exits with code 2 (usage) rather than 0.
- Terminal colorization is disabled automatically when the stream is not a TTY.
- `.gitignore` now covers `outputs/` and the default CLI output filenames (`qr-code.svg`, `qr-code.gif`) (commit `b902a85`).
- Applied dprint formatting across all source files (commits `f651a3a`, `f4a85ad`).
- Strengthened `tsconfig.json`: `noUnusedLocals` and `noUnusedParameters` enabled.
- `get_size()` in `src/dom.ts` now uses `getComputedStyle` instead of `.offsetWidth`/`.offsetHeight` and throws a descriptive error on non-positive dimensions.
- GIF output is now ~7–8× smaller due to correct LZW compression replacing the previous uncompressed pixel dump.
- `QrOpts.version` remains `number | undefined` in the public API; validated internally via `validate_version()`.
- Peer dependency on `typescript` relaxed to `">=5.0.0"` and marked optional via `peerDependenciesMeta`.

### Fixed

- GIF encoder previously wrote a 128-entry color table and uncompressed pixel data; replaced with a spec-compliant 2-color LZW encoder.
- `get_size()` was parsing `'Xpx'` strings with `parseInt` which silently swallowed units and returned `NaN`-adjacent values; now uses `parseFloat` on `getComputedStyle` output and validates the result.
- Removed all unused imports from `src/dom.ts` (`DecodeOpts`, `FinderPoints`, `QrImage`).
- Unused variables and parameters suppressed in `src/decode.ts` and `src/dom.ts` to satisfy `noUnusedParameters`.
- Removed `as Coder<Version, number>` cast from `info.size` whose `decode` side returns `number`, not `Version`.
- `version_bits` helper: `let d: number = ver` prevents the branded `Version` type from propagating into arithmetic temporaries.
- vCard output now uses CRLF line endings and vCard 4.0 type parameters as required by RFC 6350.
- URL validation in `src/links.ts` now rejects `javascript:`, `data:`, and other non-HTTP/HTTPS schemes.
- GIF fixture in `tests/fixtures/qr-fixtures.json` updated to reflect LZW-compressed output (`length: 171`).

## [0.1.0] — unreleased

`package.json` carries version `0.1.0`, but this version has never been tagged or
published; no git tags exist in the repository. The entries below describe the initial
implementation as it stands on `main`.

### Added

- Initial Bun QR encoder implementation with snake_case API.
- Multiple output formats: `raw`, `ascii`, `term`, `svg`, `gif`.
- Link encoding helpers: `url`, `email`, `phone`, `sms`, `vcard`, `wifi`, `geo`, `calendar`, `whatsapp`, `bitcoin`.
- Core modules: `src/core/bitmap.ts`, `src/core/layout.ts`, `src/core/error-correction.ts`, `src/core/encoder.ts`, `src/core/penalty.ts`.
- Strict TypeScript configuration.

<!--
  No release links are defined yet. This repository has no tags: `0.1.0` was
  never tagged or published, and `0.2.0` is prepared but not yet released, so
  every `compare/` and `releases/tag/` URL would 404. Add the links here as
  part of the commit that cuts the first tag.
-->

[Unreleased]: https://github.com/cipher-rc5/bun-qr/commits/main
