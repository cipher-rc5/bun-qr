# bun-qr Project Structure

## Top-level layout

```text
bun-qr/
|- .github/
|  `- workflows/
|     |- ci.yml
|     `- release.yml
|- docs/
|  |- CHANGELOG.md
|  |- LINK_ENCODING.md
|  |- structure.md
|  |- summary.md
|  `- tree.md
|- examples/
|  |- basic.ts
|  |- links.ts
|  `- output/
|- src/
|  |- cli/
|  |  |- app.ts
|  |  |- args-parser.ts
|  |  |- qr-generator.ts
|  |  |- terminal-presenter.ts
|  |  |- types.ts
|  |  `- url-normalizer.ts
|  |- core/
|  |  |- bitmap.ts
|  |  |- encoder.ts
|  |  |- error-correction.ts
|  |  |- layout.ts
|  |  |- penalty.ts
|  |  |- tables.ts
|  |  `- utils.ts
|  |- cli.ts
|  |- decode.ts
|  |- dom.ts
|  |- index.ts
|  `- links.ts
|- tests/
|  |- core/
|  |  |- bitmap.test.ts
|  |  |- encoder.test.ts
|  |  |- error-correction.test.ts
|  |  |- layout.test.ts
|  |  `- penalty.test.ts
|  |- fixtures/
|  |  |- benchmark-fixtures.json
|  |  |- link-fixtures.json
|  |  `- qr-fixtures.json
|  |- benchmark.ts
|  |- cli.app.test.ts
|  |- cli.args.test.ts
|  |- index.test.ts
|  |- links.test.ts
|  `- roundtrip.test.ts
|- LICENSE
|- LICENSE-MIT
|- README.md
|- SECURITY.md
|- dprint.json
|- justfile
|- package.json
|- tsconfig.json
|- tsconfig.build.json
`- bun.lock
```

## Module responsibilities

- `src/index.ts`: stable public API surface and orchestration.
- `src/core/*`: isolated QR internals (encoding, layout, penalty, bitmap, ECC, lookup tables, shared utils).
- `src/cli/*`: CLI layers separated by concern (parse, normalize, generate, present).
- `src/links.ts`: structured payload helpers for common QR data formats.
- `tests/core/*`: white-box unit tests for the individual core modules.
- `tests/roundtrip.test.ts`: ISO/IEC 18004 structural verification independent of encoder internals.
- `tests/fixtures/*`: deterministic fixture data for regression tests.

## Engineering conventions

- Runtime/tooling/package manager: Bun
- API style: snake_case for core QR API compatibility style
- Type system: strict TypeScript with no implicit unsafety
- Validation strategy:
  - typecheck via `bun run typecheck`
  - tests via `bun test`
  - benchmarks via `bun run bench`

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests.

The `test` job:

1. `bun install --frozen-lockfile`
2. `bunx dprint check`
3. `bun run typecheck`
4. `bun run build`, then asserts `types/index.d.ts` and `types/links.d.ts` exist
5. packs the tarball and imports it from a clean Bun consumer (`bun-qr` and `bun-qr/links`)
6. `bun test --coverage`, uploading `coverage/` as an artifact

The `benchmark` job runs only on `main`: `bun run bench`, uploading the output as an artifact.

`.github/workflows/release.yml` triggers on `v*` tags. It repeats every CI gate, verifies the
tag matches `package.json` version, packs the tarball with SHA-256 checksums, generates a
CycloneDX SBOM, publishes to npm, and creates a GitHub Release with the artifacts attached.
