#!/usr/bin/env bun

import { QrCliApplication } from './cli/app';

const app = new QrCliApplication();
const exitCode = await app.run(Bun.argv.slice(2));

if (exitCode !== 0) {
  throw new Error(`Exit code: ${exitCode}`);
}
