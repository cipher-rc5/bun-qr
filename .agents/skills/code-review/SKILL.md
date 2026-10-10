---
name: code-review
description: Run a structured production-readiness review of the current codebase. Produces critical_analysis.md (scored findings) and improvements.md (prioritized checklist) in _dev/reviews/NNN/. Trigger on phrases like "code review", "production readiness review", "review the codebase", or "run a code review".
---

# Production Readiness Code Review

You are conducting a structured, critical technical review of this codebase. Your goal is to produce two output files: `critical_analysis.md` and `improvements.md`, saved to a versioned subdirectory under `_dev/reviews/`.

Work through each phase in order. Do not skip phases.

---

## Phase 0 — Independence and anti-anchoring rules (MANDATORY)

These rules prevent the most common failure mode of this skill: scoring a codebase against its own prior reviews rather than against absolute production-readiness standards.

**Do NOT read any prior review in `_dev/reviews/` before finishing Phase 3.** Specifically:

- Do not read `_dev/reviews/*/critical_analysis.md`.
- Do not read `_dev/reviews/*/improvements.md`.
- You may `ls _dev/reviews/` to determine the next version slot in Phase 6, but you must not open the contents.

**Why:** Prior reviews bias scoring. If review-002 listed three P0 blockers and review-003 sees them fixed, the natural reaction is "great progress, P0 → 0" and an inflated score. The correct framing is "this codebase, today, as a stranger would see it" — not "this codebase, plus the trajectory I remember." Treat every review as if it were the first.

**Do NOT mention "progress since the last review" anywhere in your findings.** If you catch yourself writing "the previous P0 has shipped" or "review-002's findings are resolved", delete those sentences. The reader of `critical_analysis.md` should not be able to infer whether prior reviews exist.

**Do NOT use sub-agents (Plan / Explore / general-purpose / Codex sub-agents) to summarise prior reviews.** They can read the codebase. They cannot read `_dev/reviews/`.

**Exception:** After Phase 3 is complete and scores are written down (in your own working notes), you may read prior reviews **only** to cross-check whether you missed findings they caught. Any finding you adopt from a prior review must be independently re-verified in Phase 2 evidence — never copy a finding without re-running its evidence command.

---

## Phase 1 — Load project context

Detect the language and stack first. Then read the conventional context files for that stack.

Run:

```bash
ls
find . -maxdepth 2 -name "Cargo.toml" -o -name "package.json" -o -name "pyproject.toml" -o -name "go.mod" -o -name "Gemfile" -o -name "build.gradle*" -o -name "pom.xml" 2>/dev/null | head
```

Then read these files if they exist (skip silently if missing):

**Universal:**

