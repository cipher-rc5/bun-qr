# bun-qr Summary

## Overview

`bun-qr` is a Bun-first, zero-runtime-dependency QR code generation library with strict TypeScript typing, a Bun CLI, link encoding utilities, fixture-backed regression tests, and a benchmark suite.

## Current Status

- Encoder: implemented with structural validation and independent decoding tests
- Decoder (`src/decode.ts`): scaffolded, not implemented yet
- DOM helpers (`src/dom.ts`): scaffolded for future browser scanning support
- Runtime/package manager/tooling: Bun only
- Licensing: dual `MIT OR Apache-2.0`, inherited from the upstream `paulmillr/qr` fork;
  both license files are carried over verbatim (see `LICENSE` and `LICENSE-MIT`)

## Key Capabilities

- Multiple outputs: `raw`, `ascii`, `term`, `svg`, `gif`
- Link/data helpers: URL, email, phone, SMS, vCard, WiFi, geo, calendar, WhatsApp, Bitcoin
- CLI generation flow: `bun-qr <url> [--format] [--output] [--size] [--force]`
- Bun colorized terminal output via `Bun.color()`
- Strict TypeScript configuration and deterministic fixture tests

## Architecture (SOLID-oriented split)

- `src/index.ts`: public API facade and orchestration
- `src/core/bitmap.ts`: bitmap model and renderers
- `src/core/layout.ts`: QR layout patterns, template, zigzag placement
- `src/core/error-correction.ts`: GF math, Reed-Solomon, interleaving
- `src/core/encoder.ts`: payload type detection and bitstream encoding
- `src/core/penalty.ts`: mask scoring logic
- `src/cli/*`: CLI parsing, app orchestration, URL normalization, output presentation

## Quality and Validation

- Typecheck: `bun run typecheck`
- Tests: `bun test`
- Benchmarks: `bun run bench`
- Formatting: `bunx --bun dprint check` / `bunx --bun dprint fmt`
- CI: `.github/workflows/ci.yml` checks toolchain pins, audits dependencies, runs format/lint/type checks,
  builds declarations, verifies package imports and consumer types, and runs `bun test --coverage` on push/PR.
  A separate `benchmark` job runs on `main`. The minimum and pinned runtime are Bun 1.4.2.
- Release: `.github/workflows/release.yml` verifies and publishes the same tarball on `v*` tags, with
  checksums, a CycloneDX SBOM and signed GitHub/Sigstore provenance (separate from npm registry provenance).
  Consumer commands are in `docs/RELEASE_VERIFICATION.md`.
- Correctness oracle: `tests/roundtrip.test.ts` validates rendered symbols against ISO/IEC 18004
  (format-information and version BCH codewords, pattern geometry, published capacity limits)
  rather than against the encoder's own output. `tests/interop.test.ts` uses development-only jsQR and gifuct-js
  decoders for payload and pixel round-trips, including all QR versions and GIF dictionary resets.

## Notes on Performance Data

Benchmarks in `tests/benchmark.ts` report the Bun version and host platform/architecture, five measured batches after warmup,
aggregate throughput, median batch duration and range. Cases include common formats, link helpers,
a near-capacity byte payload and scaled GIF output. Use `bun run bench` for current numbers on your machine;
batch timings are measurements, not latency guarantees.

## Roadmap

1. Implement decoder pipeline in `src/decode.ts`
2. Complete browser scanning utilities in `src/dom.ts`
3. Expand fixtures and benchmark scenarios for larger payload classes
4. Optional scheduled CI benchmark reporting
