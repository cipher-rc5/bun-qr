# bun-qr Summary

## Overview

`bun-qr` is a Bun-first, zero-dependency QR code generation library with strict TypeScript typing, a Bun CLI, link encoding utilities, fixture-backed regression tests, and a benchmark suite.

## Current Status

- Encoder: production-ready
- Decoder (`src/decode.ts`): scaffolded, not implemented yet
- DOM helpers (`src/dom.ts`): scaffolded for future browser scanning support
- Runtime/package manager/tooling: Bun only

## Key Capabilities

- Multiple outputs: `raw`, `ascii`, `term`, `svg`, `gif`
- Link/data helpers: URL, email, phone, SMS, vCard, WiFi, geo, calendar, WhatsApp, Bitcoin
- CLI generation flow: `bun-qr <url> [--format] [--output]`
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
- CI: `.github/workflows/ci.yml` runs install + typecheck + tests on push/PR

## Notes on Performance Data

Historical benchmark claims from early migration docs are replaced by executable project benchmarks in `tests/benchmark.ts`. Use `bun run bench` for current numbers on your machine.

## Roadmap

1. Implement decoder pipeline in `src/decode.ts`
2. Complete browser scanning utilities in `src/dom.ts`
3. Expand fixtures and benchmark scenarios for larger payload classes
4. Optional scheduled CI benchmark reporting
