default: typecheck test

# Everything CI enforces, in the same order.
ci: fmt-check typecheck build test

typecheck:
    bun run typecheck

test:
    bun test

coverage:
    bun test --coverage

bench:
    bun run bench

fmt:
    bunx dprint fmt

fmt-check:
    bunx dprint check

# Declaration-only emit. Bun runs the TypeScript in src/ directly, so this
# produces type declarations for editors and tsc consumers, not JavaScript.
build:
    bunx tsc --project tsconfig.build.json

# Verify the packed tarball actually imports from a clean Bun consumer.
verify-package: build
    #!/usr/bin/env bash
    set -euo pipefail
    tmp="$(mktemp -d)"
    bun pm pack --destination "$tmp"
    cd "$tmp" && echo '{"name":"c","type":"module"}' > package.json
    bun add "$tmp"/bun-qr-*.tgz
    echo "import q from 'bun-qr'; import {encode_wifi} from 'bun-qr/links'; \
      if ((q('x','raw') as boolean[][]).length < 21) throw new Error('bad size'); \
      if (!encode_wifi({ssid:'a',password:'b'}).startsWith('WIFI:')) throw new Error('bad links'); \
      console.log('package imports cleanly');" > c.ts
    bun run c.ts
    rm -rf "$tmp"

clean:
    rm -rf types dist coverage
