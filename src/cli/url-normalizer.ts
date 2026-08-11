import { SAFE_URL_SCHEMES } from '../links';
import type { UrlNormalizer } from './types';

/**
 * Matches any RFC 3986 scheme prefix, including scheme-only URIs like `mailto:` (no `//`).
 * The negative lookahead keeps bare `host:port` inputs (e.g. `localhost:3000`) from being
 * misread as a scheme named `localhost`.
 */
const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):(?!\d+(?:[/?#]|$))/i;

export class DefaultUrlNormalizer implements UrlNormalizer {
  normalize(input: string): string {
    const value = input.trim();
    if (value.length === 0) {
      throw new Error('URL is required.');
    }

    const scheme = this.schemeOf(value);
    if (scheme !== undefined && !SAFE_URL_SCHEMES.has(scheme)) {
      throw new Error(`Unsupported URL scheme: ${scheme}. Only http and https URLs are supported.`);
    }

    const withProtocol = scheme === undefined ? `https://${value}` : value;
    const parsed = new URL(withProtocol);

    if (!SAFE_URL_SCHEMES.has(parsed.protocol)) {
      throw new Error('Only http and https URLs are supported.');
    }

    return parsed.toString();
  }

  /** Returns the lowercased scheme (with trailing colon), or undefined when the input has none. */
  private schemeOf(value: string): string | undefined {
    const match = SCHEME_PATTERN.exec(value);
    if (!match) {
      return undefined;
    }

    return `${match[1]?.toLowerCase()}:`;
  }
}
