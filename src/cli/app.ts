import { helpText, MissingUrlError, parseCliArgs } from './args-parser';
import { BunQrGenerator } from './qr-generator';
import { BunTerminalPresenter } from './terminal-presenter';
import type { CliArgs, OutputPresenter, QrGenerator, UrlNormalizer } from './types';
import { DefaultUrlNormalizer } from './url-normalizer';

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
/** Usage error: invoked with no url. Distinct from a runtime failure so scripts can tell them apart. */
export const EXIT_USAGE = 2;

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
      // Missing <url> is a usage error: help goes to stderr and the exit code is non-zero
      // so callers can detect it. Other parse failures are plain errors.
      if (error instanceof MissingUrlError) {
        this.presenter.printError(error.message);
        this.presenter.printError(helpText());
        return EXIT_USAGE;
      }
      this.presenter.printError(this.errorMessage(error));
      return EXIT_ERROR;
    }

    // --help is an explicit success path: help on stdout, exit 0.
    if (args.help) {
      this.presenter.printInfo(helpText());
      return EXIT_OK;
    }

    try {
      const normalized = this.normalizer.normalize(args.url);
      this.warnIfSizeIgnored(args);
      const output = this.generator.generate(normalized, args.format, args.size);
      await this.handleOutput(args, output);
      this.presenter.printSuccess('QR generation completed.');
      return EXIT_OK;
    } catch (error: unknown) {
      this.presenter.printError(this.errorMessage(error));
      return EXIT_ERROR;
    }
  }

  /**
   * --size only affects the svg renderer, which is the sole format that carries explicit
   * width/height attributes. Passing it with any other format used to be a silent no-op,
   * so the user got an unchanged artifact with no indication why. Warn rather than fail:
   * the request is unambiguous and the output is still correct, just not resized.
   */
  private warnIfSizeIgnored(args: CliArgs): void {
    if (args.size !== undefined && args.format !== 'svg') {
      this.presenter.printError(`Warning: --size is ignored for --format ${args.format}. It applies to svg output only.`);
    }
  }

  private async handleOutput(args: CliArgs, output: string | Uint8Array): Promise<void> {
    const isText = args.format === 'ascii' || args.format === 'term';

    if (isText) {
      const asText = typeof output === 'string' ? output : new TextDecoder().decode(output);

      // --output used to be dropped entirely for text formats: no file appeared, yet the run
      // still reported success. Writing the text is the least surprising reading of the flag.
      if (args.outputPath === undefined) {
        this.presenter.printInfo(asText);
        return;
      }

      await this.writeArtifact(args, args.outputPath, asText);
      return;
    }

    const extension = args.format === 'gif' ? 'gif' : 'svg';
    await this.writeArtifact(args, args.outputPath ?? `qr-code.${extension}`, output);
  }

  private async writeArtifact(args: CliArgs, outputPath: string, output: string | Uint8Array): Promise<void> {
    // Refuse to clobber existing files unless the user explicitly opted in with --force.
    // The check runs against the resolved path: Bun.write resolves `..` and creates missing
    // intermediate directories, but Bun.file(...).exists() on an unresolved traversing path
    // reports false, which would let the guard be bypassed.
    if (!args.force && await Bun.file(this.resolvePath(outputPath)).exists()) {
      throw new Error(
        `Refusing to overwrite existing file: ${outputPath}. Pass --force (-F) to overwrite it, or choose a different --output path.`
      );
    }

    await Bun.write(outputPath, output);
    this.presenter.printSuccess(`Saved QR file to ${outputPath}`);
  }

  /**
   * Lexically resolve `.` and `..` against the cwd without touching the filesystem,
   * so the overwrite guard sees the same file Bun.write would target.
   */
  private resolvePath(path: string): string {
    try {
      const base = Bun.pathToFileURL(`${process.cwd()}/`);
      return Bun.fileURLToPath(new URL(path, base));
    } catch {
      // Fall back to the raw path if it is not URL-representable.
      return path;
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'An unknown error occurred.';
  }
}
