default: typecheck test

typecheck:
    bun run typecheck

test:
    bun test

bench:
    bun run bench

fmt:
    bunx dprint fmt

fmt-check:
    bunx dprint check

build:
    bunx tsc --project tsconfig.build.json

clean:
    rm -rf dist coverage
