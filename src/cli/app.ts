import { helpText, parseCliArgs } from './args-parser';
import { BunQrGenerator } from './qr-generator';
import { BunTerminalPresenter } from './terminal-presenter';
import type { CliArgs, OutputPresenter, QrGenerator, UrlNormalizer } from './types';
import { DefaultUrlNormalizer } from './url-normalizer';

export class QrCliApplication {
  constructor (
    private readonly normalizer: UrlNormalizer = new DefaultUrlNormalizer(),
    private readonly generator: QrGenerator = new BunQrGenerator(),
    private readonly presenter: OutputPresenter = new BunTerminalPresenter()
  ) {}

  async run(argv: readonly string[]): Promise<number> {
    let args: CliArgs;

    try {
      args = parseCliArgs(argv);
    } catch (error: unknown) {
      const message = this.errorMessage(error);
      if (message === helpText()) {
        this.presenter.printInfo(message);
        return 0;
      }
      this.presenter.printError(message);
      return 1;
    }

    try {
      const normalized = this.normalizer.normalize(args.url);
      const output = this.generator.generate(normalized, args.format);
      await this.handleOutput(args, output);
      this.presenter.printSuccess('QR generation completed.');
      return 0;
    } catch (error: unknown) {
      this.presenter.printError(this.errorMessage(error));
      return 1;
    }
  }

  private async handleOutput(args: CliArgs, output: string | Uint8Array): Promise<void> {
    if (args.format === 'ascii' || args.format === 'term') {
      const asText = typeof output === 'string' ? output : new TextDecoder().decode(output);
      this.presenter.printInfo(asText);
      return;
    }

    const extension = args.format === 'gif' ? 'gif' : 'svg';
    const outputPath = args.outputPath ?? `qr-code.${extension}`;
    await Bun.write(outputPath, output);
    this.presenter.printInfo(`Saved QR file to ${outputPath}`);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'An unknown error occurred.';
  }
}
