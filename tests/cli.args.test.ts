import { describe, expect, test } from 'bun:test';
import { helpText, MAX_CLI_SIZE, MissingUrlError, parseCliArgs } from '../src/cli/args-parser';

describe('parseCliArgs', () => {
  test('parses url with defaults', () => {
    const result = parseCliArgs(['https://bun.com']);
    expect(result).toEqual({ help: false, url: 'https://bun.com', format: 'svg', force: false });
  });

  test('parses explicit format and output', () => {
    const result = parseCliArgs(['bun.com', '--format', 'gif', '--output', 'bun.gif']);
    expect(result).toEqual({ help: false, url: 'bun.com', format: 'gif', force: false, outputPath: 'bun.gif' });
  });

  test('throws MissingUrlError when no url is provided', () => {
    expect(() => parseCliArgs([])).toThrow(MissingUrlError);
    expect(() => parseCliArgs([])).toThrow('Missing required <url> argument.');
  });

  test('does not throw the help text as an error payload', () => {
    // Regression: help used to be smuggled through the exception channel.
    expect(() => parseCliArgs([])).not.toThrow(helpText());
  });

  test('throws on invalid format', () => {
    expect(() => parseCliArgs(['bun.com', '--format', 'png'])).toThrow('Unsupported format: png');
  });

  test('throws on missing --format value', () => {
    expect(() => parseCliArgs(['bun.com', '--format'])).toThrow('Missing value for --format.');
  });

  test('throws on missing --output value', () => {
    expect(() => parseCliArgs(['bun.com', '--output'])).toThrow('Missing value for --output.');
  });

  describe('--help', () => {
    test('returns a help-flagged result rather than throwing', () => {
      const result = parseCliArgs(['--help']);
      expect(result.help).toBe(true);
    });

    test('-h is equivalent', () => {
      expect(parseCliArgs(['-h']).help).toBe(true);
    });

    test('help wins even when a url is also supplied', () => {
      expect(parseCliArgs(['bun.com', '--help']).help).toBe(true);
    });

    test('help is not routed through the exception channel', () => {
      // Regression: help used to be thrown and recovered by string equality, so the
      // help text could round-trip back in as a payload. It is now a normal return value.
      const result = parseCliArgs(['--help']);
      expect(result.help).toBe(true);
      expect(() => parseCliArgs(['--help'])).not.toThrow();
    });
  });

  describe('unknown options', () => {
    test('rejects an unrecognized long flag', () => {
      expect(() => parseCliArgs(['bun.com', '--bogus-flag'])).toThrow('Unknown option: --bogus-flag');
    });

    test('rejects an unrecognized short flag', () => {
      expect(() => parseCliArgs(['bun.com', '-z'])).toThrow('Unknown option: -z');
    });

    test('error message lists the valid options', () => {
      expect(() => parseCliArgs(['bun.com', '--bogus'])).toThrow(/Valid options:.*--output.*--format.*--size/s);
    });

    test('a lone dash is treated as positional, not an unknown flag', () => {
      expect(parseCliArgs(['-']).url).toBe('-');
    });
  });

  describe('flag values that look like flags', () => {
    test('--output rejects a following option as its value', () => {
      // Regression: this used to encode the literal string "svg" with filename "--format".
      expect(() => parseCliArgs(['--output', '--format', 'svg'])).toThrow('Missing value for --output.');
    });

    test('--format rejects a following option as its value', () => {
      expect(() => parseCliArgs(['bun.com', '--format', '--size'])).toThrow('Missing value for --format.');
    });

    test('--size rejects a following option as its value', () => {
      expect(() => parseCliArgs(['bun.com', '--size', '--format'])).toThrow('Missing value for --size.');
    });
  });

  describe('--size validation', () => {
    test('accepts a plain decimal integer', () => {
      expect(parseCliArgs(['bun.com', '--size', '128']).size).toBe(128);
    });

    test('rejects exponential notation', () => {
      // Regression: Number("1e3") produced width="1000".
      expect(() => parseCliArgs(['bun.com', '--size', '1e3'])).toThrow('Invalid size: 1e3');
    });

    test('rejects hex notation', () => {
      // Regression: Number("0x10") produced width="16".
      expect(() => parseCliArgs(['bun.com', '--size', '0x10'])).toThrow('Invalid size: 0x10');
    });

    test('rejects surrounding whitespace', () => {
      expect(() => parseCliArgs(['bun.com', '--size', ' 64 '])).toThrow('Invalid size:');
    });

    test('rejects a decimal fraction', () => {
      expect(() => parseCliArgs(['bun.com', '--size', '12.5'])).toThrow('Invalid size: 12.5');
    });

    test('rejects zero', () => {
      expect(() => parseCliArgs(['bun.com', '--size', '0'])).toThrow('Invalid size: 0');
    });

    test('rejects a negative value as an unknown option', () => {
      expect(() => parseCliArgs(['bun.com', '--size', '-5'])).toThrow('Missing value for --size.');
    });

    test('accepts the maximum bound', () => {
      expect(parseCliArgs(['bun.com', '--size', String(MAX_CLI_SIZE)]).size).toBe(MAX_CLI_SIZE);
    });

    test('rejects a value above the maximum bound', () => {
      expect(() => parseCliArgs(['bun.com', '--size', String(MAX_CLI_SIZE + 1)])).toThrow(`Maximum is ${MAX_CLI_SIZE} pixels.`);
    });

    test('rejects an absurdly large value rather than emitting it', () => {
      expect(() => parseCliArgs(['bun.com', '--size', '999999999'])).toThrow(`Maximum is ${MAX_CLI_SIZE} pixels.`);
    });
  });

  describe('--force', () => {
    test('defaults to false', () => {
      expect(parseCliArgs(['bun.com']).force).toBe(false);
    });

    test('is set by --force', () => {
      expect(parseCliArgs(['bun.com', '--force']).force).toBe(true);
    });

    test('is set by -F', () => {
      expect(parseCliArgs(['bun.com', '-F']).force).toBe(true);
    });

    test('appears in the help text', () => {
      expect(helpText()).toContain('--force');
    });
  });

  describe('-- end-of-options separator', () => {
    test('a bare -- is not encoded as the url', () => {
      // Regression: `bun-qr -- hello` used to encode the literal string "--".
      expect(parseCliArgs(['--', 'hello']).url).toBe('hello');
    });

    test('everything after -- is positional', () => {
      expect(parseCliArgs(['--', '--format']).url).toBe('--format');
    });

    test('options before -- are still parsed', () => {
      const result = parseCliArgs(['--format', 'term', '--', 'bun.com']);
      expect(result.format).toBe('term');
      expect(result.url).toBe('bun.com');
    });

    test('-- alone is still a usage error', () => {
      expect(() => parseCliArgs(['--'])).toThrow(MissingUrlError);
    });

    test('a second -- is treated as positional data', () => {
      expect(parseCliArgs(['--', '--', 'x']).url).toBe('--');
    });
  });
});
