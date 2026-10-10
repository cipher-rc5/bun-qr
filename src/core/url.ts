/** RFC 3986 scheme syntax. A numeric URI body is still an explicit scheme. */
const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;
const HOST_PORT_PATTERN = /^(?:localhost|[a-z0-9-]+(?:\.[a-z0-9-]+)+):\d+(?:[/?#]|$)/i;

/** Return a lowercased explicit scheme, including its trailing colon. */
export function url_scheme(value: string): string | undefined {
  // Keep documented localhost/domain:port shorthand. Other single-label hosts
  // with ports need an explicit http(s):// to disambiguate them from URI schemes.
  if (HOST_PORT_PATTERN.test(value)) return undefined;
  const scheme = SCHEME_PATTERN.exec(value)?.[1];
  return scheme === undefined ? undefined : `${scheme.toLowerCase()}:`;
}

/** Only these schemes are safe for URL QR helpers. */
export function is_safe_url_scheme(scheme: string): boolean {
  return scheme === 'http:' || scheme === 'https:';
}
