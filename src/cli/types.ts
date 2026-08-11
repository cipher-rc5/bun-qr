export type CliOutputFormat = 'svg' | 'gif' | 'ascii' | 'term';

export interface CliArgs {
  /** True when --help/-h was requested; url is not meaningful in that case. */
  readonly help: boolean;
  readonly url: string;
  readonly format: CliOutputFormat;
  /** Allow overwriting an existing output file. */
  readonly force: boolean;
  readonly outputPath?: string;
  readonly size?: number;
}

export interface UrlNormalizer {
  normalize(input: string): string;
}

export interface QrGenerator {
  generate(payload: string, format: CliOutputFormat, size?: number): string | Uint8Array;
}

export interface OutputPresenter {
  printInfo(message: string): void;
  printSuccess(message: string): void;
  printError(message: string): void;
}
