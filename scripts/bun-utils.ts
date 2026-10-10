import { $ } from 'bun';

/** Preserve literal filesystem characters while resolving against the current directory. */
export function absolute_path(path: string): string {
  return Bun.fileURLToPath(Bun.pathToFileURL(path));
}

export function child_path(directory: string, name: string): string {
  return absolute_path(`${directory}/${name}`);
}

/** Spawn the same Bun executable that is running this script. */
export function bun_executable(): string {
  const executable = Bun.argv[0];
  if (!executable) throw new Error('Unable to locate the running Bun executable');
  return executable;
}

/** Atomically create a private directory; never reuse or clean up an existing path. */
export async function temporary_directory(prefix: string): Promise<string> {
  const base = Bun.env.BUN_TMPDIR ?? Bun.env.TMPDIR ?? Bun.env.TEMP ?? Bun.env.TMP ?? '/tmp';
  const directory = child_path(base, `${prefix}${crypto.randomUUID()}`);
  await $`mkdir ${directory}`.quiet();
  if (navigator.platform !== 'Win32') {
    try {
      await $`chmod 700 ${directory}`.quiet();
    } catch (error) {
      await remove_directory(directory);
      throw error;
    }
  }
  return directory;
}

export async function remove_directory(directory: string): Promise<void> {
  await $`rm -rf ${absolute_path(directory)}`.quiet();
}

export async function create_directory(directory: string): Promise<void> {
  await $`mkdir ${absolute_path(directory)}`.quiet();
}
