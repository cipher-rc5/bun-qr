import { describe, expect, test } from 'bun:test';
import { encode_bitcoin, encode_calendar_event, encode_email, encode_geo, encode_phone, encode_sms, encode_url, encode_vcard, encode_whatsapp } from '../src/links';

describe('RFC 5870 geographic URI grammar', () => {
  // RFC 5870 section 3.3: coordinates use signed decimals; uncertainty uses an
  // unsigned decimal semicolon parameter. No query, exponent or plus syntax.
  const grammar = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(-?\d+(?:\.\d+)?))?(?:;u=(\d+(?:\.\d+)?))?$/;
  test.each([1e-7, -1e-7, Number.MIN_VALUE, -Number.MIN_VALUE, 1.0000000000000002e-7, 89.99999999999999])(
    'round-trips coordinate %p through decimal-only syntax',
    (value) => {
      const result = grammar.exec(encode_geo({ latitude: value, longitude: value }));
      expect(result).not.toBeNull();
      expect(Number(result![1])).toBe(value);
      expect(Number(result![2])).toBe(value);
    }
  );
  test.each([Number.MIN_VALUE, -Number.MIN_VALUE, 1e21, -1e21, 1.2345678901234568e21, Number.MAX_VALUE, -Number.MAX_VALUE])(
    'preserves finite altitude %p without exponent notation',
    (altitude) => {
      const result = grammar.exec(encode_geo({ latitude: 1, longitude: 2, altitude }));
      expect(result).not.toBeNull();
      expect(Number(result![3])).toBe(altitude);
    }
  );
  test.each([0, Number.MIN_VALUE, 1e-7, 1e21, Number.MAX_VALUE])('preserves uncertainty %p as a decimal parameter', (uncertainty) => {
    const result = grammar.exec(encode_geo({ latitude: 1, longitude: 2, uncertainty }));
    expect(result).not.toBeNull();
    expect(Number(result![4])).toBe(uncertainty);
  });
  test('distinguishes absent uncertainty from zero and normalizes negative zero', () => {
    expect(encode_geo({ latitude: 1, longitude: 2 })).toBe('geo:1,2');
    expect(encode_geo({ latitude: -0, longitude: -0, altitude: -0, uncertainty: -0 })).toBe('geo:0,0,0;u=0');
    expect(encode_geo({ latitude: 1, longitude: 2, uncertainty: 50 })).toBe('geo:1,2;u=50');
  });
});

describe('vCard/calendar content text boundaries', () => {
  const fields: [string, (text: string) => string][] = [
    ...(['formatted_name', 'first_name', 'last_name', 'organization', 'title', 'note'] as const).map(field =>
      [`vCard ${field}`, (text: string) => encode_vcard({ formatted_name: 'Contact', [field]: text })] as [string, (text: string) => string]
    ),
    ...(['street', 'city', 'state', 'zip', 'country'] as const).map(field =>
      [`vCard address.${field}`, (text: string) => encode_vcard({ formatted_name: 'Contact', address: { [field]: text } })] as [
        string,
        (text: string) => string
      ]
    ),
    ...(['title', 'location', 'description'] as const).map(field =>
      [
        `calendar ${field}`,
        (text: string) => encode_calendar_event({ title: 'Meeting', start: new Date('2026-10-10'), [field]: text })
      ] as [string, (text: string) => string]
    )
  ];
  const forbidden = Array.from({ length: 33 }, (_, code) => code === 32 ? 127 : code).filter(code => ![9, 10, 13].includes(code));
  test.each(fields)('rejects every forbidden ASCII control in %s before trimming or serialization', (field, encode) => {
    for (const code of forbidden) {
      const control = String.fromCharCode(code);
      for (const text of [control, `${control}Text`, `A${control}B`, `Text${control}`]) {
        expect(() => encode(text)).toThrow(`Invalid ${field}: contains forbidden control characters`);
      }
    }
  });
  test.each(fields)('retains allowed tabs and escapes all newline forms in %s', (_field, encode) => {
    expect(encode('A\tB\r\nC\rD\nE')).toContain('A\tB\\nC\\nD\\nE');
  });
});

describe('recipient URI boundaries', () => {
  test.each([
    'alice@example.com?bcc=attacker%40example.org',
    'alice@example.com#fragment',
    'alice@example.com%3Fsubject=forged',
    'alice@example.com&body=forged',
    'alice@example.com/extra',
    'a,b@example.com',
    '.alice@example.com',
    'alice..name@example.com'
  ])('rejects malformed recipient %s', (address) => {
    expect(() => encode_email(address)).toThrow(/Invalid email/);
  });
  test.each(['alice+tag@example.com', 'alice?tag@example.com', 'alice#tag@example.com', 'alice%tag@example.com'])(
    'encodes local-part punctuation in %s',
    (address) => {
      const uri = new URL(encode_email(address, { subject: 'Approved', body: 'a&bcc=forged' }));
      expect(uri.hash).toBe('');
      expect(decodeURIComponent(uri.pathname)).toBe(address);
      expect([...uri.searchParams.keys()]).toEqual(['subject', 'body']);
      expect(uri.searchParams.get('body')).toBe('a&bcc=forged');
    }
  );
});

