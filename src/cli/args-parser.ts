import type { CliArgs, CliOutputFormat } from './types';

const FORMATS: readonly CliOutputFormat[] = ['svg', 'gif', 'ascii', 'term'];

export function parseCliArgs(argv: readonly string[]): CliArgs {
  let outputPath: string | undefined;
  let format: CliOutputFormat = 'svg';
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      throw new Error(helpText());
    }

    if (arg === '--output' || arg === '-o') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('Missing value for --output.');
      }
      outputPath = next;
      i++;
      continue;
    }

    if (arg === '--format' || arg === '-f') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('Missing value for --format.');
      }
      if (!isFormat(next)) {
        throw new Error(`Unsupported format: ${next}. Use one of: ${FORMATS.join(', ')}`);
      }
      format = next;
      i++;
      continue;
    }

    positional.push(arg);
  }

  const url = positional[0];
  if (!url) {
    throw new Error(helpText());
  }

  return outputPath === undefined ? { url, format } : { url, format, outputPath };
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
    '  -h, --help                           Show help',
    '',
    'Examples:',
    '  bun-qr https://bun.com',
    '  bun-qr bun.com --format gif --output bun.gif',
    '  bun-qr https://bun.sh --format term'
  ].join('\n');
}
