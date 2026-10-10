# bun-qr File Tree

<!--
  This fence is intentionally ```text, not ```md. dprint's markdown formatter reflows
  the contents of a ```md fence, which mangles the ASCII tree (joining `|`- prefixed
  lines onto the previous line). Keep it as `text` and re-run `bunx --bun dprint fmt` after
  editing to confirm it survives intact.
-->

```text
bun-qr/
|
|- Configuration
|  |- package.json           Bun scripts, bin, exports, license
|  |- tsconfig.json          Strict TypeScript settings
|  |- tsconfig.build.json    Declaration-only build config
|  |- biome.json             Biome lint configuration
|  |- bunfig.toml            Force Bun for script and dependency execution
|  |- dprint.json            Formatter configuration
|  |- justfile               Local validation/task recipes
|  |- .bun-version           Pinned Bun version
|  `- bun.lock               Bun lockfile
|
|- Licensing
|  |- LICENSE                Apache-2.0 (verbatim from upstream)
|  `- LICENSE-MIT            MIT (verbatim from upstream)
|
|- CI (.github/workflows/)
|  |- ci.yml                 Toolchain, audit, format, lint, types, package check, coverage, benchmark
|  `- release.yml            Tag-triggered npm publish + GitHub Release
|
|- Documentation
|  |- README.md
|  |- SECURITY.md
|  |- docs/CHANGELOG.md
|  |- docs/summary.md
|  |- docs/structure.md
|  |- docs/tree.md
|  `- docs/LINK_ENCODING.md
|
|- Source (src/)
|  |- index.ts               Public encoder API facade
|  |- links.ts               Link and structured payload helpers
|  |- decode.ts              Decoder scaffold (throws; not implemented)
|  |- dom.ts                 Browser utilities scaffold (pending)
|  |- cli.ts                 Bun CLI entrypoint
|  |- runtime.ts             Shared Bun runtime requirement
|  |
|  |- core/
|  |  |- bitmap.ts           Bitmap model + output renderers
|  |  |- layout.ts           Template drawing + zigzag placement
|  |  |- encoder.ts          Payload encoding pipeline
|  |  |- error-correction.ts GF math + Reed-Solomon + interleave
|  |  |- penalty.ts          Mask scoring
|  |  |- url.ts              Shared URL scheme policy
|  |  |- tables.ts           Capacity + ECC lookup tables
|  |  `- utils.ts            Shared helpers
|  |
|  `- cli/
|     |- app.ts              Orchestration + exit codes
|     |- args-parser.ts      Flag parsing + help text
|     |- qr-generator.ts     Encoder adapter
|     |- terminal-presenter.ts  stdout/stderr + TTY colorization
|     |- types.ts            CLI type contracts
|     `- url-normalizer.ts   Scheme normalization
|
|- Tests (tests/)
|  |- interop.test.ts
|  |- api.types.ts
|  |- cli.io.test.ts
|  |- links.regressions.test.ts
|  |- toolchain.test.ts
|  |- runtime.test.ts        Bun enforcement and dependency execution
|  |- index.test.ts          Fixture-backed regression tests
|  |- roundtrip.test.ts      ISO/IEC 18004 structural verification
|  |- links.test.ts          Link encoding helpers
|  |- cli.args.test.ts       CLI argument parser tests
|  |- cli.app.test.ts        CLI orchestration tests
|  |- benchmark.ts           Runtime benchmark suite
|  |- scripts.test.ts        Bun-native script filesystem safety
|  |
|  |- core/
|  |  |- bitmap.test.ts      Renderers, geometry, pixel guard
|  |  |- encoder.test.ts     Mode detection + bit packing
|  |  |- error-correction.test.ts
|  |  |- layout.test.ts
|  |  `- penalty.test.ts
|  |
|  `- fixtures/
|     |- qr-fixtures.json
|     |- link-fixtures.json
|     `- benchmark-fixtures.json
|
|- Scripts (scripts/)
|  |- bun-utils.ts           Bun file paths and private temporary directories
|  |- sbom.ts                CycloneDX build/dependency inventory
|  |- verify-package.ts      Packed exports and consumer declarations
|  `- verify-toolchain.ts    Engine, runtime, matrix and pins
|
`- Examples (examples/)
   |- basic.ts
   |- links.ts
   `- output/               Generated sample QR files
```

## Common commands

- Install: `bun install`
- Typecheck: `bun run typecheck`
- Test: `bun test`
- Coverage: `bun test --coverage`
- Format: `bunx --bun dprint fmt`
- Bench: `bun run bench`
- CLI: `bun run qr -- https://bun.com --format svg --output bun.svg`
