import { describe, expect, test } from 'bun:test';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QrCliApplication } from '../src/cli/app';
import type { CliOutputFormat, OutputPresenter, QrGenerator, UrlNormalizer } from '../src/cli/types';

class MockPresenter implements OutputPresenter {
  readonly info: string[] = [];
  readonly success: string[] = [];
  readonly error: string[] = [];

  printInfo(message: string): void {
    this.info.push(message);
  }

  printSuccess(message: string): void {
    this.success.push(message);
  }

  printError(message: string): void {
    this.error.push(message);
  }
}

class PrefixNormalizer implements UrlNormalizer {
  normalize(input: string): string {
    return `https://${input}`;
  }
}

class FixedGenerator implements QrGenerator {
  constructor (private readonly value: string | Uint8Array) {}

  generate(_payload: string, _format: CliOutputFormat): string | Uint8Array {
    return this.value;
  }
}

describe('QrCliApplication', () => {
  test('returns 0 and prints help with --help', async () => {
    const presenter = new MockPresenter();
    const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('ignored'), presenter);

    const code = await app.run(['--help']);

    expect(code).toBe(0);
    expect(presenter.info.length).toBe(1);
    expect(presenter.error.length).toBe(0);
  });

  test('renders term output without writing files', async () => {
    const presenter = new MockPresenter();
    const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('TERM_OUTPUT'), presenter);

    const code = await app.run(['bun.com', '--format', 'term']);

    expect(code).toBe(0);
    expect(presenter.info).toEqual(['TERM_OUTPUT']);
    expect(presenter.success).toEqual(['QR generation completed.']);
    expect(presenter.error.length).toBe(0);
  });

  test('writes svg file and reports destination', async () => {
    const presenter = new MockPresenter();
    const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('<svg></svg>'), presenter);
    const outputPath = join(tmpdir(), `bun-qr-cli-${crypto.randomUUID()}.svg`);

    const code = await app.run(['bun.com', '--format', 'svg', '--output', outputPath]);

    expect(code).toBe(0);
    expect(presenter.info).toContain(`Saved QR file to ${outputPath}`);
    expect(presenter.success).toEqual(['QR generation completed.']);
    const content = await Bun.file(outputPath).text();
    expect(content).toBe('<svg></svg>');

    await unlink(outputPath);
  });

  test('returns 1 on invalid cli input', async () => {
    const presenter = new MockPresenter();
    const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('ignored'), presenter);

    const code = await app.run(['bun.com', '--format', 'invalid']);

    expect(code).toBe(1);
    expect(presenter.error[0]).toContain('Unsupported format: invalid');
  });
});
