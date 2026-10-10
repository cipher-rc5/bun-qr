import { is_safe_url_scheme, url_scheme } from '../core/url';
import type { UrlNormalizer } from './types';

export class DefaultUrlNormalizer implements UrlNormalizer {
  normalize(input: string): string {
    const value = input.trim();
    if (value.length === 0) {
      throw new Error('URL is required.');
    }

    const scheme = url_scheme(value);
    if (scheme !== undefined && !is_safe_url_scheme(scheme)) {
      throw new Error(`Unsupported URL scheme: ${scheme}. Only http and https URLs are supported.`);
    }

    const withProtocol = scheme === undefined ? `https://${value}` : value;
    const parsed = new URL(withProtocol);

    if (!is_safe_url_scheme(parsed.protocol)) {
      throw new Error('Only http and https URLs are supported.');
    }

    return parsed.toString();
  }
}
