default: typecheck test

# Local CI gates; GitHub also uploads coverage and benchmark artifacts.
ci: verify-toolchain audit fmt-check lint typecheck build verify-package coverage

verify-toolchain:
    bun run verify:toolchain

audit:
    bun audit --audit-level=high

typecheck:
    bun run typecheck

test:
    bun test

coverage:
    bun run coverage

bench:
    bun run bench

fmt:
    bun run fmt

fmt-check:
    bun run fmt:check

lint:
    bun run lint

lint-fix:
    bun run lint:fix

# Declaration-only emit. Bun runs the TypeScript in src/ directly, so this
# produces type declarations for editors and tsc consumers, not JavaScript.
build:
    bun run build

# Verify the packed tarball actually imports from a clean Bun consumer.
verify-package: build
    bun run verify:package

clean:
    rm -rf types dist coverage
