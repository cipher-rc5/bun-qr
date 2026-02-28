import { describe, expect, test } from 'bun:test';
import { helpText, parseCliArgs } from '../src/cli/args-parser';

describe('parseCliArgs', () => {
  test('parses url with defaults', () => {
    const result = parseCliArgs(['https://bun.com']);
    expect(result).toEqual({ url: 'https://bun.com', format: 'svg' });
  });

  test('parses explicit format and output', () => {
    const result = parseCliArgs(['bun.com', '--format', 'gif', '--output', 'bun.gif']);
    expect(result).toEqual({ url: 'bun.com', format: 'gif', outputPath: 'bun.gif' });
  });

  test('throws help text when no url is provided', () => {
    expect(() => parseCliArgs([])).toThrow(helpText());
  });

  test('throws help text when --help is provided', () => {
    expect(() => parseCliArgs(['--help'])).toThrow(helpText());
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
});
