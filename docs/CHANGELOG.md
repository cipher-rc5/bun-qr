# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Bun-native CLI entrypoint with URL input and output selection (`svg`, `gif`, `ascii`, `term`).
- Colorized CLI output using `Bun.color()`.
- Dependency-injected CLI architecture (`args-parser`, `app`, `qr-generator`, `url-normalizer`, `terminal-presenter`).
- Fixture-based regression coverage in `tests/fixtures/qr-fixtures.json` with SHA-256 + length checks.
- Benchmark suite in `tests/benchmark.ts` (`bun run bench`).
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) with format check, typecheck, test coverage, and benchmark artifact upload.
- GitHub Actions release workflow (`.github/workflows/release.yml`) triggered on `v*` tags; publishes to npm with provenance.
- `Makefile` with targets: `all`, `typecheck`, `test`, `bench`, `fmt`, `fmt-check`, `build`, `clean`.
- `SECURITY.md` describing responsible disclosure via GitHub Private Security Advisory.
- `tsconfig.build.json` for library distribution builds (`NodeNext`, declarations, `dist/` output).
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

### Changed

- Strengthened `tsconfig.json`: `noUnusedLocals` and `noUnusedParameters` enabled.
- `get_size()` in `src/dom.ts` now uses `getComputedStyle` instead of `.offsetWidth`/`.offsetHeight` and throws a descriptive error on non-positive dimensions.
- GIF output is now ~7–8× smaller due to correct LZW compression replacing the previous uncompressed pixel dump.
- `QrOpts.version` remains `number | undefined` in the public API; validated internally via `validate_version()`.
- Peer dependency relaxed to `"typescript": "^5.0.0 || ^6.0.0"`.

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

## [0.1.0]

### Added

- Initial Bun QR encoder implementation with snake_case API.
- Multiple output formats: `raw`, `ascii`, `term`, `svg`, `gif`.
- Link encoding helpers: `url`, `email`, `phone`, `sms`, `vcard`, `wifi`, `geo`, `calendar`, `whatsapp`, `bitcoin`.
- Core modules: `src/core/bitmap.ts`, `src/core/layout.ts`, `src/core/error-correction.ts`, `src/core/encoder.ts`, `src/core/penalty.ts`.
- Strict TypeScript configuration.

[Unreleased]: https://github.com/cipher-rc5/bun-qr/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cipher-rc5/bun-qr/releases/tag/v0.1.0
