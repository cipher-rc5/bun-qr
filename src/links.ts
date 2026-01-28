// file: src/links.ts
// description: Utilities for encoding links and structured data in QR codes

/**
 * URL/Link encoding utilities for QR codes
 *
 * This module provides helper functions to create properly formatted
 * strings for common QR code use cases like URLs, emails, phone numbers,
 * WiFi credentials, vCards, and more.
 */

// Type definitions for link options

export interface UrlOptions {
  /** Automatically add https:// if no protocol specified */
  auto_protocol?: boolean;
}

export interface EmailOptions {
  subject?: string;
  body?: string;
  cc?: string;
  bcc?: string;
}

export interface SmsOptions {
  body?: string;
}

export interface VCardOptions {
  first_name?: string;
  last_name?: string;
  organization?: string;
  title?: string;
  phone?: string;
  email?: string;
  url?: string;
  address?: { street?: string, city?: string, state?: string, zip?: string, country?: string };
  note?: string;
}

export interface WifiOptions {
  ssid: string;
  password?: string;
  /** Security type: WPA, WEP, or nopass (open network) */
  security?: 'WPA' | 'WEP' | 'nopass';
  /** Hidden network */
  hidden?: boolean;
}

export interface GeoOptions {
  latitude: number;
  longitude: number;
  /** Altitude in meters */
  altitude?: number;
  /** Uncertainty in meters */
  uncertainty?: number;
}

export interface CalendarEventOptions {
  title: string;
  start: Date;
  end?: Date;
  location?: string;
  description?: string;
  all_day?: boolean;
}

// Validation helpers

