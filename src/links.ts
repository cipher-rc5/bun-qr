// file: src/links.ts
// description: Utilities for encoding links and structured data in QR codes

import './runtime';
import { is_safe_url_scheme, url_scheme } from './core/url';

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
  /** Display name (FN); otherwise derived from personal names or organization. */
  formatted_name?: string;
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

/** The only security types the WIFI: payload format defines. Enforced at runtime — the TS union is erased. */
export const WIFI_SECURITY_TYPES: readonly ['WPA', 'WEP', 'nopass'] = ['WPA', 'WEP', 'nopass'];

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

/** Informational scheme set; the internal HTTP/HTTPS policy does not depend on mutations to this set. */
export const SAFE_URL_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:']);

export function validate_url(url: string): boolean {
  try {
    const parsed = new URL(url);
    return is_safe_url_scheme(parsed.protocol);
  } catch {
    return false;
  }
}

function validate_email(email: string): boolean {
  // Unquoted dot-atom addresses. URI punctuation is valid in a local part, but
  // never in a DNS domain or as trailing mailto fields.
  const email_regex =
    /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
  return email_regex.test(email);
}

function normalize_phone(phone: string): string {
  const trimmed = phone.trim();
  // Only one leading plus, digits and common presentation characters. Tabs and
  // line breaks are rejected rather than silently changing the destination.
  if (!/^\+?[\d ()-]+$/.test(trimmed) || !/\d/.test(trimmed)) {
    throw new Error(`Invalid phone number: ${phone}`);
  }
  return trimmed.replace(/[ ()-]/g, '');
}

/** Returns true if `str` contains ASCII control characters (null, tab, newline, etc.) */
function has_control_chars(str: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally detects ASCII control characters to reject unsafe link inputs.
  return /[\x00-\x1f\x7f]/.test(str);
}

function escape_vcard(text: string): string {
  // RFC 6350 §3.2: every line break in a property value is escaped as "\n", regardless
  // of whether the source used CRLF, a bare CR, or a bare LF. CRLF must be collapsed
  // first so it does not become a doubled escape.
  return text.replace(/[,;\\]/g, '\\$&').replace(/\r\n/g, '\\n').replace(/[\r\n]/g, '\\n');
}

/** RFC content lines use CRLF and fold at 75 UTF-8 octets without splitting a code point. */
function serialize_content_lines(lines: readonly string[]): string {
  const folded: string[] = [];
  for (const line of lines) {
    let physical = '';
    let bytes = 0;
    for (const character of line) {
      const code = character.codePointAt(0) ?? 0;
      const length = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
      if (bytes + length > 75) {
        folded.push(physical);
        physical = ' ';
        bytes = 1;
      }
      physical += character;
      bytes += length;
    }
    folded.push(physical);
  }
  return `${folded.join('\r\n')}\r\n`;
}

