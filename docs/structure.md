# bun-qr Project Structure

## Top-level layout

```text
bun-qr/
|- .github/
|  `- workflows/
|     `- ci.yml
|- docs/
|  |- CHANGELOG.md
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
|  |  `- penalty.ts
|  |- cli.ts
|  |- decode.ts
|  |- dom.ts
|  |- index.ts
|  `- links.ts
|- tests/
|  |- benchmark.ts
|  |- cli.app.test.ts
|  |- cli.args.test.ts
|  |- index.test.ts
|  `- fixtures/
|- package.json
|- tsconfig.json
`- bun.lock
```

## Module responsibilities

- `src/index.ts`: stable public API surface and orchestration.
- `src/core/*`: isolated QR internals (encoding, layout, penalty, bitmap, ECC).
- `src/cli/*`: CLI layers separated by concern (parse, normalize, generate, present).
- `src/links.ts`: structured payload helpers for common QR data formats.
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

`/.github/workflows/ci.yml` runs:

1. `bun install --frozen-lockfile`
2. `bun run typecheck`
3. `bun test`