- `README.md`
- `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.windsurfrules` — agent / contributor rules
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`
- `.github/SECURITY.md`, `SECURITY.md`
- `CHANGELOG.md`
- `.editorconfig`
- `.github/workflows/*.yml` (all of them)

**Language-specific (read the one that applies):**

- Rust: `Cargo.toml`, `Cargo.lock` (just confirm presence), `rust-toolchain.toml`, `clippy.toml`, `rustfmt.toml`, `deny.toml`
- TypeScript/JavaScript: `package.json`, `tsconfig.json`, `eslintrc.*`, `prettierrc.*`, `biome.json`
- Python: `pyproject.toml`, `setup.cfg`, `mypy.ini`, `ruff.toml`, `.pre-commit-config.yaml`
- Go: `go.mod`, `.golangci.yml`
- Other: best-effort — read whatever is canonical for the stack.

**Then enumerate source and test files:**

- Rust: `find crates src -name "*.rs" 2>/dev/null` and read each.
- TypeScript: `find src lib tests test __tests__ -name "*.ts" -o -name "*.tsx" 2>/dev/null` and read each.
- Python: `find . -name "*.py" -not -path "*/.venv/*" -not -path "*/node_modules/*" 2>/dev/null` and read each.
- Adjust for the actual stack. If the codebase is large (>50 source files), batch reads into related groups, but **do read every source file**. Skipping files is the most common cause of missing findings.

If a file referenced by the review template (e.g. `docs/ARCHITECTURE.md`) is missing, note it but continue. Do not stub-write missing files.

---

## Phase 2 — Gather objective data

Run each command and capture the full output. **This output is evidence.** Every finding in `critical_analysis.md` must cite either a command-output excerpt or a `file:line` read. Findings without evidence get deleted in Phase 3.5.

### 2a. Build / test / lint gates

Run the canonical gates for the detected stack:

```bash
# Rust
cargo check --workspace 2>&1
cargo fmt --check 2>&1
cargo clippy --workspace --all-targets -- -D warnings 2>&1
cargo test --workspace 2>&1
RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps 2>&1
cargo audit --deny warnings 2>&1 || echo "[cargo-audit not installed]"

# TypeScript (bun is the only package manager)
bun install --frozen-lockfile 2>&1
bun run typecheck 2>&1
bun run lint 2>&1
bun run test 2>&1
bun audit 2>&1

# Python
ruff check . 2>&1
mypy . 2>&1 || pyright 2>&1
pytest 2>&1

# Go
gofmt -l . 2>&1
go vet ./... 2>&1
golangci-lint run 2>&1 || true
go test ./... 2>&1
```

Adjust for what the project actually uses (consult `package.json` scripts, `Cargo.toml`, etc.). Run **every** gate the project documents. Do not skip "audit" steps because they're slow — they catch real issues.

### 2b. Repository sanity scans (universal)

```bash
# TODO / FIXME / HACK / XXX markers
rg 'TODO|FIXME|HACK|XXX' --type-add 'src:*.{rs,ts,tsx,js,jsx,py,go,java,kt,swift}' -tsrc

# Suppressions / unsafe / disable comments
rg '#\[allow\(|@ts-ignore|@ts-expect-error|eslint-disable|noqa|nolint|unsafe ' --type-add 'src:*.{rs,ts,tsx,js,jsx,py,go}' -tsrc

# Panics in production paths (language-specific)
rg '\.unwrap\(\)|\.expect\(' --type rust         # Rust
rg 'throw new Error|process\.exit' --type ts     # TypeScript
rg 'raise \w|sys\.exit' --type py                # Python
rg 'panic\(|os\.Exit' --type go                  # Go

# Recently committed work
git log --oneline -20
git status
git branch --show-current
git remote -v

# CI workflow scope (note which branches CI runs on)
grep -rh 'branches:' .github/workflows/ 2>/dev/null
```

### 2c. Policy-rule verification (the step that catches drift)

**This is the most important step in Phase 2.** If the project has any rules files (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, in-repo style guides), extract every MUST / MUST NOT / SHALL / NEVER / ALWAYS clause and write a verification command for each one. Run those commands. Treat any violation as a Critical or High finding.

Examples of rules that produce verification commands:

| Rule from project doc                                      | Verification command                                                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| "Every Rust source file MUST begin with `// file:` header" | `for f in $(find crates src -name "*.rs" -path "*/src/*"); do head -1 "$f" \| grep -qF '// file:' \|\| echo "MISSING: $f"; done` |
| "Benchmarks MUST NOT start a tokio runtime"                | `rg 'tokio::runtime\|#\[tokio::main\]\|Runtime::new' crates/*/benches/ 2>/dev/null`                                              |
| "No `.unwrap()` outside tests and main"                    | `rg '\.unwrap\(\)' src/ \| rg -v 'tests\|main\.rs'`                                                                              |
| "All workspace.dependencies MUST use exact (=) versions"   | `grep -E 'version = "[^=]' Cargo.toml \| grep -v dev`                                                                            |
| "All public items MUST have doc comments"                  | `cargo doc -D warnings 2>&1`                                                                                                     |
| "No Box<dyn Error> in public API return types"             | `rg 'Box<dyn (std::)?error::Error' --type rust`                                                                                  |
| "branch protection requires CI on the active branch"       | Compare `git branch --show-current` to the `branches:` in CI workflows.                                                          |

For each verified violation, capture the exact file:line and the rule text. These become P0/P1 findings.

### 2d. Documentation drift check

Cross-reference the docs against reality:

- If `docs/architecture.md` (or equivalent) describes dependencies, compare against `Cargo.toml` / `package.json` / `go.mod`.
- If `docs/testing.md` counts tests or benchmarks, compare against `cargo test --list` / `pytest --collect-only` / actual file count.
- If `SECURITY.md` lists a contact URL, compare against `Cargo.toml`'s `repository =` / `package.json`'s `repository.url` / etc.
- If the README claims gates ("must pass clippy"), verify they're enforced in CI by reading the workflow files.

Every doc drift is a documentation finding — they accumulate fast and they damage OSS trust.

### 2e. Release / supply-chain check

If the repo has a release workflow:

- Does it generate checksums? (Look for `sha256sum`, `shasum`, `cargo-dist`.)
- Does it sign artefacts? (`cosign`, `gpg`, `sigstore`.)
- Does it produce an SBOM? (`syft`, `cargo-cyclonedx`, `cyclonedx-bom`.)
- Does it re-run the test/lint/audit gates before publishing?
- Does it verify the toolchain matches `rust-toolchain.toml` / `package.json`'s `engines` / `.python-version`?
- Are GitHub Actions pinned by major version (`@v4`) or by immutable SHA?

Record gaps. They matter more for OSS releases than for internal services.

Record **all** output from this phase. Do not summarise yet. Do not draw conclusions. You are still in evidence-collection mode.

---

## Phase 3 — Score each dimension

Score each of the ten dimensions below on a 1–10 scale using the rubric provided. **Base scores strictly on evidence from Phase 2 — not impressions, not progress, not trajectory.**

**Scoring rubric (STRICT — anti-generosity calibrated):**

- **1–3 Critical**: Actively broken or missing. Would cause failures, blocks adoption, or violates the project's own MUST rules in a way that crashes runtime / leaks data / silently corrupts.
- **4–5 High**: Significant gaps. Present but insufficient for production use. Verifiable policy violations, observable failure modes, or missing core functionality. _Default score for any dimension with a verified policy violation._
- **6–7 Medium**: Adequate. Works under normal conditions but has gaps a production codebase should not have. Multiple Low-severity items, or one Medium that is not yet a blocker.
- **8–9 Strong**: Minor gaps only. Requires: (a) zero verified MUST-rule violations, (b) zero High-severity items, (c) at most three Low-severity items. _If any one of these is false, you cannot score 8+._
- **10**: Publication-ready. No meaningful gaps. _Almost never warranted; reserve for truly exceptional dimensions._

**Anti-generosity calibration (apply BEFORE writing the score):**

1. "Gates pass" is not 9. Passing fmt/clippy/test means the floor is met — that's a 6, not a 9. The 9 requires gates pass _plus_ no policy violations _plus_ observable failure modes are handled _plus_ the dimension is genuinely close to publication-ready.
2. If a dimension contains a verified MUST-rule violation from project docs, cap the score at 5 regardless of other strengths.
3. If you find yourself rounding up because "the trend is positive" or "this is much better than before" — round down instead. You are not scoring trajectory; you are scoring state.
4. If you find yourself writing "minor nit" / "small thing" / "could be cleaner" — the issue is real. Score it as Low, not None.
5. Sanity check: if a hostile reviewer with no prior context read the codebase today, would they agree with your score? If not, drop one point.

**The ten dimensions:**

| #  | Dimension            | What to evaluate                                                                                                            |
| -- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1  | Safety & Correctness | Panic paths, invariant violations, unsafe blocks, logic errors, lossy data coercion                                         |
| 2  | Error Handling       | Result/Option propagation, error type quality, no silent discards, observable failure metrics                               |
| 3  | API Design           | Ergonomics, type safety, semver stability, pub surface area, non_exhaustive usage, foot-guns                                |
| 4  | Concurrency          | Atomic ordering, deadlock potential, cancellation safety, backpressure, shutdown ordering                                   |
| 5  | Testing              | Coverage breadth, integration vs unit balance, edge cases, property/fuzz tests, failure-path tests                          |
| 6  | Performance          | Algorithmic complexity, unnecessary allocation, benchmark presence + comparability, hot-path waste                          |
| 7  | Documentation        | Rustdoc completeness, examples, CHANGELOG accuracy, doc-vs-code drift, SECURITY contact correctness                         |
| 8  | CI/CD & Release      | Workflow correctness, **trigger scope vs active branch**, semver enforcement, release supply-chain (checksums/signing/SBOM) |
| 9  | Dependency Hygiene   | Minimal surface, audit clean, licensing, version pinning                                                                    |
| 10 | Conventions          | File headers, naming consistency, dead code, clippy compliance, no allow(warnings), **policy-rule adherence**               |

Composite score = arithmetic mean of all ten scores, rounded to one decimal.

---

## Phase 3.5 — Calibration check (MANDATORY)

Before writing `critical_analysis.md`, force-test your scores. If any check fails, revise.

**Check 1: Hostile-reviewer test.** Imagine an experienced reviewer who has never seen this codebase and was told "argue this is not production-ready." Can they cite three specific, verifiable things you missed? If yes, your score is too high — add them to findings and drop the relevant dimensions by 1.

**Check 2: Policy-violation audit.** For every MUST / SHALL / NEVER clause you extracted from project docs in Phase 2c, can you cite the verification command output that proves compliance or violation? If you cannot produce evidence either way, you have a gap — note it and lower the relevant score.

**Check 3: Generosity self-test.** Look at each dimension scored 8 or above. For each one, state in one sentence why it is _not_ a 7. If your answer is "trend" / "improvement" / "no major issues" — drop to 7. The 8+ band requires affirmative evidence of strength, not absence of weakness.

**Check 4: Independence test.** Re-read your draft narrative. Does it contain phrases like "fixed since", "shipped", "previous review", "now resolved", "progress"? If yes, those sentences are anchoring artefacts — delete them. The review should read as if no prior review existed.

**Check 5: Evidence test.** Every issue in your findings list must cite either: (a) a Phase 2 command output excerpt, or (b) a specific `file:line` you read. Issues without evidence get deleted before publishing. "I think" / "presumably" / "may" sentences should be replaced with verified facts or removed.

Only after all five checks pass do you proceed to Phase 4.

---

## Phase 4 — Write critical_analysis.md

Use exactly this template. Fill in every section. Do not omit sections — write "None identified." with one sentence explaining why no issues surfaced if a dimension is clean.

**Hard rules for writing:**

- No comparisons to prior state ("better than before", "shipped since"). The review is a snapshot.
- Every issue line must end with a severity tag: `[Critical|High|Medium|Low]`.
- Every issue must cite a verified `file:line` or Phase 2 command output. No vibes.
- "Top Blockers" lists issues that, if shipped as-is, would harm users / operators / contributors. If there are no blockers, say so explicitly and explain why — do not invent blockers to fill the section.
- Length target: enough to support the findings, not more. A dimension with two Low findings does not need three paragraphs.

**Determining the header metadata (Model / Provider / Thinking level):**

- **Model:** Use the model identity from your own system context. Include both the human-readable name and the exact model ID — e.g. "Opus 4.7 (claude-opus-4-7)", "Sonnet 4.6 (claude-sonnet-4-6)", "GPT-5.5 (gpt-5.5)". If the runtime exposes a `/model` command or env var, prefer that; otherwise use what the system prompt tells you.

- **Provider:** Identify which backend is actually serving the model. Check, in order:
  1. The host CLI / agent runtime — e.g. if this is running inside OpenCode, the provider is whatever OpenCode is routing through (check `opencode` config or `OPENCODE_PROVIDER`); if running inside Codex, check `model_provider` in `~/.codex/config.toml` (unset → "OpenAI").
  2. Env vars (run `env | grep -iE 'OPENROUTER|AZURE|OPENAI|GROQ|ANTHROPIC' 2>/dev/null`):
     - `OPENROUTER_API_KEY` set and in use → "OpenRouter"
     - `AZURE_OPENAI_*` set and in use → "Azure OpenAI"
     - `OPENAI_API_KEY` set with an OpenAI base URL → "OpenAI"
     - `GROQ_API_KEY` set and in use → "Groq"
     - `ANTHROPIC_API_KEY` (or no override) with a Claude model → "Anthropic API"
  3. If multiple keys exist, the provider is whichever one is actually wired to the current model — don't list every key, list the one in use.
  4. If you genuinely cannot determine it, write "unknown" — do not guess.

- **Thinking level:** Check, in order:
  1. `echo "$MAX_THINKING_TOKENS"` — if set, report the token budget (e.g. "high (16000 tokens)", "max (32000 tokens)").
  2. `grep -E '"(env|thinking|reasoning)"' ~/.claude/settings.json .claude/settings.json .claude/settings.local.json 2>/dev/null` for a thinking/reasoning config block.
  3. For OpenAI/GPT-family models, check for a `reasoning_effort` setting (low/medium/high) instead of a token budget — in Codex this is `model_reasoning_effort` in `~/.codex/config.toml` (`grep -E '^model_reasoning_effort' ~/.codex/config.toml 2>/dev/null`).
  4. If nothing is configured and you are not visibly using extended thinking/reasoning this session, write "none". If you cannot determine it confidently, write "unknown" — do not guess.

```markdown
# Critical Analysis

