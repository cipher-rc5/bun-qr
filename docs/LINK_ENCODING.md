# Link & Data Encoding for QR Codes

This document explains how to use the link encoding utilities added to `bun-qr` for creating QR codes with various data types like URLs, contact information, WiFi credentials, and more.

## Overview

The `bun-qr/links` module formats payload strings for the QR encoder. Bun 1.4.2 or newer is required.
Support for each payload depends on the receiving scanner or application; the helpers do not open URLs,
connect to WiFi, or verify payment recipients. See the compatibility limits below.

## Quick Start

```typescript
import encode_qr from 'bun-qr';
import { encode_url } from 'bun-qr/links';

// Create a URL QR code
const url = encode_url('example.com');
const qr = encode_qr(url, 'svg', { border: 4 });
await Bun.write('qr.svg', qr);
```

## Available Encoders

### 1. URLs/Websites

Only HTTP and HTTPS are accepted. Explicit unsupported schemes are rejected before HTTPS is added.
`localhost:port` and dotted-hostname ports support shorthand; other single-label hosts with ports need explicit `http(s)://`.

```typescript
import { encode_url } from 'bun-qr/links';

// Automatically adds https:// prefix
const url = encode_url('example.com');
// Result: "https://example.com"

// Already has protocol
const url2 = encode_url('https://github.com/user/repo');
// Result: "https://github.com/user/repo"

// Disable auto protocol
const url3 = encode_url('http://example.com', { auto_protocol: false });
```

### 2. Email

Addresses use unquoted dot-atom syntax with DNS-style domains. Local-part URI punctuation is percent-encoded;
recipient strings cannot contain additional mailto fields. Subject, body, cc and bcc are encoded query values.
Only the primary `email` address is validated; `cc` and `bcc` strings are percent-encoded without recipient validation.

```typescript
import { encode_email } from 'bun-qr/links';

// Simple email
const email = encode_email('hello@example.com');
// Result: "mailto:hello@example.com"

// With subject and body
const email2 = encode_email('support@example.com', {
  subject: 'Support Request',
  body: 'I need help with...',
  cc: 'manager@example.com',
  bcc: 'archive@example.com'
});
```

### 3. Phone Numbers

Phone, SMS, vCard and WhatsApp helpers accept digits, spaces, parentheses, hyphens and at most one leading `+`.
Embedded/repeated plus signs and internal control characters are rejected. Leading/trailing whitespace is trimmed.
Formatting preserves the destination digits; helpers do not validate country codes or whether a number exists.

```typescript
import { encode_phone } from 'bun-qr/links';

const phone = encode_phone('+1-555-123-4567');
// Result: "tel:+15551234567"

const phone2 = encode_phone('(555) 123-4567');
// Result: "tel:5551234567"
```

### 4. SMS Messages

```typescript
import { encode_sms } from 'bun-qr/links';

// Phone only
const sms = encode_sms('+1-555-123-4567');
// Result: "sms:+15551234567"

// With pre-filled message
const sms2 = encode_sms('+1-555-123-4567', { body: 'Thanks for scanning! Reply YES to confirm.' });
```

### 5. vCard (Contact Information)

A vCard requires a display name: use `formatted_name`, personal name parts, or `organization` as a fallback.
Empty or nameless cards throw. vCard 4.0 phone values use `tel:` URIs; content lines are UTF-8 folded at 75 octets and terminated with CRLF.
Website fields follow the HTTP/HTTPS URL policy and are serialized as URIs; malformed URLs and embedded controls throw.
Free-text fields escape backslashes, commas, semicolons, and line breaks. All supplied fields reject ASCII controls
except tabs and line breaks, including controls in names before whitespace trimming. Errors identify the affected field.
Validate such fields before passing untrusted text to a scanner. `formatted_name` overrides the derived display name.

```typescript
import encode_qr from 'bun-qr';
import { encode_vcard } from 'bun-qr/links';

const contact = encode_vcard({
  first_name: 'John',
  last_name: 'Doe',
  organization: 'Acme Corporation',
  title: 'Senior Developer',
  phone: '+1-555-123-4567',
  email: 'john.doe@acme.com',
  url: 'https://acme.com',
  address: { street: '123 Main Street', city: 'San Francisco', state: 'CA', zip: '94102', country: 'USA' },
  note: 'Scan to add my contact info'
});

// Generate QR code with medium error correction
const qr = encode_qr(contact, 'svg', { ecc: 'medium', border: 4 });
```

### 6. WiFi Network Credentials

