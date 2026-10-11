# Contributing to bun-qr

Thanks for your interest in contributing. This document describes how the project is actually built and
tested — nothing here is aspirational.

## Prerequisites

- **Linux or macOS** — Windows is currently unsupported and is excluded from CI.
- **[Bun](https://bun.com)** — this project uses Bun as both the runtime and the package manager. Never use
  `npm`, `yarn`, or `pnpm`; the lockfile is `bun.lock`.
- **[just](https://github.com/casey/just)** (optional) — a command runner. Every recipe in the `justfile` is a
  thin wrapper over a `bun` command, so you can always run the underlying command directly instead.

The Bun version is pinned in `.bun-version` (currently `1.4.2`). `package.json` declares `engines.bun: ">=1.4.2"`.
CI tests the supported minimum and the pinned version; these currently share one matrix entry. `bun run verify:toolchain`
checks the executing runtime, manifest, development pin, workflow pins and matrix together. If you use a version manager that reads
`.bun-version`, it will pick up the right version automatically.

Node.js is not required for application code, tests or development tools. `bunfig.toml` sets `[run] bun = true`,
and package executables use `bunx --bun` to prevent a Node.js shebang from selecting another runtime.
Use the package scripts or `just` recipes so this policy applies consistently.
`[install] ignoreScripts = true` prevents dependency lifecycle hooks from invoking Node.js during installation.
Precompiled tool binaries are initialized by their wrappers when explicitly run under Bun.

Utility scripts and the benchmark runner use Bun APIs and Bun Shell, without Node imports or globals.
CLI internals and test fixtures still use Bun's compatibility APIs for operations such as atomic exclusive
file creation that `Bun.write()` does not expose.
See [Bun's filesystem documentation](https://bun.com/docs/runtime/file-io).
GitHub manages the runtimes of third-party Actions; project-authored JavaScript and TypeScript execute with Bun.

## Getting started

```sh
git clone https://github.com/cipher-rc5/bun-qr.git
cd bun-qr
bun install --frozen-lockfile
```

Use `--frozen-lockfile` so an unrelated lockfile change does not sneak into your diff. CI installs the same way,
so a lockfile that does not match `package.json` fails the build.

## The checks

`just ci` runs the local validation gates that CI enforces:

```sh
just ci   # toolchain -> audit -> fmt-check -> lint -> typecheck -> build -> package check -> coverage
```

Run it before opening a pull request. The individual steps:

| Task             | `just`                  | Direct command                                 |
| ---------------- | ----------------------- | ---------------------------------------------- |
| Toolchain pins   | `just verify-toolchain` | `bun run verify:toolchain`                     |
| Dependency audit | `just audit`            | `bun audit --audit-level=high`                 |
| Format check     | `just fmt-check`        | `bunx --bun dprint check`                      |
| Apply formatting | `just fmt`              | `bunx --bun dprint fmt`                        |
| Lint check       | `just lint`             | `bun run lint`                                 |
| Safe lint fixes  | `just lint-fix`         | `bun run lint:fix`                             |
| Typecheck        | `just typecheck`        | `bunx --bun tsc --noEmit`                      |
| Build (types)    | `just build`            | `bunx --bun tsc --project tsconfig.build.json` |
| Test             | `just test`             | `bun test`                                     |
| Coverage         | `just coverage`         | `bun run coverage`                             |
| Benchmarks       | `just bench`            | `bun run tests/benchmark.ts`                   |
| Verify packaging | `just verify-package`   | `bun run build && bun run verify:package`      |
| Clean artifacts  | `just clean`            | `rm -rf types dist coverage`                   |

Running `just` with no arguments runs `typecheck` and `test`.
GitHub prints coverage in the test logs and uploads benchmark and LCOV coverage artifacts. `bun run coverage`
generates `coverage/lcov.info`; CI verifies a nonempty report and rejects missing uploads. Release jobs check the tag/version match,
generate checksums and an SBOM, attest the tarball, then publish those same verified bytes.

## Formatting

Formatting is handled by **[dprint](https://dprint.dev)**, configured in `dprint.json`. It covers TypeScript,
JSON, Markdown, TOML, and YAML.
The CLI is an exact-pinned development dependency. Its plugins are pinned `npm:` references in `dprint.json`;
these identify registry packages and do not require the npm CLI. Installation does not format or modify source; run formatting explicitly.
The JSON plugin also sorts `package.json` keys, so plugin upgrades can produce formatting-only manifest changes.

Do not hand-format code or argue with the formatter — run `just fmt` (`bunx --bun dprint fmt`) and commit the result.
CI runs `bunx --bun dprint check` and fails on any difference. `.editorconfig` mirrors `dprint.json` so your editor
agrees with the formatter; if the two ever disagree, `dprint.json` is the source of truth.

## Linting

Linting is handled by **[Biome](https://biomejs.dev)**, configured in `biome.json`, with its recommended rules.
It checks source code, tests, examples, and scripts, and respects `.gitignore` to skip generated artifacts.
Biome's formatter and assist actions are disabled; dprint handles formatting and import ordering.
Tests allow non-null assertions for known fixture and array entries under strict TypeScript indexing.
Utility scripts and the benchmark runner additionally reject Node imports and globals.

Run `just lint` (`bun run lint`) to check for problems. Warnings fail the check in local runs, CI, and the
publish hook. Run `just lint-fix` (`bun run lint:fix`) to apply safe fixes, then `just fmt` and `just lint`.

## Tests

Tests use Bun's built-in test runner (`bun test`) and live in `tests/`.

```sh
bun test                          # everything
bun test tests/links.test.ts      # a single file
bun test --coverage               # console coverage summary
bun test --coverage --coverage-reporter=lcov  # coverage/lcov.info
bun run coverage                  # console summary and coverage/lcov.info, matching CI
```

Please add tests for any behavior change. This is an encoding library, so the most valuable tests pin down exact
output for a given input — a QR matrix that silently changes shape is a breaking change for anyone scanning it.

## Build

`bun run build` is a **declaration-only** emit. Bun runs the TypeScript in `src/` directly, so the build produces
type declarations in `types/` for editors and `tsc` consumers — it does not produce JavaScript. `types/` is a
build artifact and should not be committed.

## Verifying the package

`just verify-package` builds declarations, packs the tarball, and checks types, imports and shipped documentation links from a clean Bun consumer,
catching broken `exports` maps and missing files. CI runs the same script on every OS; releases run it against the
exact tarball that will be attested and published. Use `bun run verify:package path/to/package.tgz` to check an existing archive.
Run it locally if you touch
`package.json`'s `exports`, `files`, or entry points.
The direct verification script requires declarations to have been built first and uses an offline temporary consumer.
It runs the same Bun executable as its parent, skips install scripts, and removes its temporary directory on completion or failure.

## Pull requests

1. Branch off `main`.
2. Make your change, with tests.
3. Run `just ci` and make sure it passes.
4. Open a pull request describing what changed and why.

CI runs on every pull request across Ubuntu and macOS at the supported minimum and development pin. All of it must
be green before merge.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`,
`chore:`, `ci:`, `refactor:`, `test:`, `perf:`. Keep the subject line in the imperative mood.

## Dependencies

**bun-qr has zero runtime dependencies, and that is a deliberate design constraint.** Please do not add one. If
you believe a change genuinely requires a runtime dependency, open an issue first so it can be discussed before
you write the code.

Development dependencies and formatter plugin references are exact-pinned, and GitHub Actions are pinned to immutable commit SHAs. Dependabot
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
