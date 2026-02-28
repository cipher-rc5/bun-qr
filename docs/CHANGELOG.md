# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- Bun-native CLI entrypoint with URL input and output selection (`svg`, `gif`, `ascii`, `term`).
- Colorized CLI output using `Bun.color()`.
- Dependency-injected CLI architecture (`args-parser`, `app`, `qr-generator`, `url-normalizer`, `terminal-presenter`).
- Fixture-based regression coverage in `tests/fixtures`.
- Benchmark suite in `tests/benchmark.ts` with `bun run bench`.
- GitHub Actions CI workflow at `.github/workflows/ci.yml`.
- Structured docs updates and this changelog.

### Changed
- Strengthened strict TypeScript settings in `tsconfig.json`.
- Refactored encoder internals to separated core modules:
  - `src/core/bitmap.ts`
  - `src/core/layout.ts`
  - `src/core/error-correction.ts`
  - `src/core/encoder.ts`
  - `src/core/penalty.ts`
- Kept `src/index.ts` as a public API facade while preserving behavior.

### Fixed
- Removed remaining loose typing hotspots and improved strict type safety in encoder internals.
- Stabilized deterministic QR fixture assertions via output length + SHA-256 checks.

## [0.1.0]

### Added
- Initial Bun QR encoder implementation with snake_case API.
- Multiple output formats (`raw`, `ascii`, `term`, `svg`, `gif`).
- Link encoding helpers (`url`, `email`, `phone`, `sms`, `vcard`, `wifi`, `geo`, `calendar`, `whatsapp`, `bitcoin`).
