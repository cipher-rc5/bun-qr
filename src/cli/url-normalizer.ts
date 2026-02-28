import type { UrlNormalizer } from './types';

export class DefaultUrlNormalizer implements UrlNormalizer {
  normalize(input: string): string {
    const value = input.trim();
    if (value.length === 0) {
      throw new Error('URL is required.');
    }

    const withProtocol = this.hasScheme(value) ? value : `https://${value}`;
    const parsed = new URL(withProtocol);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http and https URLs are supported.');
    }

    return parsed.toString();
  }

  private hasScheme(value: string): boolean {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  }
}
