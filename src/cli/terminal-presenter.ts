import type { OutputPresenter } from './types';

const ANSI_RESET = '\x1b[0m';

export class BunTerminalPresenter implements OutputPresenter {
  /** Artifact/primary output — stdout, so it can be piped or redirected cleanly. */
  printInfo(message: string): void {
    console.log(this.colorize(message, 'deepskyblue', process.stdout.isTTY === true));
  }

  /** Status chatter — stderr, so it never contaminates the piped artifact. */
  printSuccess(message: string): void {
    console.error(this.colorize(message, 'mediumseagreen', process.stderr.isTTY === true));
  }

  printError(message: string): void {
    console.error(this.colorize(message, 'crimson', process.stderr.isTTY === true));
  }

  private colorize(message: string, color: string, isTty: boolean): string {
    // Never emit ANSI escapes into a pipe or file — it corrupts redirected output.
    // stdout and stderr are checked independently since either may be redirected alone.
    if (!isTty) {
      return message;
    }

    // Bun.color already honours NO_COLOR and TERM=dumb.
    const ansi = Bun.color(color, 'ansi');
    if (!ansi) {
      return message;
    }

    return `${ansi}${message}${ANSI_RESET}`;
  }
}
