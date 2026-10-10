---
name: git-c-all
description: Stage all changes, generate a conventional commit message, commit, and push to the current remote branch. Follows Conventional Commits spec (feat, fix, chore, refactor, docs, style, test, perf, ci, build). Never includes AI tooling attribution in the message. Trigger on phrases like "commit everything", "commit and push all", "push all changes", "commit push all".
---

# git-c-all

Stage all changes, craft a conventional commit message, commit, and push to the current branch.

## Steps

1. **Inspect state** — run these in parallel:
   - `git status` to see what's changed (never use `-uall`)
   - `git diff HEAD` to read the full diff
   - `git log --oneline -10` to learn the project's commit style

2. **Stage everything** — `git add -A`

3. **Draft the commit message** following [Conventional Commits](https://www.conventionalcommits.org/):
   - Format: `<type>(<optional scope>): <short imperative summary>`
   - Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `style`, `test`, `perf`, `ci`, `build`
   - Keep the subject line ≤ 72 characters
   - Add a body paragraph only if the change is non-obvious or spans multiple concerns
   - **Never** include any mention of Claude, Anthropic, AI assistants, automated tooling, or co-authorship attribution of any kind
   - Focus entirely on _what changed_ and _why_, written as if a human engineer authored the commit

4. **Commit** using a HEREDOC to preserve formatting:
   ```bash
   git commit -m "$(cat <<'EOF'
   <type>(<scope>): <summary>

   <optional body>
   EOF
   )"
   ```

5. **Push** the current branch, naming both ends of the refspec (`<branch>` from
   `git branch --show-current`):
   ```bash
   git push origin HEAD:<branch>
   ```
   Never a bare `git push`: it resolves its target from `push.default` and has landed a push on the
   wrong branch here before (README, "Pushing"). If no upstream is set, add `-u`.

6. **Confirm** — show the result of `git log --oneline -1` and the push output so the user can verify.

## Constraints

- Do not skip pre-commit hooks (`--no-verify` is forbidden unless the user explicitly requests it)
- Do not force-push unless the user explicitly requests it
- If the diff is empty (nothing to commit), report that clearly and stop
- If push fails (e.g., rejected due to diverged history), report the error and ask the user how to proceed — do not rebase or reset automatically
