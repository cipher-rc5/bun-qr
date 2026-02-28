```md
bun-qr/
|
|- Configuration
|  |- package.json         Bun scripts, bin, exports
|  |- tsconfig.json        Strict TypeScript settings
|  `- bun.lock             Bun lockfile
|
|- CI
|  `- .github/workflows/ci.yml
|
|- Documentation
|  |- docs/CHANGELOG.md
|  |- docs/summary.md
|  |- docs/structure.md
|  `- docs/tree.md
|
|- Source (src/)
|  |- index.ts             Public encoder API facade
|  |- links.ts             Link and structured payload helpers
|  |- decode.ts            Decoder scaffold (pending)
|  |- dom.ts               Browser utilities scaffold (pending)
|  |- cli.ts               Bun CLI entrypoint
|  |
|  |- core/
|  |  |- bitmap.ts         Bitmap model + output renderers
|  |  |- layout.ts         Template drawing + zigzag placement
|  |  |- encoder.ts        Payload encoding pipeline
|  |  |- error-correction.ts GF math + Reed-Solomon + interleave
|  |  `- penalty.ts        Mask scoring
|  |
|  `- cli/
|     |- app.ts
|     |- args-parser.ts
|     |- qr-generator.ts
|     |- terminal-presenter.ts
|     |- types.ts
|     `- url-normalizer.ts
|
|- Tests (tests/)
|  |- index.test.ts        Fixture-backed regression tests
|  |- cli.args.test.ts     CLI argument parser tests
|  |- cli.app.test.ts      CLI orchestration tests
|  |- benchmark.ts         Runtime benchmark suite
|  `- fixtures/
|     |- qr-fixtures.json
|     |- link-fixtures.json
|     `- benchmark-fixtures.json
|
`- Examples
   |- examples/basic.ts
   |- examples/links.ts
   `- examples/output/

Common commands

- Install: `bun install`
- Typecheck: `bun run typecheck`
- Test: `bun test`
- Bench: `bun run bench`
- CLI: `bun run qr -- https://bun.com --format svg --output bun.svg`
