import { describe, expect, test } from 'bun:test';
import { EXIT_ERROR, EXIT_OK, EXIT_USAGE, QrCliApplication } from '../src/cli/app';
import { helpText } from '../src/cli/args-parser';
import { BunQrGenerator } from '../src/cli/qr-generator';
import type { CliOutputFormat, OutputPresenter, QrGenerator, UrlNormalizer } from '../src/cli/types';
import { DefaultUrlNormalizer } from '../src/cli/url-normalizer';

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

function tempPath(extension = 'svg'): string {
  return `${Bun.env.TMPDIR ?? '/tmp'}/bun-qr-cli-${crypto.randomUUID()}.${extension}`;
}

describe('QrCliApplication', () => {
  test('returns 0 and prints help with --help', async () => {
    const presenter = new MockPresenter();
    const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('ignored'), presenter);

    const code = await app.run(['--help']);

    expect(code).toBe(EXIT_OK);
    expect(presenter.info.length).toBe(1);
    expect(presenter.info[0]).toContain('Usage: bun-qr');
    expect(presenter.error.length).toBe(0);
  });

  test('renders term output without writing files', async () => {
    const presenter = new MockPresenter();
    const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('TERM_OUTPUT'), presenter);

    const code = await app.run(['bun.com', '--format', 'term']);

    expect(code).toBe(EXIT_OK);
    expect(presenter.info).toEqual(['TERM_OUTPUT']);
    expect(presenter.success).toEqual(['QR generation completed.']);
    expect(presenter.error.length).toBe(0);
  });

  test('writes svg file and reports destination', async () => {
    const presenter = new MockPresenter();
    const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('<svg></svg>'), presenter);
    const outputPath = tempPath();

    const code = await app.run(['bun.com', '--format', 'svg', '--output', outputPath]);

    expect(code).toBe(EXIT_OK);
    expect(presenter.success).toContain(`Saved QR file to ${outputPath}`);
    expect(presenter.success).toContain('QR generation completed.');
    const content = await Bun.file(outputPath).text();
    expect(content).toBe('<svg></svg>');

    await Bun.file(outputPath).delete();
  });

  test('returns 1 on invalid cli input', async () => {
    const presenter = new MockPresenter();
    const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('ignored'), presenter);

    const code = await app.run(['bun.com', '--format', 'invalid']);

    expect(code).toBe(EXIT_ERROR);
    expect(presenter.error[0]).toContain('Unsupported format: invalid');
  });

  describe('usage errors', () => {
    test('no arguments exits non-zero', async () => {
      const presenter = new MockPresenter();
      const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('ignored'), presenter);

      const code = await app.run([]);

      // Regression: this used to exit 0, so scripts could not detect a usage error.
      expect(code).toBe(EXIT_USAGE);
      expect(code).not.toBe(EXIT_OK);
    });

    test('no arguments routes help to the error channel, not stdout', async () => {
      const presenter = new MockPresenter();
      const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('ignored'), presenter);

      await app.run([]);

      expect(presenter.info.length).toBe(0);
      expect(presenter.error.join('\n')).toContain('Missing required <url> argument.');
      expect(presenter.error.join('\n')).toContain('Usage: bun-qr');
    });

    test('unknown flag exits non-zero instead of being ignored', async () => {
      const presenter = new MockPresenter();
      const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('ignored'), presenter);

      const code = await app.run(['hello', '--bogus-flag']);

      expect(code).toBe(EXIT_ERROR);
      expect(presenter.error[0]).toContain('Unknown option: --bogus-flag');
    });
  });

  describe('overwrite guard', () => {
    test('refuses to overwrite an existing file without --force', async () => {
      const presenter = new MockPresenter();
      const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('<svg></svg>'), presenter);
      const outputPath = tempPath();
      await Bun.write(outputPath, 'PRECIOUS DATA');

      const code = await app.run(['bun.com', '--output', outputPath]);

      expect(code).toBe(EXIT_ERROR);
      expect(await Bun.file(outputPath).text()).toBe('PRECIOUS DATA');
      expect(presenter.error[0]).toContain('Refusing to overwrite existing file');
      expect(presenter.error[0]).toContain(outputPath);
      expect(presenter.error[0]).toContain('--force');

      await Bun.file(outputPath).delete();
    });

    test('overwrites when --force is passed', async () => {
      const presenter = new MockPresenter();
      const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('<svg></svg>'), presenter);
      const outputPath = tempPath();
      await Bun.write(outputPath, 'PRECIOUS DATA');

      const code = await app.run(['bun.com', '--output', outputPath, '--force']);

      expect(code).toBe(EXIT_OK);
      expect(await Bun.file(outputPath).text()).toBe('<svg></svg>');

      await Bun.file(outputPath).delete();
    });

    test('-F is accepted as the short form', async () => {
      const presenter = new MockPresenter();
      const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('<svg></svg>'), presenter);
      const outputPath = tempPath();
      await Bun.write(outputPath, 'old');

      const code = await app.run(['bun.com', '--output', outputPath, '-F']);

      expect(code).toBe(EXIT_OK);
      expect(await Bun.file(outputPath).text()).toBe('<svg></svg>');

      await Bun.file(outputPath).delete();
    });

    test('writes freely when the target does not exist', async () => {
      const presenter = new MockPresenter();
      const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('<svg></svg>'), presenter);
      const outputPath = tempPath();

      const code = await app.run(['bun.com', '--output', outputPath]);

      expect(code).toBe(EXIT_OK);
      expect(presenter.error.length).toBe(0);

      await Bun.file(outputPath).delete();
    });

    test('the guard also covers a traversing relative path', async () => {
      const presenter = new MockPresenter();
      const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('<svg></svg>'), presenter);
      const dir = `${Bun.env.TMPDIR ?? '/tmp'}/bun-qr-guard-${crypto.randomUUID()}`;
      const victim = `${dir}/victim.txt`;
      await Bun.write(victim, 'PRECIOUS DATA');

      const code = await app.run(['bun.com', '--output', `${dir}/sub/../victim.txt`]);

      expect(code).toBe(EXIT_ERROR);
      expect(await Bun.file(victim).text()).toBe('PRECIOUS DATA');

      await Bun.file(victim).delete();
    });
  });

  describe('stream routing', () => {
    test('ascii artifact goes to the info channel and status to success', async () => {
      const presenter = new MockPresenter();
      const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('ASCII_ART'), presenter);

      await app.run(['bun.com', '--format', 'ascii']);

      // Only the artifact may occupy stdout; status chatter must not.
      expect(presenter.info).toEqual(['ASCII_ART']);
      expect(presenter.info.join('')).not.toContain('QR generation completed.');
      expect(presenter.success).toContain('QR generation completed.');
    });

    test('file-save status does not pollute the info channel', async () => {
      const presenter = new MockPresenter();
      const app = new QrCliApplication(new PrefixNormalizer(), new FixedGenerator('<svg></svg>'), presenter);
      const outputPath = tempPath();

      await app.run(['bun.com', '--output', outputPath]);

      expect(presenter.info.length).toBe(0);

      await Bun.file(outputPath).delete();
    });
  });

  describe('with the real normalizer and generator', () => {
    // These exercise DefaultUrlNormalizer and BunQrGenerator rather than test doubles.
    const realApp = (presenter: OutputPresenter) => new QrCliApplication(new DefaultUrlNormalizer(), new BunQrGenerator(), presenter);

    test('generates a real svg for a bare host', async () => {
      const presenter = new MockPresenter();
      const outputPath = tempPath();

      const code = await realApp(presenter).run(['bun.com', '--output', outputPath]);

      expect(code).toBe(EXIT_OK);
      const svg = await Bun.file(outputPath).text();
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');

      await Bun.file(outputPath).delete();
    });

    test('applies --size to the real svg output', async () => {
      const presenter = new MockPresenter();
      const outputPath = tempPath();

      const code = await realApp(presenter).run(['https://bun.com', '--size', '256', '--output', outputPath]);

      expect(code).toBe(EXIT_OK);
      const svg = await Bun.file(outputPath).text();
      expect(svg).toContain('width="256"');
      expect(svg).toContain('height="256"');

      await Bun.file(outputPath).delete();
    });

    test('generates real term output', async () => {
      const presenter = new MockPresenter();

      const code = await realApp(presenter).run(['https://bun.com', '--format', 'term']);

      expect(code).toBe(EXIT_OK);
      expect(presenter.info[0]?.length).toBeGreaterThan(0);
    });

    test('generates a real gif with the gif magic bytes', async () => {
      const presenter = new MockPresenter();
      const outputPath = tempPath('gif');

      const code = await realApp(presenter).run(['https://bun.com', '--format', 'gif', '--output', outputPath]);

      expect(code).toBe(EXIT_OK);
      const bytes = new Uint8Array(await Bun.file(outputPath).arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 3))).toBe('GIF');

      await Bun.file(outputPath).delete();
    });

    test('rejects a non-http scheme through the real normalizer', async () => {
      const presenter = new MockPresenter();

      const code = await realApp(presenter).run(['mailto:a@b.com', '--format', 'term']);

      expect(code).toBe(EXIT_ERROR);
      expect(presenter.error[0]).toContain('Unsupported URL scheme: mailto:');
    });

    test('rejects javascript: through the real normalizer', async () => {
      const presenter = new MockPresenter();

      const code = await realApp(presenter).run(['javascript:alert(1)', '--format', 'term']);

      expect(code).toBe(EXIT_ERROR);
      expect(presenter.error.length).toBe(1);
    });

    test('help text is never encoded as a QR payload', async () => {
      const presenter = new MockPresenter();

      // Regression: help used to travel as an exception payload, so feeding it back in
      // encoded the whole help text as a QR code.
      const code = await realApp(presenter).run([helpText(), '--format', 'term']);

      expect(code).toBe(EXIT_ERROR);
      expect(presenter.info.length).toBe(0);
    });

    test('encodes a payload after -- through the real pipeline', async () => {
      const presenter = new MockPresenter();

      // Regression: `bun-qr -- hello` used to encode the literal string "--".
      const code = await realApp(presenter).run(['--format', 'term', '--', 'bun.com']);

      expect(code).toBe(EXIT_OK);
      expect(presenter.info[0]?.length).toBeGreaterThan(0);
      expect(presenter.error.length).toBe(0);
    });
  });
});