**Date:** {YYYY-MM-DD}
**Commit:** {git rev-parse --short HEAD}
**Branch observed:** {git branch --show-current}
**Reviewer:** {host agent — e.g. Claude Code, Codex CLI, OpenCode} (automated)
**Model:** {model display name and ID — e.g. "Opus 4.7 (claude-opus-4-7)"}
**Provider:** {Anthropic API | AWS Bedrock | Google Vertex AI | OpenAI | Azure OpenAI | OpenRouter | ...}
**Thinking level:** {none | low | medium | high | max — or "unknown" if not exposed}

---

## Composite Score: {X.X} / 10

| Dimension               | Score  | Severity                        |
| ----------------------- | ------ | ------------------------------- |
| 1. Safety & Correctness | {n}/10 | {Critical/High/Medium/Low/None} |
| 2. Error Handling       | {n}/10 | {Critical/High/Medium/Low/None} |
| 3. API Design           | {n}/10 | {Critical/High/Medium/Low/None} |
| 4. Concurrency          | {n}/10 | {Critical/High/Medium/Low/None} |
| 5. Testing              | {n}/10 | {Critical/High/Medium/Low/None} |
| 6. Performance          | {n}/10 | {Critical/High/Medium/Low/None} |
| 7. Documentation        | {n}/10 | {Critical/High/Medium/Low/None} |
| 8. CI/CD & Release      | {n}/10 | {Critical/High/Medium/Low/None} |
| 9. Dependency Hygiene   | {n}/10 | {Critical/High/Medium/Low/None} |
| 10. Conventions         | {n}/10 | {Critical/High/Medium/Low/None} |

