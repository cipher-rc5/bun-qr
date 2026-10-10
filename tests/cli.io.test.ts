import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { link, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { QrCliApplication } from '../src/cli/app';
import { BunTerminalPresenter } from '../src/cli/terminal-presenter';

async function temporary(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'bun-qr-io-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function application(value: string) {
  return new QrCliApplication({ normalize: (input) => input }, { generate: () => value }, {
    printInfo: () => {},
    printError: () => {},
    printSuccess: () => {}
  });
}

describe('exclusive artifact creation', () => {
  // Windows prohibits '?' in filenames; test every representable literal there.
  const names = ['saved#data.txt', 'saved?data.txt', 'saved%20data.txt', 'saved%2Fdata.txt'].filter((name) =>
    process.platform !== 'win32' || !name.includes('?')
  );
  test.each(names)('protects literal filename %s', async (name) => {
    await temporary(async (directory) => {
      const destination = join(directory, name);
      await Bun.write(destination, 'PRECIOUS DATA');
      for (const path of [destination, relative(process.cwd(), destination)]) {
        expect(await application('replacement').run(['x', '--output', path])).toBe(1);
        expect(await Bun.file(destination).text()).toBe('PRECIOUS DATA');
      }
      expect(await application('replacement').run(['x', '--output', destination, '--force'])).toBe(0);
      expect(await Bun.file(destination).text()).toBe('replacement');
    });
  });
  test('exactly one of twelve competing writers succeeds', async () => {
    await temporary(async (directory) => {
      const destination = join(directory, 'race.svg');
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) => application(`writer-${i}`).run(['x', '--output', destination]))
      );
      expect(results.filter((code) => code === 0)).toHaveLength(1);
      expect(results.filter((code) => code === 1)).toHaveLength(11);
      expect(await Bun.file(destination).text()).toBe(`writer-${results.indexOf(0)}`);
    });
  });
  test('protects another filename for the same inode', async () => {
    await temporary(async (directory) => {
      const original = join(directory, 'original');
      const alias = join(directory, 'alias');
      await Bun.write(original, 'PRECIOUS DATA');
      await link(original, alias);
      expect(await application('replacement').run(['x', '--output', alias])).toBe(1);
      expect(await Bun.file(original).text()).toBe('PRECIOUS DATA');
    });
  });
  if (process.platform !== 'win32') {
    // Creating file symlinks requires elevated privileges on Windows runners.
    test('protects both existing and dangling symlinks', async () => {
      await temporary(async (directory) => {
        for (const exists of [false, true]) {
          const original = join(directory, `target-${exists}`);
          const alias = join(directory, `alias-${exists}`);
          if (exists) await Bun.write(original, 'PRECIOUS DATA');
          await symlink(original, alias);
          expect(await application('replacement').run(['x', '--output', alias])).toBe(1);
          if (exists) expect(await Bun.file(original).text()).toBe('PRECIOUS DATA');
          else expect(await Bun.file(original).exists()).toBe(false);
        }
      });
    });
  }
  test('creates parent directories and surfaces a failed write', async () => {
    await temporary(async (directory) => {
      const destination = join(directory, 'parent', 'nested', 'artifact');
      expect(await application('artifact').run(['x', '--output', destination])).toBe(0);
      expect(await Bun.file(destination).text()).toBe('artifact');
      expect(await application('artifact').run(['x', '--output', directory, '--force'])).toBe(1);
    });
  });
});

const stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
const stderrTty = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
afterEach(() => {
  if (stdoutTty) Object.defineProperty(process.stdout, 'isTTY', stdoutTty);
  else Reflect.deleteProperty(process.stdout, 'isTTY');
  if (stderrTty) Object.defineProperty(process.stderr, 'isTTY', stderrTty);
  else Reflect.deleteProperty(process.stderr, 'isTTY');
});

describe('concrete terminal presenter', () => {
  test('routes primary output to stdout and status/errors to stderr without ANSI in pipes', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });
    const out = spyOn(console, 'log').mockImplementation(() => {});
    const err = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const presenter = new BunTerminalPresenter();
      presenter.printInfo('artifact');
      presenter.printSuccess('saved');
      presenter.printError('failed');
      expect(out.mock.calls).toEqual([['artifact']]);
      expect(err.mock.calls).toEqual([['saved'], ['failed']]);
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
  });
  test('colors only TTY streams and handles unavailable colors', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
    const out = spyOn(console, 'log').mockImplementation(() => {});
    const err = spyOn(console, 'error').mockImplementation(() => {});
    // Bun.color has format-dependent overloads; this stub serves ANSI calls only.
    const color = spyOn(Bun, 'color').mockImplementation((() => '\x1b[32m') as unknown as typeof Bun.color);
    try {
      const presenter = new BunTerminalPresenter();
      presenter.printInfo('artifact');
      presenter.printSuccess('saved');
      expect(out.mock.calls).toEqual([['artifact']]);
      expect(err.mock.calls).toEqual([['\x1b[32msaved\x1b[0m']]);
      color.mockImplementation((() => null) as typeof Bun.color);
      presenter.printError('failed');
      expect(err.mock.calls[1]).toEqual(['failed']);
    } finally {
      out.mockRestore();
      err.mockRestore();
      color.mockRestore();
    }
  });
});

async function cli(args: string[]) {
  const child = Bun.spawn([process.execPath, resolve(import.meta.dir, '../src/cli.ts'), ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { stdout, stderr, exit };
}

describe('CLI executable', () => {
  test('help exits zero with only stdout', async () => {
    const result = await cli(['--help']);
    expect(result.exit).toBe(0);
    expect(result.stdout).toContain('Usage: bun-qr');
    expect(result.stderr).toBe('');
  });
  test('usage errors exit two with only stderr', async () => {
    const result = await cli([]);
    expect(result.exit).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Missing required');
  });
  test('ASCII output stays free of status messages and presenter colors', async () => {
    const result = await cli(['bun.com', '--format', 'ascii']);
    expect(result.exit).toBe(0);
    expect(result.stdout).toMatch(/[█▀▄]/);
    expect(result.stdout).not.toContain('\x1b');
    expect(result.stdout).not.toContain('completed');
    expect(result.stderr).toContain('QR generation completed.');
  });
  test('writes a GIF artifact and refuses to overwrite on the next invocation', async () => {
    await temporary(async (directory) => {
      const destination = join(directory, 'qr.gif');
      const args = ['bun.com', '--format', 'gif', '--output', destination];
      const first = await cli(args);
      expect(first.exit).toBe(0);
      expect(first.stdout).toBe('');
      expect(first.stderr).toContain('Saved QR file');
      const content = await Bun.file(destination).bytes();
      expect(new TextDecoder().decode(content.slice(0, 6))).toBe('GIF87a');
      const second = await cli(args);
      expect(second.exit).toBe(1);
      expect(second.stderr).toContain('Refusing to overwrite');
      expect(await Bun.file(destination).bytes()).toEqual(content);
    });
  });
});