/** Throws if `date` is not a valid Date, naming `field` so the caller knows which input failed. */
function assert_valid_date(date: Date, field: string): void {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${field}: ${String(date)}. Expected a valid Date`);
  }
  if (date.getUTCFullYear() < 0 || date.getUTCFullYear() > 9999) {
    throw new Error(`Invalid ${field}: calendar dates require a four-digit UTC year`);
  }
}

function format_iso_date(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
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
  if (auto_protocol && url_scheme(formatted_url) === undefined) {
    formatted_url = `https://${formatted_url}`;
  }

  if (has_control_chars(formatted_url) || !validate_url(formatted_url)) {
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

  // Encode local-part punctuation so it cannot become URI query/fragment syntax.
  const [local, domain] = email.split('@');
  let result = `mailto:${encodeURIComponent(local ?? '')}@${domain}`;
  const params: string[] = [];

  if (opts.subject) params.push(`subject=${encodeURIComponent(opts.subject)}`);
  if (opts.body) params.push(`body=${encodeURIComponent(opts.body)}`);
  if (opts.cc) params.push(`cc=${encodeURIComponent(opts.cc)}`);
  if (opts.bcc) params.push(`bcc=${encodeURIComponent(opts.bcc)}`);

  if (params.length > 0) {
    result += `?${params.join('&')}`;
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
  return `tel:${normalize_phone(phone)}`;
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
  const formatted = normalize_phone(phone);
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
/**
 * Create a vCard 4.0 (RFC 6350) contact QR code string
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
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:4.0'];

  if (opts.email && !validate_email(opts.email)) {
    throw new Error(`Invalid email in vCard: ${opts.email}`);
  }
  const name = opts.formatted_name?.trim() || [opts.first_name?.trim(), opts.last_name?.trim()].filter(Boolean).join(' ') ||
    opts.organization?.trim();
  if (!name) throw new Error('A vCard formatted name, personal name, or organization is required');
  lines.push(`FN:${escape_vcard(name)}`);

  // Name (N: Family;Given;Additional;Prefix;Suffix)
  if (opts.first_name || opts.last_name) {
    const last = escape_vcard(opts.last_name || '');
    const first = escape_vcard(opts.first_name || '');
    lines.push(`N:${last};${first};;;`);
  }

  // Organization and title
  if (opts.organization) {
    lines.push(`ORG:${escape_vcard(opts.organization)}`);
  }
  if (opts.title) {
    lines.push(`TITLE:${escape_vcard(opts.title)}`);
  }

  // Contact info — RFC 6350 uses TYPE parameter
  if (opts.phone) {
    const cleaned = normalize_phone(opts.phone);
    lines.push(`TEL;TYPE=voice:tel:${cleaned}`);
  }
  if (opts.email) {
    lines.push(`EMAIL;TYPE=work:${opts.email}`);
  }
  if (opts.url) {
    // RFC 6350 URL values are URIs, not TEXT: validate the boundary, then let the
    // URL serializer encode spaces/non-ASCII without introducing text escapes.
    const website = new URL(encode_url(opts.url)).toString();
    lines.push(`URL;TYPE=work:${website}`);
  }

  // Address — RFC 6350: PO Box;Extended;Street;City;State;Postal;Country
  if (opts.address) {
    const addr = opts.address;
    const parts = [
      '',
      '',
      escape_vcard(addr.street || ''),
      escape_vcard(addr.city || ''),
      escape_vcard(addr.state || ''),
      escape_vcard(addr.zip || ''),
      escape_vcard(addr.country || '')
    ];
    lines.push(`ADR;TYPE=work:${parts.join(';')}`);
  }

  // Note
  if (opts.note) {
    lines.push(`NOTE:${escape_vcard(opts.note)}`);
  }

  lines.push('END:VCARD');

  return serialize_content_lines(lines);
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
  if (has_control_chars(ssid)) {
    throw new Error('WiFi SSID contains invalid control characters (null bytes, tabs, newlines, etc.)');
  }
  if (password && has_control_chars(password)) {
    throw new Error('WiFi password contains invalid control characters (null bytes, tabs, newlines, etc.)');
  }
  // The `security` value is interpolated as the `T:` field verbatim, so an unvalidated
  // string could close the field and forge the rest of the payload (e.g. a different
  // SSID). Only three values are legal, so allowlist them rather than escaping.
  if (!(WIFI_SECURITY_TYPES as readonly string[]).includes(security)) {
    throw new Error(`Invalid security=${security}. Expected one of ${WIFI_SECURITY_TYPES.join(', ')}`);
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

  // Number.isFinite first: NaN fails both range comparisons, and Infinity only fails one
  // side, so a bare `<`/`>` pair would let both through into the payload.
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error(`Invalid latitude: ${latitude}. Must be a finite number between -90 and 90`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error(`Invalid longitude: ${longitude}. Must be a finite number between -180 and 180`);
  }

  let result = `geo:${latitude},${longitude}`;

  if (altitude !== undefined) {
    if (!Number.isFinite(altitude)) {
      throw new Error(`Invalid altitude: ${altitude}. Must be a finite number in meters`);
    }
    result += `,${altitude}`;
  }

  const params: string[] = [];
  if (uncertainty !== undefined) {
    if (!Number.isFinite(uncertainty) || uncertainty < 0) {
      throw new Error(`Invalid uncertainty: ${uncertainty}. Must be a finite non-negative number in meters`);
    }
    params.push(`u=${uncertainty}`);
  }

  if (params.length > 0) {
    result += `?${params.join('&')}`;
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
 *   start: new Date('2024-02-01T14:00:00Z'),
 *   end: new Date('2024-02-01T15:00:00Z'),
 *   location: 'Conference Room A',
 *   description: 'Weekly team sync'
 * });
 * ```
 */
export function encode_calendar_event(opts: CalendarEventOptions): string {
  const { title, start, end, location, description, all_day = false } = opts;

  // Validate up front so both branches fail the same way instead of one throwing a raw
  // RangeError from toISOString and the other silently emitting an empty DTSTART.
  assert_valid_date(start, 'calendar event start');
  if (end !== undefined) {
    assert_valid_date(end, 'calendar event end');
  }

  // Compare serialized values: all-day dates use UTC days, timed stamps use
  // whole seconds. Distinct Date instances can otherwise emit equal endpoints.
  const start_value = all_day ? start.toISOString().slice(0, 10).replace(/-/g, '') : format_iso_date(start);
  const end_value = end === undefined ? undefined : all_day ? end.toISOString().slice(0, 10).replace(/-/g, '') : format_iso_date(end);
  if (end_value !== undefined && end_value <= start_value) {
    throw new Error('Calendar event end must be after start in the emitted date format');
  }

  const lines: string[] = ['BEGIN:VEVENT', `SUMMARY:${escape_vcard(title)}`];

  if (all_day) {
    lines.push(`DTSTART;VALUE=DATE:${start_value}`);
    if (end_value !== undefined) lines.push(`DTEND;VALUE=DATE:${end_value}`);
  } else {
    lines.push(`DTSTART:${start_value}`);
    if (end_value !== undefined) lines.push(`DTEND:${end_value}`);
  }

  if (location) {
    lines.push(`LOCATION:${escape_vcard(location)}`);
  }
  if (description) {
    lines.push(`DESCRIPTION:${escape_vcard(description)}`);
  }

  lines.push('END:VEVENT');

  return serialize_content_lines(lines);
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
  const formatted = normalize_phone(phone).replace(/^\+/, '');
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
  const cleaned = address.trim().replace(/^bitcoin:/i, '');

  if (!cleaned) {
    throw new Error('Bitcoin address is required');
  }
  // Accept address text or one bitcoin: prefix, never a prebuilt query or URI.
  // This validates the payload boundary, not the address checksum/network.
  if (!/^[A-Za-z0-9]+$/.test(cleaned)) {
    throw new Error(`Invalid Bitcoin address: ${address}. Expected an alphanumeric address`);
  }

  let result = `bitcoin:${cleaned}`;
  const params: string[] = [];

  if (opts.amount !== undefined) {
    if (!Number.isFinite(opts.amount) || opts.amount < 0) {
      throw new Error(`Invalid Bitcoin amount: ${opts.amount}. Must be a finite non-negative number of BTC`);
    }
    if (opts.amount > 21_000_000) throw new Error('Invalid Bitcoin amount: exceeds 21000000 BTC');
    const decimal = opts.amount.toFixed(8);
    if (Number(decimal) !== opts.amount) {
      throw new Error('Invalid Bitcoin amount: must be representable with at most 8 decimal places (whole satoshis)');
    }
    params.push(`amount=${decimal.replace(/\.?0+$/, '')}`);
  }
  if (opts.label) {
    params.push(`label=${encodeURIComponent(opts.label)}`);
  }
  if (opts.message) {
    params.push(`message=${encodeURIComponent(opts.message)}`);
  }

  if (params.length > 0) {
    result += `?${params.join('&')}`;
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
