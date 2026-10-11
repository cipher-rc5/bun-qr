import { absolute_path, bun_executable, child_path, create_directory, remove_directory, temporary_directory } from './bun-utils';

const root = Bun.fileURLToPath(new URL('../', import.meta.url));
const executable = bun_executable();
const temporary = await temporary_directory('bun-qr-consumer-');

async function run(command: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(command, { cwd, stdout: 'inherit', stderr: 'inherit' });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${command[0]} ${command[1]} failed with exit ${code}`);
}

try {
  let tarball: string;
  const supplied = Bun.argv[2];
  if (supplied !== undefined) {
    tarball = absolute_path(supplied);
    if (!await Bun.file(tarball).exists()) throw new Error(`Package tarball not found: ${tarball}`);
  } else {
    await run([executable, 'pm', 'pack', '--ignore-scripts', '--destination', temporary], root);
    const files = Array.from(new Bun.Glob('*.tgz').scanSync(temporary));
    if (files.length !== 1 || !files[0]) throw new Error('Expected exactly one packed tarball');
    tarball = child_path(temporary, files[0]);
  }
  const consumer = child_path(temporary, 'consumer');
  await create_directory(consumer);
  await Bun.write(child_path(consumer, 'package.json'), JSON.stringify({ name: 'consumer', type: 'module' }));
  await run([executable, 'add', '--offline', '--ignore-scripts', tarball], consumer);
  const installed = new URL('./node_modules/bun-qr/', Bun.pathToFileURL(`${consumer}/`));
  for (
    const required of ['README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'justfile', 'docs/LINK_ENCODING.md', 'docs/RELEASE_VERIFICATION.md']
  ) {
    if (!await Bun.file(new URL(required, installed)).exists()) throw new Error(`Package documentation missing: ${required}`);
  }
  for (const path of new Bun.Glob('**/*.md').scanSync(Bun.fileURLToPath(installed))) {
    const document = new URL(path, installed);
    const text = await Bun.file(document).text();
    for (const match of text.matchAll(/\]\(([^\s)]+)\)/g)) {
      const target = match[1];
      if (!target || target.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
      const linked = new URL(target, document);
      linked.hash = '';
      if (!linked.href.startsWith(installed.href) || !await Bun.file(linked).exists()) {
        throw new Error(`Broken package documentation link: ${path} -> ${target}`);
      }
    }
  }
  console.log('package documentation and relative links check cleanly');
  await Bun.write(
    child_path(consumer, 'check.ts'),
    `
import encode_qr, { type Output } from 'bun-qr';
import { encode_wifi } from 'bun-qr/links';
const defaults: boolean[][] = encode_qr('default raw');
const dynamic = (output: Output) => encode_qr('dynamic', output);
if (defaults.length < 21 || !Array.isArray(dynamic('raw'))) throw new Error('bad QR export');
if (!encode_wifi({ssid:'a',password:'b'}).startsWith('WIFI:')) throw new Error('bad links export');
console.log('package imports and consumer types check cleanly');
`
  );
  await run([
    executable,
    'run',
    '--bun',
    'tsc',
    '--ignoreConfig',
    '--noEmit',
    '--strict',
    '--moduleResolution',
    'bundler',
    '--module',
    'preserve',
    '--target',
    'esnext',
    '--skipLibCheck',
    '--types',
    'bun',
    '--typeRoots',
    child_path(root, 'node_modules/@types'),
    child_path(consumer, 'check.ts')
  ], root);
  await run([executable, 'run', 'check.ts'], consumer);
} finally {
  await remove_directory(temporary);
}
