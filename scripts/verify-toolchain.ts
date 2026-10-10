import { child_path } from './bun-utils';

export interface ToolchainConfig {
  engine: string;
  pinned: string;
  workflowPins: readonly string[];
  matrix: readonly string[];
  runtime: string;
}

function version(value: string): number[] {
  if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error(`Expected a stable Bun version, got ${value}`);
  return value.split('.').map(Number);
}

function older(left: string, right: string): boolean {
  const a = version(left);
  const b = version(right);
  for (let i = 0;i < 3;i++) {
    if (a[i] !== b[i]) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

/** Check pins, supported minimum, matrix coverage and the executing runtime together. */
export function verifyToolchain(config: ToolchainConfig): void {
  const floor = /^>=(\d+\.\d+\.\d+)$/.exec(config.engine)?.[1];
  if (!floor) throw new Error(`Expected engines.bun >=x.y.z, got ${config.engine}`);
  if (config.workflowPins.some((pin) => pin !== config.pinned)) throw new Error('Workflow Bun pins disagree with .bun-version');
  for (const value of [config.pinned, config.runtime, ...config.matrix]) {
    if (older(value, floor)) throw new Error(`Bun ${value} is below engines.bun ${config.engine}`);
  }
  if (!config.matrix.includes(floor) || !config.matrix.includes(config.pinned)) {
    throw new Error('CI must cover both the supported minimum and pinned Bun version');
  }
}

if (import.meta.main) {
  const root = Bun.fileURLToPath(new URL('../', import.meta.url));
  const pkg = await Bun.file(child_path(root, 'package.json')).json();
  const pinned = (await Bun.file(child_path(root, '.bun-version')).text()).trim();
  const ci = await Bun.file(child_path(root, '.github/workflows/ci.yml')).text();
  const release = await Bun.file(child_path(root, '.github/workflows/release.yml')).text();
  const workflowPins = [ci, release].map((text) => {
    const pin = /^\s+BUN_VERSION: "([^"]+)"/m.exec(text)?.[1];
    if (!pin) throw new Error('Workflow has no pinned BUN_VERSION');
    return pin;
  });
  const matrixText = /^\s+bun: (\[[^\n]+\])/m.exec(ci)?.[1];
  if (!matrixText) throw new Error('CI has no Bun matrix');
  const matrix = JSON.parse(matrixText) as string[];
  verifyToolchain({ engine: pkg.engines.bun, pinned, workflowPins, matrix, runtime: Bun.version });
  console.log(`Bun toolchain OK: minimum ${pkg.engines.bun}, pin ${pinned}, runtime ${Bun.version}, matrix ${matrix.join(', ')}`);
}
