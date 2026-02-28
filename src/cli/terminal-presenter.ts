import type { OutputPresenter } from './types';

const ANSI_RESET = '\x1b[0m';

export class BunTerminalPresenter implements OutputPresenter {
  printInfo(message: string): void {
    console.log(this.colorize(message, 'deepskyblue'));
  }

  printSuccess(message: string): void {
    console.log(this.colorize(message, 'mediumseagreen'));
  }

  printError(message: string): void {
    console.error(this.colorize(message, 'crimson'));
  }

  private colorize(message: string, color: string): string {
    const ansi = Bun.color(color, 'ansi');
    if (!ansi) {
      return message;
    }

    return `${ansi}${message}${ANSI_RESET}`;
  }
}
