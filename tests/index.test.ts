import { describe, expect, test } from 'bun:test';
import encode_qr from '../src/index';
import { encode_email, encode_url, encode_wifi } from '../src/links';

type QrFixtureOutput = 'ascii' | 'svg' | 'gif';

interface QrFixtureCase {
  readonly id: string;
  readonly input: string;
  readonly output: QrFixtureOutput;
  readonly expected: { readonly length: number, readonly sha256: string };
}

interface QrFixtureFile {
  readonly cases: readonly QrFixtureCase[];
}

interface LinkFixtureFile {
  readonly url: { readonly input: string, readonly expected: string };
  readonly email: {
    readonly input: { readonly address: string, readonly options: { readonly subject: string, readonly body: string } },
    readonly expected: string
  };
  readonly wifi: {
    readonly input: { readonly ssid: string, readonly password: string, readonly security: 'WPA' | 'WEP' | 'nopass' },
    readonly expected: string
  };
}

const qrFixtures = await Bun.file(new URL('./fixtures/qr-fixtures.json', import.meta.url)).json() as QrFixtureFile;
const linkFixtures = await Bun.file(new URL('./fixtures/link-fixtures.json', import.meta.url)).json() as LinkFixtureFile;

describe('fixtures: qr encoding', () => {
  for (const fixture of qrFixtures.cases) {
    test(`matches fixture: ${fixture.id}`, async () => {
      const output = encodeFixtureOutput(fixture.input, fixture.output);
      const length = typeof output === 'string' ? output.length : output.length;
      const bytes = toBytes(output);
      const hash = await sha256(bytes);

      expect(length).toBe(fixture.expected.length);
      expect(hash).toBe(fixture.expected.sha256);
    });
  }
});

describe('fixtures: link encoding', () => {
  test('matches URL fixture', () => {
    expect(encode_url(linkFixtures.url.input)).toBe(linkFixtures.url.expected);
  });

  test('matches email fixture', () => {
    expect(encode_email(linkFixtures.email.input.address, linkFixtures.email.input.options)).toBe(linkFixtures.email.expected);
  });

  test('matches WiFi fixture', () => {
    expect(encode_wifi(linkFixtures.wifi.input)).toBe(linkFixtures.wifi.expected);
  });
});

function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? new TextEncoder().encode(value) : value;
}

function encodeFixtureOutput(input: string, output: QrFixtureOutput): string | Uint8Array {
  if (output === 'ascii') {
    return encode_qr(input, 'ascii');
  }
  if (output === 'svg') {
    return encode_qr(input, 'svg');
  }
  return encode_qr(input, 'gif');
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const data = new Uint8Array(bytes.length);
  data.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
