# bun-qr Project Structure

## Top-level layout

```text
bun-qr/
|- .agents/skills/          Contributor workflow skills
|- .github/
|  |- ISSUE_TEMPLATE/
|  |- PULL_REQUEST_TEMPLATE.md
|  `- workflows/
|     |- ci.yml
|     `- release.yml
|- docs/
|  |- CHANGELOG.md
|  |- LINK_ENCODING.md
|  |- RELEASE_VERIFICATION.md
|  |- structure.md
|  |- summary.md
|  `- tree.md
|- examples/
|  |- basic.ts
|  |- links.ts
|  `- output/
|- scripts/
|  |- bun-utils.ts
|  |- sbom.ts
|  |- verify-package.ts
|  `- verify-toolchain.ts
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
|  |  |- url.ts
|  |  |- tables.ts
|  |  `- utils.ts
|  |- cli.ts
|  |- decode.ts
|  |- dom.ts
|  |- index.ts
|  |- links.ts
|  `- runtime.ts
|- tests/
|  |- core/
|  |  |- bitmap.test.ts
|  |  |- encoder.test.ts
|  |  |- error-correction.test.ts
|  |  |- layout.test.ts
|  |  |- penalty.test.ts
|  |  `- utils.test.ts
|  |- fixtures/
|  |  |- benchmark-fixtures.json
|  |  |- link-fixtures.json
|  |  `- qr-fixtures.json
|  |- benchmark.ts
|  |- cli.app.test.ts
|  |- cli.args.test.ts
|  |- interop.test.ts
|  |- api.types.ts
|  |- cli.io.test.ts
|  |- links.regressions.test.ts
|  |- toolchain.test.ts
|  |- runtime.test.ts
|  |- scripts.test.ts
|  |- index.test.ts
|  |- links.test.ts
|  `- roundtrip.test.ts
|- LICENSE
|- LICENSE-MIT
|- CODE_OF_CONDUCT.md
|- CONTRIBUTING.md
|- README.md
|- SECURITY.md
|- .bun-version
|- .editorconfig
|- .gitignore
|- biome.json
|- bunfig.toml
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
- `src/runtime.ts`: Bun presence check used by both public entry points.
- `src/decode.ts` and `src/dom.ts`: repository-only scaffolds, excluded from package files and public exports.
- `tests/core/*`: white-box unit tests for the individual core modules.
- `tests/roundtrip.test.ts`: ISO/IEC 18004 structural verification independent of encoder internals.
- `tests/interop.test.ts`: independent QR payload/GIF pixel decoding with development-only decoders.
- `tests/cli.io.test.ts`: exclusive filesystem writes, concrete presenter and executable CLI integration.
- `scripts/*`: Bun-native filesystem helpers, toolchain checks, clean-consumer package verification and SBOM generation.
- `tests/fixtures/*`: deterministic fixture data for regression tests.

## Engineering conventions

- Runtime/tooling/package manager: Bun
- `bunfig.toml` and `bunx --bun` force JavaScript dependency wrappers to use Bun; public entry points reject a missing Bun runtime. Filesystem compatibility APIs are provided by Bun itself.
- Utility scripts and benchmarks use Bun APIs/Bun Shell without Node imports/globals. CLI internals and some test fixtures use Bun compatibility APIs; third-party Actions use GitHub-managed runtimes.
- Biome linting and dprint formatting run separately. dprint plugins are exact-pinned `npm:` references in `dprint.json`.
- API style: snake_case for core QR API compatibility style
- Type system: strict TypeScript with no implicit unsafety
- Validation strategy:
  - typecheck via `bun run typecheck`
  - formatting via `bun run fmt:check` and linting via `bun run lint`
  - tests via `bun test`
  - benchmarks via `bun run bench`

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests.

The prerequisite `version-pin` job checks the executing runtime, engine minimum, development and workflow pins, and test matrix. The `test` job installs with the frozen lockfile, audits dependencies, checks dprint and Biome, typechecks and builds declarations, verifies packed consumer imports and types, then prints coverage. Its upload step targets `coverage/`, but no file reporter is configured, so the current command produces no coverage artifact.

The `benchmark` job runs only on `main`, uploading the measurement output. Releases re-run the validation gates, verify the tag/version match and exact package archive, generate checksums and an SBOM, attest the tarball with GitHub/Sigstore and publish that same archive. See [release verification](RELEASE_VERIFICATION.md).
