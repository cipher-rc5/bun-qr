import { describe, expect, test } from 'bun:test';
import { encode_bitcoin, encode_calendar_event, encode_email, encode_geo, encode_phone, encode_sms, encode_url, encode_vcard, encode_whatsapp, encode_wifi, SAFE_URL_SCHEMES, validate_url } from '../src/links';

describe('SAFE_URL_SCHEMES allowlist', () => {
  // This allowlist is the security control that keeps dangerous URI schemes out of
  // generated QR codes. A scanned QR code is executed by whatever app reads it, so a
  // javascript: or data: payload is an injection vector.

  test('permits exactly http and https', () => {
    expect([...SAFE_URL_SCHEMES].sort()).toEqual(['http:', 'https:']);
  });

  test.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'javascript:void(0)',
    'data:text/html,<script>alert(1)</script>',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'file:///etc/passwd',
    'ftp://example.com/x',
    'vbscript:msgbox(1)',
    'blob:https://example.com/uuid',
    'about:blank',
    'chrome://settings'
  ])('validate_url rejects %s', (input) => {
    expect(validate_url(input)).toBe(false);
  });

  test.each(['http://example.com', 'https://example.com', 'https://example.com/path?q=1#frag', 'HTTPS://EXAMPLE.COM'])(
    'validate_url accepts %s',
    (input) => {
      expect(validate_url(input)).toBe(true);
    }
  );

  test('validate_url rejects malformed input instead of throwing', () => {
    expect(validate_url('not a url')).toBe(false);
    expect(validate_url('')).toBe(false);
  });

  describe('encode_url enforces the allowlist', () => {
    test.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'ftp://example.com'])(
      'throws on %s',
      (input) => {
        expect(() => encode_url(input)).toThrow(/Invalid URL/);
      }
    );

    test('a dangerous scheme is never rescued by auto_protocol', () => {
      // auto_protocol only prefixes when there is no scheme at all, so javascript:
      // must not become https://javascript:...
      expect(() => encode_url('javascript:alert(1)')).toThrow();
      expect(() => encode_url('javascript:alert(1)', { auto_protocol: true })).toThrow();
      expect(() => encode_url('javascript:alert(1)', { auto_protocol: false })).toThrow();
    });

    test('adds https to a bare host', () => {
      expect(encode_url('example.com')).toBe('https://example.com');
    });

    test('preserves an explicit scheme', () => {
      expect(encode_url('http://example.com')).toBe('http://example.com');
    });

    test('trims whitespace', () => {
      expect(encode_url('  example.com  ')).toBe('https://example.com');
    });

    test('rejects a bare host when auto_protocol is disabled', () => {
      expect(() => encode_url('example.com', { auto_protocol: false })).toThrow(/Invalid URL/);
    });
  });
});

describe('encode_phone', () => {
  test('strips formatting characters', () => {
    expect(encode_phone('+1-555-123-4567')).toBe('tel:+15551234567');
  });

  test('handles parentheses and spaces', () => {
    expect(encode_phone('(555) 123 4567')).toBe('tel:5551234567');
  });

  test('trims surrounding whitespace', () => {
    expect(encode_phone('  +15551234567  ')).toBe('tel:+15551234567');
  });

  test('rejects letters', () => {
    expect(() => encode_phone('555-CALL-NOW')).toThrow(/Invalid phone number/);
  });

  test('rejects an empty string', () => {
    expect(() => encode_phone('')).toThrow(/Invalid phone number/);
  });

  test('rejects an injected scheme', () => {
    expect(() => encode_phone('javascript:alert(1)')).toThrow(/Invalid phone number/);
  });
});

describe('encode_sms', () => {
  test('encodes a bare number', () => {
    expect(encode_sms('+1-555-123-4567')).toBe('sms:+15551234567');
  });

  test('appends a url-encoded body', () => {
    expect(encode_sms('+15551234567', { body: 'Hello there!' })).toBe('sms:+15551234567?body=Hello%20there!');
  });

  test('escapes ampersands in the body', () => {
    expect(encode_sms('+15551234567', { body: 'a&b=c' })).toBe('sms:+15551234567?body=a%26b%3Dc');
  });

  test('omits the body when empty', () => {
    expect(encode_sms('+15551234567', { body: '' })).toBe('sms:+15551234567');
  });

  test('rejects an invalid number', () => {
    expect(() => encode_sms('not-a-phone')).toThrow(/Invalid phone number/);
  });
});