describe('URL scheme policy', () => {
  test.each([
    'mailto:alice@example.com',
    'tel:+15551234567',
    'javascript:123',
    'tel:123',
    'mailto:123',
    'custom+qr:payload',
    'custom.qr:payload',
    'custom-qr://example.com'
  ])('rejects an explicit unsupported scheme %s', (input) => {
    expect(() => encode_url(input)).toThrow(/Invalid URL/);
    expect(() => encode_url(input, { auto_protocol: false })).toThrow(/Invalid URL/);
  });
  test('retains bare host:port input', () => {
    expect(encode_url('localhost:3000/path')).toBe('https://localhost:3000/path');
    expect(encode_url('example.com:3000/path')).toBe('https://example.com:3000/path');
  });
});

describe('UTF-8 content-line folding', () => {
  test('serializes a validated vCard website as a URI, without TEXT escapes', () => {
    const value = encode_vcard({ formatted_name: 'Contact', url: 'https://example.com/a,b;c?x=1&y=2' });
    expect(value).toContain('URL;TYPE=work:https://example.com/a,b;c?x=1&y=2\r\n');
    expect(encode_vcard({ formatted_name: 'Contact', url: 'https://example.com/a b' })).toContain('https://example.com/a%20b');
  });
  test.each(['not a URL', 'javascript:alert(1)', 'https://example.com/\nX-EVIL:1'])('rejects vCard website %p', (url) => {
    expect(() => encode_vcard({ formatted_name: 'Contact', url })).toThrow(/Invalid URL/);
  });
  test('folds at 75 octets without splitting multibyte characters', () => {
    const note = '🙂 café '.repeat(25);
    const value = encode_vcard({ formatted_name: 'Contact', note });
    for (const line of value.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      expect(line).not.toContain('\ufffd');
    }
    expect(value.replaceAll('\r\n ', '')).toContain(`NOTE:${note}`);
    expect(value.endsWith('\r\n')).toBe(true);
  });
  test('folds a calendar summary and keeps escaped newlines as data', () => {
    const title = `${'a'.repeat(76)}\nInjected`;
    const value = encode_calendar_event({ title, start: new Date('2026-10-10') });
    expect(value.replaceAll('\r\n ', '')).toContain(`SUMMARY:${'a'.repeat(76)}\\nInjected`);
    expect(value.endsWith('\r\n')).toBe(true);
  });
});

describe('normalized phone destinations', () => {
  test.each(['12+34', '++15551234567', '(+)1555', '1\t555', '1\r\n555', '1-+555'])('rejects %p consistently', (phone) => {
    for (const helper of [encode_phone, encode_sms, encode_whatsapp]) {
      expect(() => helper(phone)).toThrow(/Invalid phone/);
    }
    expect(() => encode_vcard({ formatted_name: 'Contact', phone })).toThrow(/Invalid phone/);
  });
  test('retains formatting support without changing digits', () => {
    const phone = ' +1 (555) 123-4567 ';
    expect(encode_phone(phone)).toBe('tel:+15551234567');
    expect(encode_sms(phone)).toBe('sms:+15551234567');
    expect(encode_whatsapp(phone)).toBe('https://wa.me/15551234567');
    expect(encode_vcard({ formatted_name: 'Contact', phone })).toContain('TEL;TYPE=voice:tel:+15551234567');
  });
});

describe('calendar endpoint representation', () => {
  test.each(['-000001-01-01T00:00:00Z', '+010000-01-01T00:00:00Z'])(
    'rejects years outside the four-digit calendar representation: %s',
    (value) => {
      const date = new Date(value);
      for (const all_day of [false, true]) {
        expect(() => encode_calendar_event({ title: 'event', start: date, all_day })).toThrow(/four-digit UTC year/);
        expect(() => encode_calendar_event({ title: 'event', start: new Date('2026-01-01T00:00:00Z'), end: date, all_day })).toThrow(
          /four-digit UTC year/
        );
      }
    }
  );
  const start = new Date('2026-10-10T10:00:00Z');
  test.each([new Date('2026-10-09'), start, new Date('2026-10-10T10:00:00.999Z')])(
    'rejects an end not later at second precision: %p',
    (end) => {
      expect(() => encode_calendar_event({ title: 'Meeting', start, end })).toThrow(/end must be after start/);
    }
  );
  test('rejects the same UTC day for an all-day exclusive end', () => {
    expect(() => encode_calendar_event({ title: 'Day', start, end: new Date('2026-10-10T23:59:59Z'), all_day: true })).toThrow(
      /end must be after start/
    );
  });
  test('accepts the next UTC day and emits CRLF', () => {
    const value = encode_calendar_event({ title: 'Day', start, end: new Date('2026-10-11'), all_day: true });
    expect(value).toContain('DTEND;VALUE=DATE:20261011');
    expect(value.replaceAll('\r\n', '')).not.toContain('\n');
  });
});

describe('Bitcoin decimal amounts', () => {
  const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  test.each([[0, '0'], [0.00000001, '0.00000001'], [0.29, '0.29'], [1.23456789, '1.23456789'], [21_000_000, '21000000']])(
    'writes decimal BTC %p as %s',
    (amount, value) => {
      expect(encode_bitcoin(address, { amount: amount as number })).toBe(`bitcoin:${address}?amount=${value}`);
    }
  );
  test.each([1e-9, 1.234567895, 0.1 + 0.2, 21_000_000.00000001, 1e21])('rejects %p rather than silently rounding', (amount) => {
    expect(() => encode_bitcoin(address, { amount })).toThrow(/Invalid Bitcoin amount/);
  });
  test('rejects a nested or malformed address prefix', () => {
    expect(() => encode_bitcoin(`bitcoin:bitcoin:${address}`)).toThrow(/Invalid Bitcoin address/);
    expect(() => encode_bitcoin('bitcoin:')).toThrow(/address is required/);
  });
});
