import type { CliArgs, CliOutputFormat } from './types';

const FORMATS: readonly CliOutputFormat[] = ['svg', 'gif', 'ascii', 'term'];

const FLAGS: readonly string[] = ['--help', '-h', '--output', '-o', '--format', '-f', '--size', '-s', '--force', '-F'];

/**
 * Upper bound for --size, derived from MAX_QR_PIXELS (16_000_000 = 4000x4000)
 * in src/core/bitmap.ts. A square output of 4000x4000 is exactly at the limit.
 */
export const MAX_CLI_SIZE = 4000;

export function parseCliArgs(argv: readonly string[]): CliArgs {
  let outputPath: string | undefined;
  let format: CliOutputFormat = 'svg';
  let size: number | undefined;
  let force = false;
  let help = false;
  let endOfOptions = false;
  const positional: string[] = [];

  for (let i = 0;i < argv.length;i++) {
    const arg = argv[i] as string;

    if (endOfOptions) {
      positional.push(arg);
      continue;
    }

    if (arg === '--') {
      endOfOptions = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

    if (arg === '--force' || arg === '-F') {
      force = true;
      continue;
    }

    if (arg === '--output' || arg === '-o') {
      outputPath = readFlagValue(argv, i, '--output');
      i++;
      continue;
    }

    if (arg === '--format' || arg === '-f') {
      const next = readFlagValue(argv, i, '--format');
      if (!isFormat(next)) {
        throw new Error(`Unsupported format: ${next}. Use one of: ${FORMATS.join(', ')}`);
      }
      format = next;
      i++;
      continue;
    }

    if (arg === '--size' || arg === '-s') {
      const next = readFlagValue(argv, i, '--size');
      size = parseSize(next);
      i++;
      continue;
    }

    if (arg.startsWith('-') && arg !== '-') {
      throw new Error(`Unknown option: ${arg}. Valid options: ${FLAGS.join(', ')}`);
    }

    positional.push(arg);
  }

  if (help) {
    return { help: true, url: '', format, force };
  }

  const url = positional[0];
  if (!url) {
    throw new MissingUrlError();
  }

  return { help: false, url, format, force, ...(outputPath !== undefined && { outputPath }), ...(size !== undefined && { size }) };
}

/** Thrown when no URL positional argument was supplied. Signals a usage error, not a crash. */
export class MissingUrlError extends Error {
  constructor () {
    super('Missing required <url> argument.');
    this.name = 'MissingUrlError';
  }
}

function readFlagValue(argv: readonly string[], index: number, flag: string): string {
  const next = argv[index + 1];
  if (next === undefined || next.length === 0) {
    throw new Error(`Missing value for ${flag}.`);
  }
  if (next.startsWith('-') && next !== '-') {
    throw new Error(`Missing value for ${flag}. Got another option instead: ${next}`);
  }

  return next;
}

function parseSize(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid size: ${value}. Must be a positive integer (decimal digits only).`);
  }

  const n = Number(value);
  if (n < 1) {
    throw new Error(`Invalid size: ${value}. Must be a positive integer (decimal digits only).`);
  }
  if (n > MAX_CLI_SIZE) {
    throw new Error(`Invalid size: ${value}. Maximum is ${MAX_CLI_SIZE} pixels.`);
  }

  return n;
}

function isFormat(value: string): value is CliOutputFormat {
  return FORMATS.includes(value as CliOutputFormat);
}

export function helpText(): string {
  return [
    'Usage: bun-qr <url> [options]',
    '',
    'Options:',
    '  -f, --format <svg|gif|ascii|term>   Output format (default: svg)',
    '  -o, --output <path>                  Output file for svg/gif formats',
    `  -s, --size <pixels>                  Output size in pixels, 1-${MAX_CLI_SIZE} (svg only)`,
    '  -F, --force                          Overwrite the output file if it already exists',
    '  -h, --help                           Show help',
    '      --                               Treat all following arguments as positional',
    '',
    'Examples:',
    '  bun-qr https://bun.com',
    '  bun-qr bun.com --format gif --output bun.gif',
    '  bun-qr https://bun.sh --format term',
    '  bun-qr https://bun.sh --size 128 --output bun-128.svg',
    '  bun-qr https://bun.sh --output bun.svg --force'
  ].join('\n');
}