describe('encode_vcard', () => {
  test('uses vCard 4.0 with CRLF line endings', () => {
    const out = encode_vcard({ first_name: 'John', last_name: 'Doe' });
    expect(out.startsWith('BEGIN:VCARD\r\nVERSION:4.0')).toBe(true);
    expect(out.endsWith('END:VCARD')).toBe(true);
    expect(out).toContain('\r\n');
  });

  test('builds N and FN from the name parts', () => {
    const out = encode_vcard({ first_name: 'John', last_name: 'Doe' });
    expect(out).toContain('N:Doe;John;;;');
    expect(out).toContain('FN:John Doe');
  });

  test('includes organization, title, phone, email, and url', () => {
    const out = encode_vcard({
      first_name: 'John',
      last_name: 'Doe',
      organization: 'Acme Inc',
      title: 'Engineer',
      phone: '+1-555-123-4567',
      email: 'john@example.com',
      url: 'https://example.com'
    });
    expect(out).toContain('ORG:Acme Inc');
    expect(out).toContain('TITLE:Engineer');
    expect(out).toContain('TEL;TYPE=voice:+15551234567');
    expect(out).toContain('EMAIL;TYPE=work:john@example.com');
    expect(out).toContain('URL;TYPE=work:https://example.com');
  });

  test('escapes commas, semicolons, and backslashes', () => {
    const out = encode_vcard({ organization: 'Acme, Inc; "Widgets\\Co"' });
    expect(out).toContain('ORG:Acme\\, Inc\\; "Widgets\\\\Co"');
  });

  test('escapes newlines in a note so they cannot inject vCard fields', () => {
    const out = encode_vcard({ note: 'line1\nEND:VCARD' });
    expect(out).toContain('NOTE:line1\\nEND:VCARD');
    // Only the real terminator ends the card.
    expect(out.match(/END:VCARD/g)?.length).toBe(2);
    expect(out.endsWith('END:VCARD')).toBe(true);
  });

  test('renders the structured address in RFC 6350 field order', () => {
    const out = encode_vcard({ address: { street: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701', country: 'USA' } });
    expect(out).toContain('ADR;TYPE=work:;;1 Main St;Springfield;IL;62701;USA');
  });

  test('rejects an invalid email', () => {
    expect(() => encode_vcard({ email: 'not-an-email' })).toThrow(/Invalid email in vCard/);
  });

  test('emits a minimal card when no fields are supplied', () => {
    expect(encode_vcard({})).toBe('BEGIN:VCARD\r\nVERSION:4.0\r\nEND:VCARD');
  });
});

describe('encode_wifi', () => {
  test('encodes a WPA network', () => {
    expect(encode_wifi({ ssid: 'MyNetwork', password: 'secret123', security: 'WPA' })).toBe('WIFI:T:WPA;S:MyNetwork;P:secret123;;');
  });

  test('marks hidden networks', () => {
    expect(encode_wifi({ ssid: 'Hidden', password: 'p', hidden: true })).toContain('H:true');
  });

  test('supports an open network', () => {
    expect(encode_wifi({ ssid: 'Open', security: 'nopass' })).toBe('WIFI:T:nopass;S:Open;P:;;');
  });

  test('escapes wifi metacharacters in the ssid and password', () => {
    const out = encode_wifi({ ssid: 'Net;work', password: 'pa\\ss":,' });
    expect(out).toContain('S:Net\\;work');
    expect(out).toContain('P:pa\\\\ss\\"\\:\\,');
  });

  test('requires an ssid', () => {
    expect(() => encode_wifi({ ssid: '' })).toThrow('WiFi SSID is required');
  });

  describe('control-character guards', () => {
    test.each([['null byte', 'Net\x00work'], ['tab', 'Net\tework'], ['newline', 'Net\nwork'], ['carriage return', 'Net\rwork'], [
      'escape',
      'Net\x1bwork'
    ], ['delete', 'Net\x7fwork']])('rejects a %s in the ssid', (_label, ssid) => {
      expect(() => encode_wifi({ ssid })).toThrow(/SSID contains invalid control characters/);
    });

    test.each([['null byte', 'pa\x00ss'], ['newline', 'pa\nss'], ['carriage return', 'pa\rss'], ['delete', 'pa\x7fss']])(
      'rejects a %s in the password',
      (_label, password) => {
        expect(() => encode_wifi({ ssid: 'Net', password })).toThrow(/password contains invalid control characters/);
      }
    );

    test('accepts ordinary printable and unicode characters', () => {
      expect(() => encode_wifi({ ssid: 'Café Wi-Fi ☕', password: 'pässwörd!' })).not.toThrow();
    });
  });
});

describe('encode_geo', () => {
  test('encodes latitude and longitude', () => {
    expect(encode_geo({ latitude: 37.7749, longitude: -122.4194 })).toBe('geo:37.7749,-122.4194');
  });

  test('appends altitude', () => {
    expect(encode_geo({ latitude: 37.7749, longitude: -122.4194, altitude: 10 })).toBe('geo:37.7749,-122.4194,10');
  });

  test('appends uncertainty as a parameter', () => {
    expect(encode_geo({ latitude: 1, longitude: 2, uncertainty: 50 })).toBe('geo:1,2?u=50');
  });

  test('accepts the boundary coordinates', () => {
    expect(encode_geo({ latitude: 90, longitude: 180 })).toBe('geo:90,180');
    expect(encode_geo({ latitude: -90, longitude: -180 })).toBe('geo:-90,-180');
  });

  test.each([91, -91])('rejects latitude %p', (latitude) => {
    expect(() => encode_geo({ latitude, longitude: 0 })).toThrow(/Invalid latitude/);
  });

  test.each([181, -181])('rejects longitude %p', (longitude) => {
    expect(() => encode_geo({ latitude: 0, longitude })).toThrow(/Invalid longitude/);
  });
});

describe('encode_calendar_event', () => {
  test('wraps the event in VEVENT delimiters', () => {
    const out = encode_calendar_event({ title: 'Sync', start: new Date('2024-02-01T14:00:00Z') });
    expect(out.startsWith('BEGIN:VEVENT')).toBe(true);
    expect(out.endsWith('END:VEVENT')).toBe(true);
  });

  test('formats timed events as basic-format UTC stamps', () => {
    const out = encode_calendar_event({
      title: 'Team Meeting',
      start: new Date('2024-02-01T14:00:00Z'),
      end: new Date('2024-02-01T15:00:00Z')
    });
    expect(out).toContain('DTSTART:20240201T140000Z');
    expect(out).toContain('DTEND:20240201T150000Z');
  });

  test('formats all-day events as DATE values', () => {
    const out = encode_calendar_event({
      title: 'Holiday',
      start: new Date('2024-02-01T14:00:00Z'),
      end: new Date('2024-02-02T14:00:00Z'),
      all_day: true
    });
    expect(out).toContain('DTSTART;VALUE=DATE:20240201');
    expect(out).toContain('DTEND;VALUE=DATE:20240202');
  });

  test('includes location and description', () => {
    const out = encode_calendar_event({
      title: 'Sync',
      start: new Date('2024-02-01T14:00:00Z'),
      location: 'Room A',
      description: 'Weekly sync'
    });
    expect(out).toContain('LOCATION:Room A');
    expect(out).toContain('DESCRIPTION:Weekly sync');
  });

  test('escapes the summary so it cannot inject calendar fields', () => {
    const out = encode_calendar_event({ title: 'A,B;C\nEND:VEVENT', start: new Date('2024-02-01T14:00:00Z') });
    expect(out).toContain('SUMMARY:A\\,B\\;C\\nEND:VEVENT');
    expect(out.match(/END:VEVENT/g)?.length).toBe(2);
  });

  test('omits DTEND when no end is given', () => {
    const out = encode_calendar_event({ title: 'Sync', start: new Date('2024-02-01T14:00:00Z') });
    expect(out).not.toContain('DTEND');
  });
});

describe('encode_whatsapp', () => {
  test('builds a wa.me link without the leading plus', () => {
    expect(encode_whatsapp('+15551234567')).toBe('https://wa.me/15551234567');
  });

  test('appends a url-encoded message', () => {
    expect(encode_whatsapp('+15551234567', 'Hello from QR code!')).toBe('https://wa.me/15551234567?text=Hello%20from%20QR%20code!');
  });

  test('strips formatting characters', () => {
    expect(encode_whatsapp('+1 (555) 123-4567')).toBe('https://wa.me/15551234567');
  });

  test('rejects an invalid phone number', () => {
    expect(() => encode_whatsapp('not-a-phone')).toThrow(/Invalid phone number/);
  });

  test('omits the text parameter when the message is empty', () => {
    expect(encode_whatsapp('+15551234567', '')).toBe('https://wa.me/15551234567');
  });
});

describe('encode_bitcoin', () => {
  const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

  test('encodes a bare address', () => {
    expect(encode_bitcoin(address)).toBe(`bitcoin:${address}`);
  });

  test('appends amount, label, and message in order', () => {
    expect(encode_bitcoin(address, { amount: 0.001, label: 'Donation', message: 'Thanks!' })).toBe(
      `bitcoin:${address}?amount=0.001&label=Donation&message=Thanks!`
    );
  });

  test('url-encodes label and message', () => {
    expect(encode_bitcoin(address, { label: 'A B&C' })).toBe(`bitcoin:${address}?label=A%20B%26C`);
  });

  test('includes a zero amount', () => {
    expect(encode_bitcoin(address, { amount: 0 })).toBe(`bitcoin:${address}?amount=0`);
  });

  test('requires an address', () => {
    expect(() => encode_bitcoin('')).toThrow('Bitcoin address is required');
  });
});

describe('encode_email', () => {
  test('encodes a bare address', () => {
    expect(encode_email('hello@example.com')).toBe('mailto:hello@example.com');
  });

  test('appends subject, body, cc, and bcc', () => {
    expect(encode_email('a@b.com', { subject: 'Hi', body: 'Yo', cc: 'c@d.com', bcc: 'e@f.com' })).toBe(
      'mailto:a@b.com?subject=Hi&body=Yo&cc=c%40d.com&bcc=e%40f.com'
    );
  });

  test.each(['not-an-email', 'a@b', 'a b@c.com', ''])('rejects %p', (input) => {
    expect(() => encode_email(input)).toThrow(/Invalid email address/);
  });
});
