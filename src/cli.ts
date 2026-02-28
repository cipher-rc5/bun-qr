#!/usr/bin/env bun

import { QrCliApplication } from './cli/app';

const app = new QrCliApplication();
const exitCode = await app.run(Bun.argv.slice(2));

process.exit(exitCode);
