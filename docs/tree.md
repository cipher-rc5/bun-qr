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
|  |- .editorconfig          Editor formatting defaults
|  |- .gitignore             Generated artifacts and local files
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
|  |- CONTRIBUTING.md
|  |- CODE_OF_CONDUCT.md
|  |- docs/CHANGELOG.md
|  |- docs/summary.md
|  |- docs/structure.md
|  |- docs/tree.md
|  |- docs/RELEASE_VERIFICATION.md
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
|  |  |- penalty.test.ts
|  |  `- utils.test.ts
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
|- Contributor workflows (.agents/skills/)
|  |- agent-browser/
|  |- code-review/
|  |- git-c-all/
|  `- security-audit/
|
|- GitHub templates (.github/)
|  |- PULL_REQUEST_TEMPLATE.md
|  `- ISSUE_TEMPLATE/
|
`- Examples (examples/)
   |- basic.ts
   |- links.ts
   `- output/               Generated sample QR files
```

## Common commands

- Install: `bun install --frozen-lockfile`
- Toolchain: `bun run verify:toolchain`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- Test: `bun test`
- Coverage: `bun test --coverage`
- Format: `bunx --bun dprint fmt`
- Build declarations: `bun run build`
- Verify package: `bun run build && bun run verify:package`
- Bench: `bun run bench`
- CLI: `bun run qr -- https://bun.com --format svg --output bun.svg`

Generated declarations (`types/`), package archives (`dist-artifacts/`), and file coverage reports (`coverage/`)
are ignored artifacts. `bun test --coverage` prints text; add `--coverage-reporter=lcov` to produce `coverage/lcov.info`.
`src/decode.ts` and `src/dom.ts` remain in the repository but are excluded from published package files.