function validate_url(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function validate_email(email: string): boolean {
  const email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return email_regex.test(email);
}

function validate_phone(phone: string): boolean {
  // Allow digits, spaces, hyphens, parentheses, and plus sign
  const phone_regex = /^[\d\s\-\+\(\)]+$/;
  return phone_regex.test(phone);
}

function escape_vcard(text: string): string {
  return text.replace(/[,;\\]/g, '\\$&').replace(/\n/g, '\\n');
}

function format_iso_date(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// URL encoding functions

/**
 * Create a URL QR code string with automatic protocol handling
 *
 * @example
 * ```typescript
 * const url = encode_url('example.com');
 * // Returns: "https://example.com"
 *
 * const qr = encode_qr(url, 'svg');
 * ```
 */
export function encode_url(url: string, opts: UrlOptions = {}): string {
  const { auto_protocol = true } = opts;

  let formatted_url = url.trim();

  // Add https:// if no protocol specified
  if (auto_protocol && !formatted_url.match(/^[a-zA-Z]+:\/\//)) {
    formatted_url = 'https://' + formatted_url;
  }

  if (!validate_url(formatted_url)) {
    throw new Error(`Invalid URL: ${url}`);
  }

  return formatted_url;
}

/**
 * Create an email QR code string with optional subject and body
 *
 * @example
 * ```typescript
 * const email = encode_email('hello@example.com', {
 *   subject: 'Hello',
 *   body: 'Thanks for scanning!'
 * });
 * // Returns: "mailto:hello@example.com?subject=Hello&body=Thanks%20for%20scanning!"
 * ```
 */
export function encode_email(email: string, opts: EmailOptions = {}): string {
  if (!validate_email(email)) {
    throw new Error(`Invalid email address: ${email}`);
  }

  let result = `mailto:${email}`;
  const params: string[] = [];

  if (opts.subject) params.push(`subject=${encodeURIComponent(opts.subject)}`);
  if (opts.body) params.push(`body=${encodeURIComponent(opts.body)}`);
  if (opts.cc) params.push(`cc=${encodeURIComponent(opts.cc)}`);
  if (opts.bcc) params.push(`bcc=${encodeURIComponent(opts.bcc)}`);

  if (params.length > 0) {
    result += '?' + params.join('&');
  }

  return result;
}

/**
 * Create a phone number QR code string
 *
 * @example
 * ```typescript
 * const phone = encode_phone('+1-555-123-4567');
 * // Returns: "tel:+15551234567"
 * ```
 */
export function encode_phone(phone: string): string {
  const cleaned = phone.trim();

  if (!validate_phone(cleaned)) {
    throw new Error(`Invalid phone number: ${phone}`);
  }

  // Remove all non-digit characters except leading +
  const formatted = cleaned.replace(/[^\d+]/g, '');

  return `tel:${formatted}`;
}

/**
 * Create an SMS QR code string with optional message body
 *
 * @example
 * ```typescript
 * const sms = encode_sms('+1-555-123-4567', { body: 'Hello there!' });
 * // Returns: "sms:+15551234567?body=Hello%20there!"
 * ```
 */
export function encode_sms(phone: string, opts: SmsOptions = {}): string {
  const cleaned = phone.trim();

  if (!validate_phone(cleaned)) {
    throw new Error(`Invalid phone number: ${phone}`);
  }

  const formatted = cleaned.replace(/[^\d+]/g, '');
  let result = `sms:${formatted}`;

  if (opts.body) {
    result += `?body=${encodeURIComponent(opts.body)}`;
  }

  return result;
}

/**
 * Create a vCard (contact information) QR code string
 *
 * @example
 * ```typescript
 * const vcard = encode_vcard({
 *   first_name: 'John',
 *   last_name: 'Doe',
 *   organization: 'Acme Inc',
 *   phone: '+1-555-123-4567',
 *   email: 'john@example.com',
 *   url: 'https://example.com'
 * });
 * ```
 */
export function encode_vcard(opts: VCardOptions): string {
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];

  // Name
  if (opts.first_name || opts.last_name) {
    const last = escape_vcard(opts.last_name || '');
    const first = escape_vcard(opts.first_name || '');
    lines.push(`N:${last};${first};;;`);
    lines.push(`FN:${first} ${last}`.trim());
  }

  // Organization and title
  if (opts.organization) {
    lines.push(`ORG:${escape_vcard(opts.organization)}`);
  }
  if (opts.title) {
    lines.push(`TITLE:${escape_vcard(opts.title)}`);
  }

  // Contact info
  if (opts.phone) {
    const cleaned = opts.phone.replace(/[^\d+]/g, '');
    lines.push(`TEL:${cleaned}`);
  }
  if (opts.email) {
    if (!validate_email(opts.email)) {
      throw new Error(`Invalid email in vCard: ${opts.email}`);
    }
    lines.push(`EMAIL:${opts.email}`);
  }
  if (opts.url) {
    lines.push(`URL:${opts.url}`);
  }

  // Address
  if (opts.address) {
    const addr = opts.address;
    const parts = [
      '', // PO Box (not used)
      '', // Extended address (not used)
      escape_vcard(addr.street || ''),
      escape_vcard(addr.city || ''),
      escape_vcard(addr.state || ''),
      escape_vcard(addr.zip || ''),
      escape_vcard(addr.country || '')
    ];
    lines.push(`ADR:${parts.join(';')}`);
  }

  // Note
  if (opts.note) {
    lines.push(`NOTE:${escape_vcard(opts.note)}`);
  }

  lines.push('END:VCARD');

  return lines.join('\n');
}

/**
 * Create a WiFi network QR code string
 *
 * Scanning this QR code allows devices to automatically connect to WiFi
 *
 * @example
 * ```typescript
 * const wifi = encode_wifi({
 *   ssid: 'MyNetwork',
 *   password: 'secret123',
 *   security: 'WPA'
 * });
 * // Returns: "WIFI:T:WPA;S:MyNetwork;P:secret123;;"
 * ```
 */
export function encode_wifi(opts: WifiOptions): string {
  const { ssid, password = '', security = 'WPA', hidden = false } = opts;

  if (!ssid) {
    throw new Error('WiFi SSID is required');
  }

  // Escape special characters in SSID and password
  const escape_wifi = (str: string) => str.replace(/[\\";,:]/g, '\\$&');

  const parts: string[] = [`T:${security}`, `S:${escape_wifi(ssid)}`, `P:${escape_wifi(password)}`, hidden ? 'H:true' : ''].filter(Boolean);

  return `WIFI:${parts.join(';')};;`;
}

/**
 * Create a geographic location (geo URI) QR code string
 *
 * @example
 * ```typescript
 * const geo = encode_geo({
 *   latitude: 37.7749,
 *   longitude: -122.4194,
 *   altitude: 10
 * });
 * // Returns: "geo:37.7749,-122.4194,10"
 * ```
 */
export function encode_geo(opts: GeoOptions): string {
  const { latitude, longitude, altitude, uncertainty } = opts;

  if (latitude < -90 || latitude > 90) {
    throw new Error(`Invalid latitude: ${latitude}. Must be between -90 and 90`);
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error(`Invalid longitude: ${longitude}. Must be between -180 and 180`);
  }

  let result = `geo:${latitude},${longitude}`;

  if (altitude !== undefined) {
    result += `,${altitude}`;
  }

  const params: string[] = [];
  if (uncertainty !== undefined) {
    params.push(`u=${uncertainty}`);
  }

  if (params.length > 0) {
    result += '?' + params.join('&');
  }

  return result;
}

/**
 * Create a calendar event (iCalendar) QR code string
 *
 * @example
 * ```typescript
 * const event = encode_calendar_event({
 *   title: 'Team Meeting',
 *   start: new Date('2024-02-01T14:00:00'),
 *   end: new Date('2024-02-01T15:00:00'),
 *   location: 'Conference Room A',
 *   description: 'Weekly team sync'
 * });
 * ```
 */
export function encode_calendar_event(opts: CalendarEventOptions): string {
  const { title, start, end, location, description, all_day = false } = opts;

  const lines: string[] = ['BEGIN:VEVENT', `SUMMARY:${escape_vcard(title)}`];

  if (all_day) {
    const date_str = start.toISOString().split('T')[0]?.replace(/-/g, '') ?? '';
    lines.push(`DTSTART;VALUE=DATE:${date_str}`);
    if (end) {
      const end_date_str = end.toISOString().split('T')[0]?.replace(/-/g, '') ?? '';
      lines.push(`DTEND;VALUE=DATE:${end_date_str}`);
    }
  } else {
    lines.push(`DTSTART:${format_iso_date(start)}`);
    if (end) {
      lines.push(`DTEND:${format_iso_date(end)}`);
    }
  }

  if (location) {
    lines.push(`LOCATION:${escape_vcard(location)}`);
  }
  if (description) {
    lines.push(`DESCRIPTION:${escape_vcard(description)}`);
  }

  lines.push('END:VEVENT');

  return lines.join('\n');
}

/**
 * Create a WhatsApp message QR code string
 *
 * @example
 * ```typescript
 * const whatsapp = encode_whatsapp('+15551234567', 'Hello from QR code!');
 * // Returns: "https://wa.me/15551234567?text=Hello%20from%20QR%20code!"
 * ```
 */
export function encode_whatsapp(phone: string, message?: string): string {
  const cleaned = phone.trim().replace(/[^\d+]/g, '');

  if (!validate_phone(phone)) {
    throw new Error(`Invalid phone number: ${phone}`);
  }

  // Remove leading + for wa.me format
  const formatted = cleaned.replace(/^\+/, '');
  let result = `https://wa.me/${formatted}`;

  if (message) {
    result += `?text=${encodeURIComponent(message)}`;
  }

  return result;
}

/**
 * Create a Bitcoin payment QR code string
 *
 * @example
 * ```typescript
 * const bitcoin = encode_bitcoin('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {
 *   amount: 0.001,
 *   label: 'Donation',
 *   message: 'Thanks for your support!'
 * });
 * ```
 */
export function encode_bitcoin(address: string, opts: { amount?: number, label?: string, message?: string } = {}): string {
  if (!address) {
    throw new Error('Bitcoin address is required');
  }

  let result = `bitcoin:${address}`;
  const params: string[] = [];

  if (opts.amount !== undefined) {
    params.push(`amount=${opts.amount}`);
  }
  if (opts.label) {
    params.push(`label=${encodeURIComponent(opts.label)}`);
  }
  if (opts.message) {
    params.push(`message=${encodeURIComponent(opts.message)}`);
  }

  if (params.length > 0) {
    result += '?' + params.join('&');
  }

  return result;
}

// Export all types and functions
export default {
  encode_url,
  encode_email,
  encode_phone,
  encode_sms,
  encode_vcard,
  encode_wifi,
  encode_geo,
  encode_calendar_event,
  encode_whatsapp,
  encode_bitcoin
};
