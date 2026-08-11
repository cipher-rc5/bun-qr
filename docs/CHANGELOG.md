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
- `justfile` with recipes: `default` (typecheck + test), `ci`, `typecheck`, `test`, `coverage`, `bench`, `fmt`, `fmt-check`, `build`, `verify-package`, `clean`.
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
  No comparison/release links yet: the repository has no git tags, so
  `compare/v0.1.0...HEAD` and `releases/tag/v0.1.0` would both 404. Add them
  once the first `v*` tag is pushed and the release workflow has run.
-->

[Unreleased]: https://github.com/cipher-rc5/bun-qr/commits/main