Severity column: **Critical** = score 1-3, **High** = 4-5, **Medium** = 6-7, **Low** = 8-9, **None** = 10.

---

## Top Blockers

List the findings most likely to prevent production adoption, ordered by impact. One sentence each, with file:line citation where applicable. If there are zero blockers, say so explicitly:

> No production blockers identified. The highest-priority items are listed under "P1" in `improvements.md`.

If there are blockers:

1. {blocker — concrete, with evidence citation}
2. {blocker}
3. {blocker}
4. ...

---

## Dimension Findings

### 1. Safety & Correctness — {n}/10

{Narrative — what you verified, what you found, what is risky. Cite specific file:line for each issue.}

**Issues:**

- `{file}:{line}` — {description} [{Critical|High|Medium|Low}]

---

{Repeat for dimensions 2-10 in the same shape.}

---

## Verified Policy-Rule Compliance

For each MUST / SHALL / NEVER rule extracted from project docs in Phase 2c, state compliance status with evidence. This section is what prevents "we have great rules" from substituting for "we follow our rules."

| Rule (source:line)          | Status                        | Evidence                      |
| --------------------------- | ----------------------------- | ----------------------------- |
| {rule} ({AGENTS.md}:{line}) | {Met / Violated / Untestable} | {command output or file:line} |

