import { describe, expect, test } from 'bun:test';
import { encode_bitcoin, encode_calendar_event, encode_email, encode_phone, encode_sms, encode_url, encode_vcard, encode_whatsapp } from '../src/links';

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