The defaults are `security: 'WPA'`, `password: ''`, and `hidden: false`.
SSID and password reject ASCII controls and escape payload delimiters. The helper does not validate password strength
or require a nonempty password for WPA/WEP. Use `security: 'nopass'` explicitly for open networks.

```typescript
import encode_qr from 'bun-qr';
import { encode_wifi } from 'bun-qr/links';

// WPA/WPA2 network
const wifi = encode_wifi({
  ssid: 'MyHomeNetwork',
  password: 'super_secret_password',
  security: 'WPA' // Options: 'WPA', 'WEP', 'nopass'
});

// Open network (no password)
const wifi_open = encode_wifi({ ssid: 'GuestNetwork', security: 'nopass' });

// Hidden network
const wifi_hidden = encode_wifi({ ssid: 'SecretNetwork', password: 'password123', security: 'WPA', hidden: true });

// Use high error correction for WiFi QR codes
const qr = encode_qr(wifi, 'svg', { ecc: 'high', border: 4 });
```

### 7. Geographic Locations

Latitude must be finite and in `[-90, 90]`; longitude must be finite and in `[-180, 180]`.
Altitude must be finite and uncertainty finite and nonnegative; both use meters.

Serialization follows [RFC 5870](https://www.rfc-editor.org/rfc/rfc5870.html#section-3.3):
uncertainty uses `;u=` and all numbers use decimal notation, including very small or large finite values.
Numeric values round-trip without rounding; zero uncertainty is distinct from omitted uncertainty.

```typescript
import { encode_geo } from 'bun-qr/links';

// Basic coordinates
const location = encode_geo({ latitude: 37.7749, longitude: -122.4194 });
// Result: "geo:37.7749,-122.4194"

// With altitude and uncertainty
const location2 = encode_geo({
  latitude: 37.7749,
  longitude: -122.4194,
  altitude: 10, // meters
  uncertainty: 5 // meters
});
// Result: "geo:37.7749,-122.4194,10;u=5"
```

### 8. Calendar Events

This helper emits a VEVENT fragment for QR scanners, rather than a complete `.ics` calendar file.
Dates are serialized in UTC with a four-digit year (0000–9999), timed values have second precision, and an optional end must be strictly later in the emitted format.
All-day end dates are exclusive: use the next UTC day for a one-day event. Content lines use CRLF and UTF-8-safe folding.
`all_day` defaults to `false`. Free-text fields reject forbidden ASCII controls, preserve tabs and escape delimiters and line breaks.
The fragment does not include a VCALENDAR wrapper, UID, or DTSTAMP; use a calendar library when producing a complete calendar file.

```typescript
import { encode_calendar_event } from 'bun-qr/links';

// Meeting with specific times
const meeting = encode_calendar_event({
  title: 'Team Standup',
  start: new Date('2024-02-15T09:00:00Z'),
  end: new Date('2024-02-15T09:30:00Z'),
  location: 'Conference Room A',
  description: 'Daily team sync'
});

// All-day event
const event = encode_calendar_event({ title: 'Company Retreat', start: new Date('2024-03-01'), all_day: true });
```

### 9. WhatsApp Messages

```typescript
import { encode_whatsapp } from 'bun-qr/links';

// Direct WhatsApp link
const whatsapp = encode_whatsapp('+1-555-123-4567');
// Result: "https://wa.me/15551234567"

// With pre-filled message
const whatsapp2 = encode_whatsapp('+1-555-123-4567', 'Hello! I found you via QR code.');
```

### 10. Bitcoin Payments

Amounts are decimal BTC in `[0, 21000000]` with at most eight decimal places. Sub-satoshi amounts and values that would
require rounding throw; calculate amounts without floating-point arithmetic drift. One satoshi is emitted as `0.00000001`.
An address may have one `bitcoin:` prefix, which is not duplicated. The helper checks the URI boundary;
the caller remains responsible for checking the address checksum, network and intended recipient.

```typescript
import encode_qr from 'bun-qr';
import { encode_bitcoin } from 'bun-qr/links';

// Address only
const btc = encode_bitcoin('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');

// With amount and message
const btc2 = encode_bitcoin('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {
  amount: 0.001,
  label: 'Coffee Donation',
  message: 'Thanks for the coffee!'
});

// Use quartile error correction for payment QR codes
const qr = encode_qr(btc2, 'svg', { ecc: 'quartile', border: 4 });
```

## Best Practices

### Error Correction Levels

Choose the error correction level for expected damage and payload capacity. Higher levels reduce available capacity;
they do not authenticate a WiFi network, contact, URL, or payment. The conventional recovery percentages are approximate:

- **Low (7%)**: Simple URLs, text content
- **Medium (15%)**: General purpose (default)
- **Quartile (25%)**: Important data like payments
- **High (30%)**: WiFi credentials, critical information

```typescript
import encode_qr from 'bun-qr';
import { encode_bitcoin, encode_url, encode_wifi } from 'bun-qr/links';

const wifi = encode_wifi({ ssid: 'MyNetwork', password: 'secret123' });
const bitcoin = encode_bitcoin('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
const url = encode_url('example.com');

// Critical data - use high ECC
const wifi_qr = encode_qr(wifi, 'svg', { ecc: 'high', border: 4 });

// Payment - use quartile ECC
const payment_qr = encode_qr(bitcoin, 'svg', { ecc: 'quartile', border: 4 });

// Simple URL - medium is fine
const url_qr = encode_qr(url, 'svg', { ecc: 'medium', border: 4 });
```

### Output Formats

Different formats for different use cases:

```typescript
import encode_qr from 'bun-qr';
import { encode_url } from 'bun-qr/links';

const url = encode_url('example.com');

// SVG - Scalable, best for printing
const svg = encode_qr(url, 'svg', { border: 4 });
await Bun.write('qr.svg', svg);

// GIF - Raster image for web
const gif = encode_qr(url, 'gif', { border: 4, scale: 4 });
await Bun.write('qr.gif', gif);

// ASCII - Terminal display, email
const ascii = encode_qr(url, 'ascii');
console.log(ascii);

// Terminal - Colored output
const term = encode_qr(url, 'term');
console.log(term);

// Raw - For custom processing
const raw = encode_qr(url, 'raw');
// Returns boolean[][]
```

### Border and Scale

The API and CLI default to a four-module quiet zone (`border: 4`) and `scale: 1`.
Explicit smaller library borders need additional clear space in the surrounding layout. See
[DENSO WAVE's margin guidance](https://www.qrcode.com/en/howto/code.html).
Border accepts integers `0`–`1024`, scale accepts integers `1`–`1024`, and the combined bitmap area
must stay at or below `16_000_000` cells. Scaling expands the bitmap and SVG viewBox; SVG display size is controlled by its container.

Adjust scale for different display contexts while preserving the quiet zone:

```typescript
import encode_qr from 'bun-qr';
import { encode_url } from 'bun-qr/links';

const url = encode_url('example.com');

// Large print display
const print_qr = encode_qr(url, 'svg', {
  border: 4, // Four-module quiet zone
  scale: 10 // Bigger modules
});

// Small mobile display
const mobile_qr = encode_qr(url, 'svg', {
  border: 4, // Preserve the four-module quiet zone
  scale: 4 // Smaller modules
});
```

## Examples

See complete working examples in:

- `examples/links.ts` - All link encoding types
- `examples/basic.ts` - Basic QR code generation

Run the examples:

```bash
bun run examples/links.ts
bun run examples/basic.ts
```

Generated QR codes will be saved in `examples/output/`.

## Validation

All helpers validate selected fields at runtime and throw for documented invalid inputs.
TypeScript also catches missing required fields before execution:

```typescript
import { encode_email, encode_geo, encode_phone, encode_wifi } from 'bun-qr/links';

// These will throw errors:
encode_email('invalid-email'); // Invalid email format
encode_phone('abc'); // Invalid phone number
encode_geo({ latitude: 100, longitude: 0 }); // Invalid coordinates
encode_wifi({ ssid: '' }); // Empty required ssid
```

## TypeScript Support

All functions are fully typed with detailed interfaces:

```typescript
import type { CalendarEventOptions, EmailOptions, GeoOptions, SmsOptions, UrlOptions, VCardOptions, WifiOptions } from 'bun-qr/links';
```

## Compatibility

Scanner support depends on the device, app, and payload type. Test with the intended receiver; no device/app
compatibility matrix is currently maintained. QR payload and GIF pixel tests use independent development-only decoders.
Those tests do not prove that a camera imports a contact, opens a calendar fragment, joins WiFi, or accepts a payment.

The decoder and browser scaffolds are excluded from the published package.

## Further Reading

- [QR Code Data Formats](https://github.com/zxing/zxing/wiki/Barcode-Contents)
- [vCard Format Specification (RFC 6350)](https://www.rfc-editor.org/rfc/rfc6350.html)
- [WiFi QR Code Format](https://github.com/zxing/zxing/wiki/Barcode-Contents#wi-fi-network-config-android-ios-11)
- [Geo URI Scheme (RFC 5870)](https://www.rfc-editor.org/rfc/rfc5870.html)
