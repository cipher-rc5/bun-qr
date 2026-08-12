# Contributing to bun-qr

Thanks for your interest in contributing. This document describes how the project is actually built and
tested — nothing here is aspirational.

## Prerequisites

- **[Bun](https://bun.com)** — this project uses Bun as both the runtime and the package manager. Never use
  `npm`, `yarn`, or `pnpm`; the lockfile is `bun.lock`.
- **[just](https://github.com/casey/just)** (optional) — a command runner. Every recipe in the `justfile` is a
  thin wrapper over a `bun` command, so you can always run the underlying command directly instead.

The Bun version is pinned in `.bun-version` (currently `1.3.14`). `package.json` declares `engines.bun: ">=1.3.0"`,
and CI tests against both the floor of that range and the pinned version. If you use a version manager that reads
`.bun-version`, it will pick up the right version automatically.

## Getting started

```sh
git clone https://github.com/cipher-rc5/bun-qr.git
cd bun-qr
bun install --frozen-lockfile
```

Use `--frozen-lockfile` so an unrelated lockfile change does not sneak into your diff. CI installs the same way,
so a lockfile that does not match `package.json` fails the build.

## The checks

`just ci` runs exactly what CI enforces, in the same order:

```sh
just ci   # fmt-check -> typecheck -> build -> test
```

Run it before opening a pull request. The individual steps:

| Task             | `just`                | Direct command                           |
| ---------------- | --------------------- | ---------------------------------------- |
| Format check     | `just fmt-check`      | `bunx dprint check`                      |
| Apply formatting | `just fmt`            | `bunx dprint fmt`                        |
| Typecheck        | `just typecheck`      | `bunx tsc --noEmit`                      |
| Build (types)    | `just build`          | `bunx tsc --project tsconfig.build.json` |
| Test             | `just test`           | `bun test`                               |
| Coverage         | `just coverage`       | `bun test --coverage`                    |
| Benchmarks       | `just bench`          | `bun run tests/benchmark.ts`             |
| Verify packaging | `just verify-package` | —                                        |
| Clean artifacts  | `just clean`          | `rm -rf types dist coverage`             |

Running `just` with no arguments runs `typecheck` and `test`.

## Formatting

Formatting is handled by **[dprint](https://dprint.dev)**, configured in `dprint.json`. It covers TypeScript,
JSON, Markdown, TOML, and YAML.

Do not hand-format code or argue with the formatter — run `just fmt` (`bunx dprint fmt`) and commit the result.
CI runs `bunx dprint check` and fails on any difference. `.editorconfig` mirrors `dprint.json` so your editor
agrees with the formatter; if the two ever disagree, `dprint.json` is the source of truth.

## Tests

Tests use Bun's built-in test runner (`bun test`) and live in `tests/`.

```sh
bun test                          # everything
bun test tests/links.test.ts      # a single file
bun test --coverage               # with a coverage report
```

Please add tests for any behavior change. This is an encoding library, so the most valuable tests pin down exact
output for a given input — a QR matrix that silently changes shape is a breaking change for anyone scanning it.

## Build

`bun run build` is a **declaration-only** emit. Bun runs the TypeScript in `src/` directly, so the build produces
type declarations in `types/` for editors and `tsc` consumers — it does not produce JavaScript. `types/` is a
build artifact and should not be committed.

## Verifying the package

`just verify-package` packs the tarball and imports it from a clean Bun consumer, catching broken `exports` maps
and files missing from the `files` allowlist. CI runs the same check on every OS. Run it locally if you touch
`package.json`'s `exports`, `files`, or entry points.

## Pull requests

1. Branch off `main`.
2. Make your change, with tests.
3. Run `just ci` and make sure it passes.
4. Open a pull request describing what changed and why.

CI runs on every pull request across Ubuntu, macOS, and Windows on both supported Bun versions. All of it must
be green before merge.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`,
`chore:`, `ci:`, `refactor:`, `test:`, `perf:`. Keep the subject line in the imperative mood.

## Dependencies

**bun-qr has zero runtime dependencies, and that is a deliberate design constraint.** Please do not add one. If
you believe a change genuinely requires a runtime dependency, open an issue first so it can be discussed before
you write the code.

Development dependencies are exact-pinned, and GitHub Actions are pinned to immutable commit SHAs. Dependabot
proposes upgrades weekly; please keep new pins exact and, for actions, keep the SHA plus its `# v4`-style version
comment.

## Reporting bugs and requesting features

Open an issue using the appropriate template. For bug reports, the single most useful thing you can include is
the exact input that reproduces the problem, along with your Bun version and OS.

## Security

Please **do not** report security vulnerabilities through public issues. See [SECURITY.md](SECURITY.md) for the
disclosure process.

## License

By contributing, you agree that your contributions are licensed under the project's dual
[MIT](LICENSE-MIT) OR [Apache-2.0](LICENSE) license, matching `package.json`'s `"license": "(MIT OR Apache-2.0)"`.
