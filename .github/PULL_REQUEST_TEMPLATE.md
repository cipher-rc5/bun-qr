# Description

<!-- What does this change, and why? Link any related issue with "Closes #123". -->

## Type of change

<!-- Delete the ones that do not apply. -->

- feat — new functionality
- fix — bug fix
- docs — documentation only
- refactor — no behavior change
- perf — performance
- test — tests only
- ci / chore — tooling and maintenance

## Checklist

- [ ] `just ci` passes locally (`fmt-check`, `typecheck`, `build`, `test`)
- [ ] Formatting applied with `just fmt` (`bunx dprint fmt`)
- [ ] Tests added or updated for the behavior change
- [ ] No new runtime dependency (this project is deliberately zero-dependency)
- [ ] `just verify-package` passes, if `exports`, `files`, or entry points changed

## Encoding output

<!--
Delete this section if the change cannot affect encoded output.

This is an encoding library: a QR matrix that changes shape is a breaking change for
anyone scanning it. If output changed for any input, say which inputs and why the new
output is correct.
-->

## Breaking changes

<!-- Describe any breaking change and the migration path, or write "None". -->
