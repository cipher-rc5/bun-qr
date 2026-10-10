// file: src/runtime.ts
// description: enforce the package's supported runtime at public entry points

/** Internal startup check shared by both public entry points. */
export function assert_bun_runtime(runtime: unknown): void {
  if (runtime === undefined) {
    throw new Error('bun-qr requires the Bun runtime. Run your program with bun.');
  }
}

assert_bun_runtime(globalThis.Bun);