describe('DefaultUrlNormalizer', () => {
  const normalizer = new DefaultUrlNormalizer();

  test('adds https to a bare host', () => {
    expect(normalizer.normalize('bun.com')).toBe('https://bun.com/');
  });

  test('preserves an explicit https url', () => {
    expect(normalizer.normalize('https://bun.com/docs')).toBe('https://bun.com/docs');
  });

  test('preserves an explicit http url', () => {
    expect(normalizer.normalize('http://bun.com/')).toBe('http://bun.com/');
  });

  test('trims surrounding whitespace', () => {
    expect(normalizer.normalize('  bun.com  ')).toBe('https://bun.com/');
  });

  test('rejects an empty string', () => {
    expect(() => normalizer.normalize('   ')).toThrow('URL is required.');
  });

  describe('scheme handling', () => {
    test('rejects mailto: rather than mangling it', () => {
      // Regression: this used to become "https://mailto:a@b.com/", host "mailto".
      expect(() => normalizer.normalize('mailto:a@b.com')).toThrow('Unsupported URL scheme: mailto:');
    });

    test('never prefixes https onto a scheme-only uri', () => {
      expect(() => normalizer.normalize('mailto:a@b.com')).toThrow();
      expect(() => normalizer.normalize('tel:+15551234567')).toThrow('Unsupported URL scheme: tel:');
    });

    test.each([['javascript:alert(1)', 'javascript:'], ['data:text/html,<script>alert(1)</script>', 'data:'], [
      'file:///etc/passwd',
      'file:'
    ], ['ftp://example.com', 'ftp:']])('rejects the dangerous scheme in %s', (input, scheme) => {
      expect(() => normalizer.normalize(input)).toThrow(`Unsupported URL scheme: ${scheme}`);
    });

    test('scheme matching is case-insensitive', () => {
      expect(() => normalizer.normalize('JavaScript:alert(1)')).toThrow('Unsupported URL scheme: javascript:');
      expect(normalizer.normalize('HTTPS://bun.com')).toBe('https://bun.com/');
    });

    test('a bare host with a port is not mistaken for a scheme', () => {
      expect(normalizer.normalize('localhost:3000')).toBe('https://localhost:3000/');
      expect(normalizer.normalize('bun.com:8080/docs')).toBe('https://bun.com:8080/docs');
    });
  });
});

describe('BunQrGenerator', () => {
  const generator = new BunQrGenerator();

  test('produces svg markup by default', () => {
    const out = generator.generate('https://bun.com', 'svg');
    expect(typeof out).toBe('string');
    expect(out as string).toContain('<svg');
  });

  test('injects width and height when a size is given', () => {
    const out = generator.generate('https://bun.com', 'svg', 128) as string;
    expect(out).toContain('width="128"');
    expect(out).toContain('height="128"');
  });

  test('produces gif bytes', () => {
    const out = generator.generate('https://bun.com', 'gif');
    expect(out).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode((out as Uint8Array).slice(0, 3))).toBe('GIF');
  });

  test('produces ascii output', () => {
    const out = generator.generate('https://bun.com', 'ascii') as string;
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  test('produces term output', () => {
    const out = generator.generate('https://bun.com', 'term') as string;
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
});
