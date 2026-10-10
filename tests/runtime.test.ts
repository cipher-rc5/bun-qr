import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert_bun_runtime } from '../src/runtime';

test('public entry-point startup rejects a missing Bun runtime with actionable guidance', () => {
  expect(() => assert_bun_runtime(undefined)).toThrow('bun-qr requires the Bun runtime');
  expect(() => assert_bun_runtime(Bun)).not.toThrow();
});

test('project runtime policy executes Node-targeted dependency scripts with Bun', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bun-qr-runtime-'));
  try {
    await Promise.all([
      Bun.write(join(directory, 'bunfig.toml'), Bun.file(new URL('../bunfig.toml', import.meta.url))),
      // A dependency can name node explicitly; Bun's run policy must override it.
      Bun.write(join(directory, 'package.json'), JSON.stringify({ scripts: { probe: 'node probe.cjs' } })),
      Bun.write(join(directory, 'probe.cjs'), "console.log(typeof Bun === 'undefined' ? 'node' : Bun.version);")
    ]);
    const child = Bun.spawn([process.execPath, 'run', 'probe'], { cwd: directory, stdout: 'pipe', stderr: 'pipe' });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect(code, stderr).toBe(0);
    expect(stdout.trim()).toBe(Bun.version);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
