#!/usr/bin/env bun

import { QrCliApplication } from './cli/app';

const app = new QrCliApplication();
const exitCode = await app.run(Bun.argv.slice(2));

// process.exit sets the status without the stack trace that `throw` would print
// over the presenter's clean error message.
process.exit(exitCode);
