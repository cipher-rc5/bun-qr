// file: examples/links.ts
// description: Examples of encoding links and structured data in QR codes

import encode_qr from '../src/index';
import { encode_bitcoin, encode_calendar_event, encode_email, encode_geo, encode_phone, encode_sms, encode_url, encode_vcard, encode_whatsapp, encode_wifi } from '../src/links';

console.log('=== QR Code Link Encoding Examples ===\n');

// 1. URL/Website Links
console.log('1. URL Examples:');
const website_url = encode_url('example.com');
console.log(`  Simple URL: ${website_url}`);

const full_url = encode_url('https://github.com/user/repo');
console.log(`  Full URL: ${full_url}`);

// Generate QR code for URL
const url_qr = encode_qr(website_url, 'svg', { ecc: 'medium' });
await Bun.write('examples/output/url_qr.svg', url_qr);
console.log('  ✓ Generated: examples/output/url_qr.svg\n');

// 2. Email Links
console.log('2. Email Examples:');
const simple_email = encode_email('hello@example.com');
console.log(`  Simple email: ${simple_email}`);

const email_with_subject = encode_email('support@example.com', {
  subject: 'QR Code Inquiry',
  body: 'I scanned your QR code and would like more information.'
});
console.log(`  Email with subject: ${email_with_subject}`);

const email_qr = encode_qr(email_with_subject, 'svg');
await Bun.write('examples/output/email_qr.svg', email_qr);
console.log('  ✓ Generated: examples/output/email_qr.svg\n');

// 3. Phone Number Links
console.log('3. Phone Examples:');
const phone_link = encode_phone('+1-555-123-4567');
console.log(`  Phone link: ${phone_link}`);

const phone_qr = encode_qr(phone_link, 'svg');
await Bun.write('examples/output/phone_qr.svg', phone_qr);
console.log('  ✓ Generated: examples/output/phone_qr.svg\n');

// 4. SMS Links
console.log('4. SMS Examples:');
const sms_link = encode_sms('+1-555-123-4567', { body: 'Thanks for scanning! Reply YES to confirm.' });
console.log(`  SMS link: ${sms_link}`);

const sms_qr = encode_qr(sms_link, 'svg');
await Bun.write('examples/output/sms_qr.svg', sms_qr);
console.log('  ✓ Generated: examples/output/sms_qr.svg\n');

// 5. vCard (Contact Information)
console.log('5. vCard Contact Examples:');
const contact_vcard = encode_vcard({
  first_name: 'John',
  last_name: 'Doe',
  organization: 'Acme Corporation',
  title: 'Senior Developer',
  phone: '+1-555-123-4567',
  email: 'john.doe@acme.com',
  url: 'https://acme.com',
  address: { street: '123 Main Street', city: 'San Francisco', state: 'CA', zip: '94102', country: 'USA' },
  note: 'Scan to add contact info'
});
console.log(`  vCard:\n${contact_vcard.split('\n').map(l => '    ' + l).join('\n')}`);

const vcard_qr = encode_qr(contact_vcard, 'svg', { ecc: 'medium' });
await Bun.write('examples/output/vcard_qr.svg', vcard_qr);
console.log('  ✓ Generated: examples/output/vcard_qr.svg\n');

// 6. WiFi Network
console.log('6. WiFi Network Examples:');
const wifi_wpa = encode_wifi({ ssid: 'MyHomeNetwork', password: 'super_secret_password', security: 'WPA' });
console.log(`  WPA WiFi: ${wifi_wpa}`);

const wifi_open = encode_wifi({ ssid: 'GuestNetwork', security: 'nopass' });
console.log(`  Open WiFi: ${wifi_open}`);

const wifi_qr = encode_qr(wifi_wpa, 'svg', { ecc: 'high' });
await Bun.write('examples/output/wifi_qr.svg', wifi_qr);
console.log('  ✓ Generated: examples/output/wifi_qr.svg\n');

// 7. Geographic Location
console.log('7. Geographic Location Examples:');
const location = encode_geo({ latitude: 37.7749, longitude: -122.4194, altitude: 10, uncertainty: 5 });
console.log(`  Geo location: ${location}`);

const geo_qr = encode_qr(location, 'svg');
await Bun.write('examples/output/geo_qr.svg', geo_qr);
console.log('  ✓ Generated: examples/output/geo_qr.svg\n');

// 8. Calendar Event
console.log('8. Calendar Event Examples:');
const meeting = encode_calendar_event({
  title: 'Team Standup',
  start: new Date('2024-02-15T09:00:00'),
  end: new Date('2024-02-15T09:30:00'),
  location: 'Conference Room A',
  description: 'Daily team synchronization meeting'
});
console.log(`  Calendar event:\n${meeting.split('\n').map(l => '    ' + l).join('\n')}`);

const event_qr = encode_qr(meeting, 'svg', { ecc: 'medium' });
await Bun.write('examples/output/event_qr.svg', event_qr);
console.log('  ✓ Generated: examples/output/event_qr.svg\n');

// 9. WhatsApp Message
console.log('9. WhatsApp Examples:');
const whatsapp_link = encode_whatsapp('+1-555-123-4567', 'Hello! I found you via QR code.');
console.log(`  WhatsApp link: ${whatsapp_link}`);

const whatsapp_qr = encode_qr(whatsapp_link, 'svg');
await Bun.write('examples/output/whatsapp_qr.svg', whatsapp_qr);
console.log('  ✓ Generated: examples/output/whatsapp_qr.svg\n');

// 10. Bitcoin Payment
console.log('10. Bitcoin Payment Examples:');
const bitcoin_payment = encode_bitcoin('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {
  amount: 0.001,
  label: 'Coffee Donation',
  message: 'Thanks for the coffee!'
});
console.log(`  Bitcoin payment: ${bitcoin_payment}`);

const bitcoin_qr = encode_qr(bitcoin_payment, 'svg', { ecc: 'quartile' });
await Bun.write('examples/output/bitcoin_qr.svg', bitcoin_qr);
console.log('  ✓ Generated: examples/output/bitcoin_qr.svg\n');

// 11. Combining with different output formats
console.log('11. Different Output Format Examples:');

// ASCII art for terminal display
const ascii_qr = encode_qr(encode_url('https://github.com'), 'ascii');
console.log('  ASCII QR Code:');
console.log(ascii_qr);

// Terminal-friendly format with colors
const term_qr = encode_qr(encode_url('https://github.com'), 'term');
console.log('\n  Terminal QR Code:');
console.log(term_qr);

// GIF image
const gif_qr = encode_qr(encode_url('https://github.com'), 'gif', { scale: 4 });
await Bun.write('examples/output/github_qr.gif', gif_qr);
console.log('  ✓ Generated: examples/output/github_qr.gif\n');

// 12. Advanced options
console.log('12. Advanced QR Code Options:');

// High error correction for damaged codes
const high_ecc_qr = encode_qr(encode_url('https://example.com'), 'svg', {
  ecc: 'high', // 30% error correction
  border: 4,
  scale: 10
});
await Bun.write('examples/output/high_ecc_qr.svg', high_ecc_qr);
console.log('  ✓ Generated high ECC QR: examples/output/high_ecc_qr.svg');

// Custom version and mask
const custom_qr = encode_qr(encode_url('https://example.com'), 'svg', { version: 5, mask: 3, border: 2 });
await Bun.write('examples/output/custom_qr.svg', custom_qr);
console.log('  ✓ Generated custom QR: examples/output/custom_qr.svg\n');

console.log('=== All examples completed! ===');
console.log('Check the examples/output/ directory for generated QR codes.');
