export type CliOutputFormat = 'svg' | 'gif' | 'ascii' | 'term';

export interface CliArgs {
  readonly url: string;
  readonly format: CliOutputFormat;
  readonly outputPath?: string;
}

export interface UrlNormalizer {
  normalize(input: string): string;
}

export interface QrGenerator {
  generate(payload: string, format: CliOutputFormat): string | Uint8Array;
}

export interface OutputPresenter {
  printInfo(message: string): void;
  printSuccess(message: string): void;
  printError(message: string): void;
}