If there are no project-specific rules files, write "No project-specific rules files found." here.

---

## Validation Command Output

Paste raw output of every gate command run in Phase 2a verbatim. Trim only to the last 50 lines per command if output is enormous.

\`\`\`
{outputs}
\`\`\`
```

---

## Phase 5 — Write improvements.md

Use exactly this template. Every issue from `critical_analysis.md` must appear here, grouped by priority tier.

**Priority definitions (anti-generosity calibrated):**

- **P0 — Blockers**: Must fix before any production / OSS release. Includes: verified MUST-rule violations, broken security paths (e.g. wrong vulnerability-reporting URL), CI not running on the active branch, panic-on-input bugs, data-loss bugs.
- **P1 — Pre-release**: Must fix before tagging 1.0 or open-sourcing. Includes: missing release supply-chain (checksums at minimum), observability gaps in production-relevant failure modes, missing tests for documented failure modes, API foot-guns that will produce bug reports.
- **P2 — Should-fix**: Important quality improvements within one release cycle. Includes: performance hot-path waste, doc gaps, lint suppressions that have outlived their purpose.
- **P3 — Nice-to-have**: Polish, ergonomics, optimization opportunities, additional benchmarks, fuzz harnesses.

**Effort labels:** `S` = under 1 hour, `M` = 1–4 hours, `L` = 4+ hours.

