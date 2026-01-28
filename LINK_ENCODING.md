# Link & Data Encoding for QR Codes

This document explains how to use the link encoding utilities added to `bun-qr` for creating QR codes with various data types like URLs, contact information, WiFi credentials, and more.

## Overview

The `bun-qr/links` module provides helper functions that format data according to standard QR code conventions. These utilities ensure your QR codes are compatible with popular scanning apps and devices.

## Quick Start

```typescript
import encode_qr from 'bun-qr';
import { encode_url, encode_vcard, encode_wifi } from 'bun-qr/links';

// Create a URL QR code
const url = encode_url('example.com');
const qr = encode_qr(url, 'svg');
await Bun.write('qr.svg', qr);
```

## Available Encoders

### 1. URLs/Websites

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

```typescript
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
const qr = encode_qr(contact, 'svg', { ecc: 'medium' });
```

### 6. WiFi Network Credentials

```typescript
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
const qr = encode_qr(wifi, 'svg', { ecc: 'high' });
```

### 7. Geographic Locations

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
// Result: "geo:37.7749,-122.4194,10?u=5"
```

### 8. Calendar Events

```typescript
import { encode_calendar_event } from 'bun-qr/links';

// Meeting with specific times
const meeting = encode_calendar_event({
  title: 'Team Standup',
  start: new Date('2024-02-15T09:00:00'),
  end: new Date('2024-02-15T09:30:00'),
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

```typescript
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
const qr = encode_qr(btc2, 'svg', { ecc: 'quartile' });
```

## Best Practices

### Error Correction Levels

Choose the appropriate error correction level based on use case:

- **Low (7%)**: Simple URLs, text content
- **Medium (15%)**: General purpose (default)
- **Quartile (25%)**: Important data like payments
- **High (30%)**: WiFi credentials, critical information

```typescript
// Critical data - use high ECC
const wifi_qr = encode_qr(wifi, 'svg', { ecc: 'high' });

// Payment - use quartile ECC
const payment_qr = encode_qr(bitcoin, 'svg', { ecc: 'quartile' });

// Simple URL - medium is fine
const url_qr = encode_qr(url, 'svg', { ecc: 'medium' });
```

### Output Formats

Different formats for different use cases:

```typescript
// SVG - Scalable, best for printing
const svg = encode_qr(url, 'svg', { scale: 10 });
await Bun.write('qr.svg', svg);

// GIF - Raster image for web
const gif = encode_qr(url, 'gif', { scale: 4 });
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

Adjust border and scale for different display contexts:

```typescript
// Large print display
const print_qr = encode_qr(url, 'svg', {
  border: 4, // Larger quiet zone
  scale: 10 // Bigger modules
});

// Small mobile display
const mobile_qr = encode_qr(url, 'svg', {
  border: 2, // Standard quiet zone
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

All encoding functions include validation:

```typescript
// These will throw errors:
encode_email('invalid-email'); // Invalid email format
encode_phone('abc'); // Invalid phone number
encode_geo({ latitude: 100, longitude: 0 }); // Invalid coordinates
encode_wifi({}); // Missing required ssid
```

## TypeScript Support

All functions are fully typed with detailed interfaces:

```typescript
import type { CalendarEventOptions, EmailOptions, GeoOptions, SmsOptions, UrlOptions, VCardOptions, WifiOptions } from 'bun-qr/links';
```

## Compatibility

These encoding formats follow standard conventions and work with:

- iOS Camera app
- Android Camera app
- QR code scanner apps
- WhatsApp, WeChat, and other messaging apps
- Payment apps (for Bitcoin)
- Contact management apps (for vCard)

## Further Reading

- [QR Code Data Formats](https://github.com/zxing/zxing/wiki/Barcode-Contents)
- [vCard Format Specification](https://en.wikipedia.org/wiki/VCard)
- [WiFi QR Code Format](https://github.com/zxing/zxing/wiki/Barcode-Contents#wi-fi-network-config-android-ios-11)
- [Geo URI Scheme](https://en.wikipedia.org/wiki/Geo_URI_scheme)
