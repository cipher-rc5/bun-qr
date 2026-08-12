import { describe, expect, test } from 'bun:test';
import { encode_bitcoin, encode_calendar_event, encode_email, encode_geo, encode_phone, encode_sms, encode_url, encode_vcard, encode_whatsapp, encode_wifi, SAFE_URL_SCHEMES, validate_url, WIFI_SECURITY_TYPES } from '../src/links';

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

  test.each(['()', '(  )', '   ', '+', '-- --'])('rejects digitless input %p instead of emitting a bare tel:', (input) => {
    // These pass the character allowlist but strip down to nothing, which used to
    // produce "tel:" with no number at all.
    expect(() => encode_phone(input)).toThrow(/Invalid phone number/);
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

  describe('property injection guards', () => {
    test('escapes the url so a CRLF cannot inject a property line', () => {
      const out = encode_vcard({ first_name: 'A', last_name: 'B', url: 'https://x/\r\nX-EVIL:1' });
      expect(out).toContain('URL;TYPE=work:https://x/\\nX-EVIL:1');
      // No real property line was created.
      expect(out).not.toContain('\r\nX-EVIL:1');
      expect(out.split('\r\n').some((line) => line.startsWith('X-EVIL'))).toBe(false);
    });

    test('escapes a bare CR so it cannot terminate a property line', () => {
      const out = encode_vcard({ first_name: 'A', last_name: 'B', organization: 'Acme\rTEL:911' });
      expect(out).toContain('ORG:Acme\\nTEL:911');
      expect(out).not.toContain('\r' + 'TEL:911');
    });

    test('escapes CRLF as a single \\n rather than doubling it', () => {
      const out = encode_vcard({ organization: 'Acme\r\nTEL:911' });
      expect(out).toContain('ORG:Acme\\nTEL:911');
      expect(out).not.toContain('ORG:Acme\\n\\nTEL:911');
      // The only CRLFs left are the real line separators.
      expect(out).toBe('BEGIN:VCARD\r\nVERSION:4.0\r\nORG:Acme\\nTEL:911\r\nEND:VCARD');
    });

    test.each([['CRLF', '\r\n'], ['bare CR', '\r'], ['bare LF', '\n']])('escapes a %s in a note', (_label, sep) => {
      const out = encode_vcard({ note: `a${sep}b` });
      expect(out).toContain('NOTE:a\\nb');
      expect(out.split('\r\n').filter(Boolean).length).toBe(4);
    });

    test('escapes line breaks in every free-text field', () => {
      const out = encode_vcard({
        first_name: 'A\r\nX-F:1',
        last_name: 'B\r\nX-L:1',
        organization: 'O\r\nX-O:1',
        title: 'T\r\nX-T:1',
        url: 'https://u/\r\nX-U:1',
        note: 'N\r\nX-N:1',
        address: { street: 'S\r\nX-S:1', city: 'C\r\nX-C:1', state: 'ST\r\nX-ST:1', zip: 'Z\r\nX-Z:1', country: 'CO\r\nX-CO:1' }
      });
      // Every line is a known vCard property; nothing injected.
      for (const line of out.split('\r\n')) {
        expect(line).toMatch(/^(BEGIN|VERSION|N|FN|ORG|TITLE|URL|ADR|NOTE|END)[;:]/);
      }
    });

    test('leaves the phone and email fields injection-proof', () => {
      // TEL is stripped to digits and a leading plus; EMAIL is regex-validated.
      expect(encode_vcard({ phone: '+1-555\r\nX-EVIL:1' })).toContain('TEL;TYPE=voice:+1555');
      expect(() => encode_vcard({ email: 'a@b.com\r\nX-EVIL:1' })).toThrow(/Invalid email in vCard/);
    });
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

  describe('security type allowlist', () => {
    // `security` is interpolated into the T: field verbatim, and the TS union is erased
    // at runtime, so an unvalidated value could forge the rest of the payload.
    test('rejects a value that forges a second SSID field', () => {
      expect(() => encode_wifi({ ssid: 's', password: 'p', security: 'WPA;S:Evil' as never })).toThrow(
        'Invalid security=WPA;S:Evil. Expected one of WPA, WEP, nopass'
      );
    });

    test.each(['wpa', 'WPA2', '', 'nopass;H:true', 'WEP;;'])('rejects security %p', (security) => {
      expect(() => encode_wifi({ ssid: 's', security: security as never })).toThrow(/Invalid security=/);
    });

    test.each(['WPA', 'WEP', 'nopass'] as const)('accepts security %p', (security) => {
      expect(encode_wifi({ ssid: 's', password: 'p', security })).toBe(`WIFI:T:${security};S:s;P:p;;`);
    });

    test('exports the allowlist', () => {
      expect([...WIFI_SECURITY_TYPES]).toEqual(['WPA', 'WEP', 'nopass']);
    });
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

  describe('non-finite guards', () => {
    // A bare `< || >` range check lets NaN through (it fails both comparisons) and lets
    // one side of Infinity through, so these used to reach the payload verbatim.
    test.each([NaN, Infinity, -Infinity])('rejects latitude %p', (latitude) => {
      expect(() => encode_geo({ latitude, longitude: 0 })).toThrow(/Invalid latitude/);
    });

    test.each([NaN, Infinity, -Infinity])('rejects longitude %p', (longitude) => {
      expect(() => encode_geo({ latitude: 0, longitude })).toThrow(/Invalid longitude/);
    });

    test('rejects NaN coordinates rather than emitting geo:NaN,NaN', () => {
      expect(() => encode_geo({ latitude: NaN, longitude: NaN })).toThrow(
        'Invalid latitude: NaN. Must be a finite number between -90 and 90'
      );
    });

    test.each([NaN, Infinity, -Infinity])('rejects altitude %p', (altitude) => {
      expect(() => encode_geo({ latitude: 1, longitude: 2, altitude })).toThrow(/Invalid altitude/);
    });

    test.each([NaN, Infinity, -1])('rejects uncertainty %p', (uncertainty) => {
      expect(() => encode_geo({ latitude: 1, longitude: 2, uncertainty })).toThrow(/Invalid uncertainty/);
    });

    test('still accepts a zero and a negative altitude', () => {
      expect(encode_geo({ latitude: 1, longitude: 2, altitude: 0 })).toBe('geo:1,2,0');
      expect(encode_geo({ latitude: 1, longitude: 2, altitude: -50 })).toBe('geo:1,2,-50');
    });

    test('still accepts a zero uncertainty', () => {
      expect(encode_geo({ latitude: 1, longitude: 2, uncertainty: 0 })).toBe('geo:1,2?u=0');
    });
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

  describe('invalid date guards', () => {
    // A bad Date used to leak a raw RangeError from toISOString on the timed branch and
    // silently emit an empty DTSTART on the all-day branch. Both now fail identically.
    test('rejects an invalid start with a named error', () => {
      expect(() => encode_calendar_event({ title: 'x', start: new Date('nope') })).toThrow(
        'Invalid calendar event start: Invalid Date. Expected a valid Date'
      );
    });

    test('rejects an invalid end with a named error', () => {
      expect(() => encode_calendar_event({ title: 'x', start: new Date('2024-02-01T14:00:00Z'), end: new Date('nope') })).toThrow(
        'Invalid calendar event end: Invalid Date. Expected a valid Date'
      );
    });

    test.each([false, true])('fails the same way with all_day=%p', (all_day) => {
      expect(() => encode_calendar_event({ title: 'x', start: new Date('nope'), all_day })).toThrow(
        'Invalid calendar event start: Invalid Date. Expected a valid Date'
      );
    });

    test('never emits an empty DTSTART', () => {
      expect(() => encode_calendar_event({ title: 'x', start: new Date('nope'), all_day: true })).toThrow(/Invalid calendar event start/);
    });
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

  test.each(['  ', '()', '+'])('rejects digitless input %p instead of emitting a bare wa.me link', (input) => {
    expect(() => encode_whatsapp(input)).toThrow(/Invalid phone number/);
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

  describe('address validation', () => {
    test('rejects an address carrying its own query string', () => {
      // BIP-21 parsers split on the first `?`, so the smuggled amount would have won.
      expect(() => encode_bitcoin('addr?amount=999&x=1', { amount: 0.1 })).toThrow(
        "Invalid Bitcoin address: addr?amount=999&x=1. Expected only alphanumeric characters, ':', or '-'"
      );
    });

    test.each(['addr?amount=999', 'addr&amount=999', 'addr#frag', 'a b', 'addr\r\nX', 'addr/../x', 'addr%3F'])('rejects %p', (input) => {
      expect(() => encode_bitcoin(input)).toThrow(/Invalid Bitcoin address/);
    });

    test.each(['   ', '\t', '\n'])('rejects whitespace-only address %p', (input) => {
      expect(() => encode_bitcoin(input)).toThrow('Bitcoin address is required');
    });

    test('trims surrounding whitespace', () => {
      expect(encode_bitcoin(`  ${address}  `)).toBe(`bitcoin:${address}`);
    });

    test('accepts a bech32 address', () => {
      const bech32 = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
      expect(encode_bitcoin(bech32)).toBe(`bitcoin:${bech32}`);
    });

    test('preserves a literal colon in the address prefix', () => {
      expect(encode_bitcoin('bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe('bitcoin:bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    });
  });

  describe('amount validation', () => {
    test.each([NaN, Infinity, -Infinity, -1, -0.0001])('rejects amount %p', (amount) => {
      expect(() => encode_bitcoin(address, { amount })).toThrow(/Invalid Bitcoin amount/);
    });

    test('names the field and expectation', () => {
      expect(() => encode_bitcoin(address, { amount: NaN })).toThrow(
        'Invalid Bitcoin amount: NaN. Must be a finite non-negative number of BTC'
      );
    });
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