```markdown
# Improvements Checklist

**Generated from review:** _dev/reviews/{NNN}/critical_analysis.md
**Date:** {YYYY-MM-DD}

---

## P0 — Blockers

- [ ] **[Safety]** {one-line description} — `{file}:{line}` — Effort: {S|M|L}
- [ ] **[CI/CD]** {one-line description} — `{file}:{line}` — Effort: {S|M|L}

If P0 is empty, write "None identified." under the heading.

## P1 — Pre-release

- [ ] **[Testing]** {one-line description} — Effort: {S|M|L}

## P2 — Should-fix

- [ ] **[Docs]** {one-line description} — Effort: {S|M|L}

## P3 — Nice-to-have

- [ ] **[Performance]** {one-line description} — Effort: {S|M|L}

---

## Progress

**Total items:** {n}
**P0:** {n} | **P1:** {n} | **P2:** {n} | **P3:** {n}
```

---

## Phase 6 — Determine output directory

Run this to find the next version slot:

```bash
ls _dev/reviews/ 2>/dev/null | grep -E '^[0-9]+$' | sort -n | tail -1
```

If the directory is empty or no numeric subdirectories exist, use `001`.
Otherwise, take the highest number, add 1, and zero-pad to three digits.

**You may `ls` the directory but you must NOT read prior review contents at any point.**

Create the directory: `mkdir -p _dev/reviews/{NNN}/`

Write both files:

- `_dev/reviews/{NNN}/critical_analysis.md`
- `_dev/reviews/{NNN}/improvements.md`

---

## Phase 7 — Optional cross-check (after writing)

If prior reviews exist in `_dev/reviews/`, you may now read them — **only** to check whether they caught findings you missed.

For each finding in a prior review you did not capture:

1. Re-verify the underlying evidence today (run the verification command, read the file).
2. If still valid, add it to your `critical_analysis.md` and `improvements.md`.
3. If no longer valid, do not mention it — the absence of a stale finding is not noteworthy.

**Do not adjust scores upward based on prior reviews.** Adjust downward only if cross-check reveals real findings you missed.

If the cross-check produces additions, update the file with a single line at the top of `critical_analysis.md`:

> _Cross-check pass: N findings adopted from prior reviews after independent re-verification._

---

## Phase 8 — Report to user

Output a short summary in this exact format:

```
Review complete — _dev/reviews/{NNN}/

Composite score: {X.X}/10

Top blockers:
1. {blocker}
2. {blocker}
3. {blocker}

P0: {n} | P1: {n} | P2: {n} | P3: {n} items — see improvements.md
```

If there are no blockers, replace the "Top blockers" section with "No production blockers identified."

Do not output the full file contents to the terminal. Direct the user to open the files.

---

## Common failure modes to avoid

These are the failure modes prior runs of this skill have exhibited. Watch for them in yourself.

1. **Anchoring on prior reviews.** Scoring "much improved" instead of "current state." Counter: Phase 0 forbids reading priors until Phase 7.
2. **Generosity on gates-pass.** Awarding 9/10 because clippy is clean. Counter: Phase 3 rubric requires affirmative strength evidence, not absence of warnings.
3. **Missing policy violations.** Reading AGENTS.md but not verifying compliance. Counter: Phase 2c forces an explicit per-rule verification step.
4. **Vibes-based findings.** "Could be cleaner" / "minor nit" without file:line. Counter: Phase 3.5 Check 5 deletes evidence-less findings.
5. **Doc-vs-code blind spots.** Trusting docs at face value. Counter: Phase 2d explicitly cross-references docs to code.
6. **Branch-protection blind spot.** Assuming CI runs without verifying the workflow triggers match the active branch. Counter: Phase 2c includes the `branches:` vs `git branch --show-current` check.
7. **Skipping the audit step because it's slow.** Counter: Phase 2a treats audit as mandatory; record output even if it took 30s.
8. **Inventing blockers to fill the "Top 3" section.** Counter: Phase 4 explicitly permits a "no blockers" state with explanation.
